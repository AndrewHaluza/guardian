#!/usr/bin/env node

/**
 * Advanced stress test with monitoring of Docker container resources
 * Tests Guardian API under memory constraints with real-time stats
 */

const http = require('http');
const { execSync } = require('child_process');

const API_URL = 'http://localhost:3000/graphql';
const TEST_REPOS = [
  'https://github.com/AndrewHaluza/NodeGoat',
  'https://github.com/expressjs/express',
  'https://github.com/lodash/lodash',
];

// Test modes
const TESTS = {
  light: { concurrent: 5, total: 20, delay: 500 },
  moderate: { concurrent: 10, total: 50, delay: 300 },
  heavy: { concurrent: 20, total: 100, delay: 100 },
  extreme: { concurrent: 30, total: 150, delay: 50 },
};

let stats = {
  success: 0,
  failure: 0,
  capacity: 0,
  validation: 0,
  timeout: 0,
  other: 0,
  responseTimes: [],
};

function getContainerStats() {
  try {
    const output = execSync(
      "docker stats guardian-server --no-stream --format 'json'" +
        " 2>/dev/null || echo '{}'",
      { encoding: 'utf-8' }
    );
    if (output.trim() === '{}') return null;

    try {
      return JSON.parse(output);
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

function parseMemoryUsage(memStr) {
  if (!memStr) return null;
  const match = memStr.match(/(\d+\.?\d*)(MiB|GiB)/);
  if (!match) return null;
  const value = parseFloat(match[1]);
  return match[2] === 'GiB' ? value * 1024 : value;
}

async function sendRequest(repoUrl) {
  return new Promise((resolve) => {
    const query = JSON.stringify({
      query: `mutation { startScan(repoUrl: "${repoUrl}") { id status } }`,
    });

    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(query),
      },
    };

    const startTime = Date.now();
    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const responseTime = Date.now() - startTime;
        stats.responseTimes.push(responseTime);

        try {
          const parsed = JSON.parse(data);

          if (parsed.errors) {
            const errorMsg = parsed.errors[0]?.message || '';
            if (
              errorMsg.includes('at capacity') ||
              errorMsg.includes('maximum')
            ) {
              stats.capacity++;
            } else if (errorMsg.includes('allowed')) {
              stats.validation++;
            } else {
              stats.other++;
            }
            stats.failure++;
          } else if (parsed.data?.startScan?.id) {
            stats.success++;
          } else {
            stats.other++;
            stats.failure++;
          }
        } catch {
          stats.other++;
          stats.failure++;
        }

        resolve();
      });
    });

    req.on('error', () => {
      stats.timeout++;
      stats.failure++;
      resolve();
    });

    req.setTimeout(5000, () => {
      req.destroy();
      stats.timeout++;
      stats.failure++;
      resolve();
    });

    req.write(query);
    req.end();
  });
}

async function runBatch(batchSize, repos) {
  const promises = [];
  for (let i = 0; i < batchSize; i++) {
    const repo = repos[i % repos.length];
    promises.push(sendRequest(repo));
  }
  await Promise.all(promises);
}

function printStats() {
  const total = stats.success + stats.failure;
  const successRate = ((stats.success / total) * 100).toFixed(1);

  console.log('\n📊 Test Results:');
  console.log(`   Total Requests:    ${total}`);
  console.log(`   Success:           ${stats.success} (${successRate}%)`);
  console.log(`   Failures:          ${stats.failure}`);
  console.log(`   ├─ Capacity:       ${stats.capacity}`);
  console.log(`   ├─ Validation:     ${stats.validation}`);
  console.log(`   ├─ Timeout:        ${stats.timeout}`);
  console.log(`   └─ Other:          ${stats.other}`);

  if (stats.responseTimes.length > 0) {
    const sorted = stats.responseTimes.sort((a, b) => a - b);
    const avg = stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];

    console.log('\n⏱️  Response Time (ms):');
    console.log(`   Min:               ${min}`);
    console.log(`   P50:               ${p50}`);
    console.log(`   P95:               ${p95}`);
    console.log(`   P99:               ${p99}`);
    console.log(`   Max:               ${max}`);
    console.log(`   Avg:               ${avg.toFixed(0)}`);
  }
}

async function main() {
  const testMode = process.argv[2] || 'moderate';
  const config = TESTS[testMode];

  if (!config) {
    console.log('Usage: stress-test-advanced.js [light|moderate|heavy|extreme]');
    console.log('\nPresets:');
    Object.entries(TESTS).forEach(([name, cfg]) => {
      console.log(
        `  ${name}: ${cfg.concurrent} concurrent, ${cfg.total} total (${cfg.delay}ms delay)`
      );
    });
    process.exit(1);
  }

  console.log('🔥 Guardian Advanced Stress Test');
  console.log(`📋 Mode:             ${testMode.toUpperCase()}`);
  console.log(`📊 Configuration:`);
  console.log(`   - Concurrent:      ${config.concurrent}`);
  console.log(`   - Total:           ${config.total}`);
  console.log(`   - Batch Delay:     ${config.delay}ms`);
  console.log(`   - Test Repos:      ${TEST_REPOS.length}`);

  const containerStats = getContainerStats();
  if (containerStats) {
    console.log(`\n🐳 Container Status:`);
    console.log(`   - Memory Limit:    ${containerStats.MemoryLimit || 'N/A'}`);
    console.log(
      `   - Initial Usage:   ${containerStats.MemoryUsage || 'N/A'}`
    );
  }

  const totalBatches = Math.ceil(config.total / config.concurrent);
  const testStartTime = Date.now();

  for (let batch = 0; batch < totalBatches; batch++) {
    const batchSize = Math.min(
      config.concurrent,
      config.total - batch * config.concurrent
    );

    process.stdout.write(
      `\rBatch ${batch + 1}/${totalBatches} (${batchSize} req)...`
    );
    await runBatch(batchSize, TEST_REPOS);

    const completed = Math.min((batch + 1) * config.concurrent, config.total);
    const stats2 = getContainerStats();
    if (stats2) {
      const memUsage = parseMemoryUsage(stats2.MemoryUsage);
      if (memUsage) {
        process.stdout.write(` | ${memUsage.toFixed(0)}MB`);
      }
    }

    if (batch < totalBatches - 1) {
      await new Promise((resolve) => setTimeout(resolve, config.delay));
    }
  }

  const totalTime = Date.now() - testStartTime;
  console.log('\n');

  const finalStats = getContainerStats();
  if (finalStats) {
    console.log('🐳 Final Container Status:');
    const finalMem = parseMemoryUsage(finalStats.MemoryUsage);
    if (finalMem) {
      console.log(`   - Final Memory:    ${finalMem.toFixed(0)}MB`);
    }
    console.log(`   - CPU Usage:       ${finalStats.CPUPerc || 'N/A'}`);
  }

  printStats();

  const throughput = (config.total / (totalTime / 1000)).toFixed(2);
  console.log(`\n🚀 Performance:`);
  console.log(`   - Total Time:      ${totalTime}ms`);
  console.log(`   - Throughput:      ${throughput} req/s`);

  console.log('\n✨ Test complete!');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
