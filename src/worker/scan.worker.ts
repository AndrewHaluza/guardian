import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { isMainThread, parentPort } from 'worker_threads';
import { MongoClient } from 'mongodb';
import { parser } from 'stream-json';
import { pick } from 'stream-json/filters/Pick';
import { streamArray } from 'stream-json/streamers/StreamArray';
import { chain } from 'stream-chain';

import { ScanRepository } from '../repository/scan.repository';
import { getGuardianMongoUri, getMinimumSeverity, getMinFreeDiskSpace, getMaxFindings, getTrivyTimeout, getGitTimeout } from '../config';
import { Vulnerability, WorkerMessage } from '../types';
import { createLogger } from '../logger';

const logger = createLogger('ScanWorker');

// ---------------------------------------------------------------------------
// Orphan directory sweep (stale guardian-scan-* dirs from previous crashes)
// ---------------------------------------------------------------------------

export function sweepOrphanDirs(): void {
  const tmpdir = os.tmpdir();
  let entries: string[];
  try {
    entries = fs.readdirSync(tmpdir);
  } catch (err) {
    logger.warn('Failed to read tmpdir for orphan sweep', err);
    return;
  }

  entries
    .filter((e) => e.startsWith('guardian-scan-'))
    .forEach((e) => {
      const p = path.join(tmpdir, e);
      try {
        fs.rmSync(p, { recursive: true, force: true });
        logger.info(`Cleaned orphan dir: ${e}`);
      } catch (err) {
        logger.warn(`Failed to clean orphan dir ${e}`, err);
      }
    });
}

// ---------------------------------------------------------------------------
// Disk space guard: require at least 512 MB free (configurable via GUARDIAN_MIN_FREE_DISK_MB)
// ---------------------------------------------------------------------------

export function checkDiskSpace(dir: string): boolean {
  try {
    const stats = fs.statfsSync(dir);
    const freeBytes = stats.bavail * stats.bsize;
    const minFreeDiskSpace = getMinFreeDiskSpace();
    return freeBytes >= minFreeDiskSpace;
  } catch (err) {
    logger.warn('statfsSync failed, assuming disk space OK', err);
    return true; // fail open rather than blocking all scans
  }
}

// ---------------------------------------------------------------------------
// Git clone with configurable timeout (default: 120 seconds)
// ---------------------------------------------------------------------------

export function spawnGitClone(repoUrl: string, targetDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    logger.debug(`[Git] Spawning: git clone --depth=1 ${repoUrl} ${targetDir}`);
    const child = spawn('git', ['clone', '--depth=1', repoUrl, targetDir]);

    const gitTimeout = getGitTimeout();
    const timeout = setTimeout(() => {
      logger.error(`[Git] Clone timeout, killing process`);
      child.kill('SIGTERM');
      reject(new Error(`Git clone timeout (${gitTimeout}ms)`));
    }, gitTimeout);

    child.on('close', (code) => {
      clearTimeout(timeout);
      logger.debug(`[Git] Process closed with code ${code}`);
      if (code !== 0) {
        reject(new Error(`Git clone failed with code ${code}`));
      } else {
        logger.info(`[Git] Clone succeeded`);
        resolve();
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      logger.error(`[Git] Process error`, err);
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Trivy filesystem scan with configurable timeout (default: 300 seconds)
// ---------------------------------------------------------------------------

export function spawnTrivy(clonedDir: string, outputFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    logger.debug(`[Trivy] Spawning: trivy fs --format json --output ${outputFile} ${clonedDir}`);
    const child = spawn('trivy', [
      'fs',
      '--format', 'json',
      '--output', outputFile,
      clonedDir,
    ]);

    const trivyTimeout = getTrivyTimeout();
    const timeout = setTimeout(() => {
      logger.error(`[Trivy] Scan timeout, killing process`);
      child.kill('SIGTERM');
      reject(new Error(`Trivy scan timeout (${trivyTimeout}ms)`));
    }, trivyTimeout);

    child.on('close', (code) => {
      clearTimeout(timeout);
      logger.debug(`[Trivy] Process closed with code ${code}`);
      if (code !== 0) {
        reject(new Error(`Trivy scan failed with code ${code}`));
      } else {
        logger.info(`[Trivy] Scan succeeded`);
        resolve();
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      logger.error(`[Trivy] Process error`, err);
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Severity filtering helper
// ---------------------------------------------------------------------------

// Severity levels ranked from highest to lowest
const SEVERITY_RANK: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  UNKNOWN: 0,
};

function shouldIncludeVulnerability(vuln: Vulnerability, minSeverity: string): boolean {
  const vulnSeverity = vuln.Severity || 'UNKNOWN';
  const vulnRank = SEVERITY_RANK[vulnSeverity] ?? 0;
  const minRank = SEVERITY_RANK[minSeverity] ?? 0;
  return vulnRank >= minRank;
}

// ---------------------------------------------------------------------------
// Stream-json pipeline: parse trivy JSON, filter by configured severity, cap at max findings
// ---------------------------------------------------------------------------

export function createStreamPipeline(jsonFile: string, minSeverity: string = 'CRITICAL'): Promise<Vulnerability[]> {
  return new Promise((resolve, reject) => {
    const maxFindings = getMaxFindings();
    const filteredFindings: Vulnerability[] = [];
    let findingCount = 0;
    let aborted = false;
    let totalVulnerabilities = 0;
    const severityCounts: Record<string, number> = {};

    logger.info(`[Pipeline] Starting to parse trivy output: ${jsonFile}`);
    logger.info(`[Pipeline] Minimum severity level: ${minSeverity}`);
    logger.info(`[Pipeline] Maximum findings to report: ${maxFindings}`);

    const pipeline = chain([
      fs.createReadStream(jsonFile),
      parser(),
      pick({ filter: 'Results' }),
      streamArray(),
    ]);

    pipeline.on('data', (data: { key: number; value: unknown }) => {
      if (aborted) return;

      // data.value is the Results[i] object
      const result = data.value as Record<string, unknown> | null | undefined;
      const vulnerabilities = result?.Vulnerabilities;

      logger.debug(`[Pipeline] Processing result index ${data.key}`, { hasVulnerabilities: !!vulnerabilities });

      // Null guard: skip results with no vulnerabilities
      if (vulnerabilities === null || vulnerabilities === undefined) {
        logger.debug(`[Pipeline] No vulnerabilities in result ${data.key}`);
        return;
      }

      if (Array.isArray(vulnerabilities)) {
        logger.debug(`[Pipeline] Found ${(vulnerabilities as Vulnerability[]).length} vulnerabilities in result ${data.key}`);

        for (const vuln of vulnerabilities as Vulnerability[]) {
          totalVulnerabilities++;
          const severity = vuln.Severity || 'UNKNOWN';
          severityCounts[severity] = (severityCounts[severity] || 0) + 1;

          logger.debug(`[Pipeline] Vulnerability: ${vuln.VulnerabilityID}, Severity: ${severity}`, {
            title: vuln.Title,
            pkgName: vuln.PkgName,
          });

          if (shouldIncludeVulnerability(vuln, minSeverity)) {
            filteredFindings.push(vuln);
            findingCount++;
            logger.info(`[Pipeline] Finding (severity: ${severity}) #${findingCount}: ${vuln.VulnerabilityID}`);

            // findings cap: abort stream early
            if (findingCount >= maxFindings) {
              aborted = true;
              pipeline.destroy();
              logger.error(`[Pipeline] Aborting: exceeded maximum of ${maxFindings} findings with min severity ${minSeverity}`);
              reject(new Error(`Scan aborted: exceeded maximum of ${maxFindings} findings with min severity ${minSeverity}`));
              return;
            }
          }
        }
      }
    });

    pipeline.on('end', () => {
      logger.info(`[Pipeline] Stream ended. Summary:`, {
        totalVulnerabilities,
        severityCounts,
        filteredCount: filteredFindings.length,
        minSeverity,
        aborted,
      });

      if (!aborted) {
        resolve(filteredFindings);
      }
    });

    pipeline.on('error', (err: Error) => {
      logger.error(`[Pipeline] Stream error`, err);
      // When we call pipeline.destroy() the pipeline emits an error with
      // code 'ERR_STREAM_DESTROYED'. Suppress it — we already rejected above.
      if (aborted) return;
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Batch streaming pipeline: parse trivy JSON, filter by severity, batch insert
// Reduces memory footprint from O(n) to O(batch_size)
// ---------------------------------------------------------------------------

export function createStreamPipelineWithBatching(
  jsonFile: string,
  minSeverity: string = 'CRITICAL',
  repository: ScanRepository,
  scanId: string,
  batchSize: number = 100
): Promise<void> {
  return new Promise((resolve, reject) => {
    const maxFindings = getMaxFindings();
    let findingCount = 0;
    let batchCount = 0;
    let aborted = false;
    let totalVulnerabilities = 0;
    const severityCounts: Record<string, number> = {};
    let currentBatch: Vulnerability[] = [];

    logger.info(`[BatchPipeline] Starting with batch size: ${batchSize}, min severity: ${minSeverity}`);

    const pipeline = chain([
      fs.createReadStream(jsonFile),
      parser(),
      pick({ filter: 'Results' }),
      streamArray(),
    ]);

    async function flushBatch(): Promise<void> {
      if (currentBatch.length === 0) return;

      try {
        batchCount++;
        const batchLen = currentBatch.length;
        await repository.appendResults(scanId, currentBatch);
        logger.info(
          `[BatchPipeline] Flushed batch ${batchCount} with ${batchLen} items (total findings: ${findingCount})`
        );
        currentBatch = [];
      } catch (err) {
        logger.error(`[BatchPipeline] Failed to flush batch ${batchCount}`, err);
        throw err;
      }
    }

    pipeline.on('data', async (data: { key: number; value: unknown }) => {
      if (aborted) return;

      // Pause stream while we process batch (backpressure)
      pipeline.pause();

      try {
        const result = data.value as Record<string, unknown> | null | undefined;
        const vulnerabilities = result?.Vulnerabilities;

        logger.debug(`[BatchPipeline] Processing result index ${data.key}`);

        if (vulnerabilities === null || vulnerabilities === undefined) {
          pipeline.resume();
          return;
        }

        if (Array.isArray(vulnerabilities)) {
          for (const vuln of vulnerabilities as Vulnerability[]) {
            totalVulnerabilities++;
            const severity = vuln.Severity || 'UNKNOWN';
            severityCounts[severity] = (severityCounts[severity] || 0) + 1;

            if (shouldIncludeVulnerability(vuln, minSeverity)) {
              currentBatch.push(vuln);
              findingCount++;

              // Flush batch if it reaches size limit
              if (currentBatch.length >= batchSize) {
                await flushBatch();
              }

              // Check if we've exceeded max findings
              if (findingCount >= maxFindings) {
                aborted = true;
                pipeline.destroy();
                await flushBatch(); // Flush remaining before rejecting
                logger.error(
                  `[BatchPipeline] Aborting: exceeded maximum of ${maxFindings} findings`
                );
                reject(
                  new Error(
                    `Scan aborted: exceeded maximum of ${maxFindings} findings with min severity ${minSeverity}`
                  )
                );
                return;
              }
            }
          }
        }

        pipeline.resume();
      } catch (err) {
        aborted = true;
        pipeline.destroy();
        reject(err);
      }
    });

    pipeline.on('end', async () => {
      if (aborted) return;

      try {
        // Flush final batch
        await flushBatch();

        logger.info(`[BatchPipeline] Stream ended. Summary:`, {
          totalVulnerabilities,
          severityCounts,
          findingCount,
          batchCount,
          minSeverity,
        });

        resolve();
      } catch (err) {
        logger.error(`[BatchPipeline] Failed to flush final batch`, err);
        reject(err);
      }
    });

    pipeline.on('error', (err: Error) => {
      logger.error(`[BatchPipeline] Stream error`, err);
      if (aborted) return;
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Main scan orchestration
// ---------------------------------------------------------------------------

async function runScan(scanId: string, repoUrl: string): Promise<void> {
  logger.info(`[Worker] Starting scan: scanId=${scanId}, repoUrl=${repoUrl}`);
  sweepOrphanDirs();

  const tempDir = path.join(os.tmpdir(), `guardian-scan-${scanId}`);
  const clonedDir = path.join(tempDir, 'repo');
  const trivyOutputFile = path.join(tempDir, 'trivy.json');

  const mongoUri = getGuardianMongoUri();
  const mongoClient = new MongoClient(mongoUri);
  await mongoClient.connect();
  const repository = new ScanRepository(mongoClient);

  try {
    logger.info(`[Worker] Creating temp directory: ${tempDir}`);
    fs.mkdirSync(tempDir, { recursive: true });

    // Disk space guard
    logger.info(`[Worker] Checking disk space...`);
    if (!checkDiskSpace(os.tmpdir())) {
      logger.error(`[Worker] Insufficient disk space`);
      await repository.updateStatus(scanId, {
        status: 'failed',
        errorMessage: 'Insufficient disk space: less than 512MB available',
      });
      return;
    }
    logger.info(`[Worker] Disk space OK`);

    // Git clone
    logger.info(`[Worker] Starting git clone from: ${repoUrl}`);
    try {
      await spawnGitClone(repoUrl, clonedDir);
      logger.info(`[Worker] Git clone completed`);
    } catch (err) {
      logger.error(`[Worker] Git clone failed: ${(err as Error).message}`);
      await repository.updateStatus(scanId, {
        status: 'failed',
        errorMessage: `Git clone failed: ${(err as Error).message}`,
      });
      return;
    }

    // Trivy scan
    logger.info(`[Worker] Starting trivy scan on: ${clonedDir}`);
    await repository.updateStatus(scanId, { status: 'scanning' });
    try {
      await spawnTrivy(clonedDir, trivyOutputFile);
      logger.info(`[Worker] Trivy scan completed, output: ${trivyOutputFile}`);
      const trivySize = fs.statSync(trivyOutputFile).size;
      logger.info(`[Worker] Trivy output file size: ${trivySize} bytes`);
    } catch (err) {
      logger.error(`[Worker] Trivy scan failed: ${(err as Error).message}`);
      await repository.updateStatus(scanId, {
        status: 'failed',
        errorMessage: `Trivy scan failed: ${(err as Error).message}`,
      });
      return;
    }

    // Batch streaming pipeline: parse results, filter by severity, batch insert to DB
    logger.info(`[Worker] Starting batch streaming pipeline to parse results`);
    try {
      const minSeverity = getMinimumSeverity();
      const BATCH_SIZE = 100;
      await createStreamPipelineWithBatching(
        trivyOutputFile,
        minSeverity,
        repository,
        scanId,
        BATCH_SIZE
      );
      logger.info(`[Worker] Batch streaming pipeline completed`);

      logger.info(`[Worker] Marking scan as completed`);
      await repository.updateStatus(scanId, { status: 'completed' });
      logger.info(`[Worker] Scan completed successfully`);
    } catch (err) {
      logger.error(`[Worker] Batch pipeline failed: ${(err as Error).message}`);
      await repository.updateStatus(scanId, {
        status: 'failed',
        errorMessage: (err as Error).message,
      });
    }
  } finally {
    // Cleanup temp directory on ALL exit paths (success, error, timeout)
    logger.info(`[Worker] Cleaning up temp directory`);
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        logger.info(`[Worker] Cleaned up temp dir: ${tempDir}`);
      }
    } catch (cleanupErr) {
      logger.warn(`[Worker] Failed to cleanup temp dir ${tempDir}`, cleanupErr);
    }

    await mongoClient.close().catch((err) => {
      logger.warn('[Worker] Failed to close MongoDB client', err);
    });
    logger.info(`[Worker] Worker finished`);
  }
}

// Only set up message handler when running as a worker thread (not in main thread or tests)
if (!isMainThread && parentPort) {
  parentPort.on('message', async (msg: WorkerMessage) => {
    if (msg.type !== 'scan') {
      return;
    }

    try {
      await runScan(msg.scanId, msg.repoUrl);
      parentPort!.postMessage({ type: 'done', scanId: msg.scanId });
    } catch (err) {
      parentPort!.postMessage({
        type: 'error',
        scanId: msg.scanId,
        message: (err as Error).message,
      });
    }
  });
}
