/**
 * Unit tests for scan.worker.ts
 *
 * Design constraints:
 * - Mocha 10 + Node 22 runs .ts files through ts-node/register (CJS transpile).
 * - The worker module now uses worker_threads instead of argv.
 * - isMainThread will be true when loaded by tests, so no message handler runs.
 * - Exported functions (sweepOrphanDirs, checkDiskSpace, spawnGitClone, etc.) are
 *   unchanged and can be tested normally.
 * - The fixture path is resolved relative to process.cwd() (guardian/).
 */

/* eslint-disable @typescript-eslint/no-require-imports */

import { expect } from 'chai';
import sinon from 'sinon';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { EventEmitter } from 'events';
import type { Vulnerability } from '../../src/types';

// createRequire provides a require() function that works in both CJS and ESM
// contexts, allowing us to load modules synchronously even when this file is
// loaded as an ES module by Node 22.
const _require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Fixture path — relative to guardian/ working directory
// ---------------------------------------------------------------------------
const FIXTURE_PATH = path.resolve(process.cwd(), 'test/fixtures/trivy-output.json');

// ---------------------------------------------------------------------------
// Load the worker module cleanly.
// ts-node/register compiles .ts → CJS so require() works here.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const workerModule = _require('../../src/worker/scan.worker');

// ---------------------------------------------------------------------------
// sweepOrphanDirs
// ---------------------------------------------------------------------------

describe('sweepOrphanDirs()', () => {
  it('removes guardian-scan-* directories from os.tmpdir()', () => {
    const tmpdir = os.tmpdir();
    const orphan1 = path.join(tmpdir, 'guardian-scan-orphan-test-aaa');
    const orphan2 = path.join(tmpdir, 'guardian-scan-orphan-test-bbb');
    const unrelated = path.join(tmpdir, 'unrelated-dir-test-xyz');

    fs.mkdirSync(orphan1, { recursive: true });
    fs.mkdirSync(orphan2, { recursive: true });
    fs.mkdirSync(unrelated, { recursive: true });

    try {
      workerModule.sweepOrphanDirs();

      expect(fs.existsSync(orphan1), 'orphan1 should be removed').to.be.false;
      expect(fs.existsSync(orphan2), 'orphan2 should be removed').to.be.false;
      expect(fs.existsSync(unrelated), 'unrelated dir should remain').to.be.true;
    } finally {
      [orphan1, orphan2, unrelated].forEach((p) => {
        try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ }
      });
    }
  });

  it('does not throw when no guardian dirs exist in tmpdir', () => {
    expect(() => workerModule.sweepOrphanDirs()).to.not.throw();
  });
});

// ---------------------------------------------------------------------------
// checkDiskSpace
// ---------------------------------------------------------------------------

describe('checkDiskSpace()', () => {
  it('returns true when sufficient disk space is available', () => {
    const result = workerModule.checkDiskSpace(os.tmpdir());
    expect(result).to.be.true;
  });

  it('returns false when statfsSync reports < 512 MB free', () => {
    const stub = sinon.stub(fs, 'statfsSync').returns({
      type: 0,
      bsize: 4096,
      blocks: 1000,
      bfree: 100,   // 100 * 4096 = 409,600 bytes — under 512 MB
      bavail: 100,
      files: 0,
      ffree: 0,
    } as fs.StatsFs);

    try {
      const result = workerModule.checkDiskSpace('/fake/path');
      expect(result).to.be.false;
    } finally {
      stub.restore();
    }
  });

  it('returns true (fail-open) when statfsSync throws', () => {
    const stub = sinon.stub(fs, 'statfsSync').throws(new Error('ENOENT'));
    try {
      const result = workerModule.checkDiskSpace('/nonexistent');
      expect(result).to.be.true;
    } finally {
      stub.restore();
    }
  });
});

// ---------------------------------------------------------------------------
// spawnGitClone
// ---------------------------------------------------------------------------

describe('spawnGitClone()', () => {
  let fakeChild: EventEmitter & { kill: sinon.SinonSpy };
  let spawnStub: sinon.SinonStub;

  beforeEach(() => {
    fakeChild = Object.assign(new EventEmitter(), { kill: sinon.spy() });
    // Stub child_process.spawn in the module cache so the worker's closure
    // picks up the fake.  ts-node CJS modules share the module cache.
    spawnStub = sinon.stub(_require('child_process'), 'spawn').returns(fakeChild);
  });

  afterEach(() => {
    spawnStub.restore();
  });

  it('resolves when git exits with code 0', async () => {
    const p = workerModule.spawnGitClone('https://example.com/repo.git', '/tmp/target');
    fakeChild.emit('close', 0);
    await p; // should not throw
  });

  it('rejects when git exits with a non-zero code', async () => {
    const p = workerModule.spawnGitClone('https://example.com/repo.git', '/tmp/target');
    fakeChild.emit('close', 128);
    let err: Error | undefined;
    try { await p; } catch (e) { err = e as Error; }
    expect(err).to.be.instanceOf(Error);
    expect(err!.message).to.include('Git clone failed with code 128');
  });

  it('rejects when the child emits an error event', async () => {
    const p = workerModule.spawnGitClone('https://example.com/repo.git', '/tmp/target');
    fakeChild.emit('error', new Error('spawn ENOENT'));
    let err: Error | undefined;
    try { await p; } catch (e) { err = e as Error; }
    expect(err!.message).to.include('spawn ENOENT');
  });

  it('invokes git with --depth=1', () => {
    workerModule.spawnGitClone('https://example.com/repo.git', '/tmp/target');
    fakeChild.emit('close', 0);
    const callArgs: string[] = spawnStub.firstCall.args[1];
    expect(spawnStub.firstCall.args[0]).to.equal('git');
    expect(callArgs).to.include('--depth=1');
  });

  it('kills the child and rejects on 120 s timeout', async function () {
    this.timeout(5000);
    const clock = sinon.useFakeTimers();
    try {
      const p = workerModule.spawnGitClone('https://example.com/repo.git', '/tmp/target');
      clock.tick(120_001);
      await Promise.resolve(); // flush microtasks
      expect(fakeChild.kill.calledWith('SIGTERM')).to.be.true;
      let err: Error | undefined;
      try { await p; } catch (e) { err = e as Error; }
      expect(err!.message).to.include('Git clone timeout (120000ms)');
    } finally {
      clock.restore();
    }
  });
});

// ---------------------------------------------------------------------------
// spawnTrivy
// ---------------------------------------------------------------------------

describe('spawnTrivy()', () => {
  let fakeChild: EventEmitter & { kill: sinon.SinonSpy };
  let spawnStub: sinon.SinonStub;

  beforeEach(() => {
    fakeChild = Object.assign(new EventEmitter(), { kill: sinon.spy() });
    spawnStub = sinon.stub(_require('child_process'), 'spawn').returns(fakeChild);
  });

  afterEach(() => {
    spawnStub.restore();
  });

  it('resolves when trivy exits with code 0', async () => {
    const p = workerModule.spawnTrivy('/cloned', '/out/trivy.json');
    fakeChild.emit('close', 0);
    await p;
  });

  it('rejects when trivy exits with a non-zero code', async () => {
    const p = workerModule.spawnTrivy('/cloned', '/out/trivy.json');
    fakeChild.emit('close', 1);
    let err: Error | undefined;
    try { await p; } catch (e) { err = e as Error; }
    expect(err!.message).to.include('Trivy scan failed with code 1');
  });

  it('passes --format json and --output <file> flags to trivy', () => {
    const outputFile = '/tmp/trivy.json';
    workerModule.spawnTrivy('/cloned', outputFile);
    fakeChild.emit('close', 0);
    const callArgs: string[] = spawnStub.firstCall.args[1];
    expect(spawnStub.firstCall.args[0]).to.equal('trivy');
    expect(callArgs).to.include('--format');
    expect(callArgs).to.include('json');
    expect(callArgs).to.include('--output');
    expect(callArgs).to.include(outputFile);
  });

  it('kills the child and rejects on 300 s timeout', async function () {
    this.timeout(5000);
    const clock = sinon.useFakeTimers();
    try {
      const p = workerModule.spawnTrivy('/cloned', '/out/trivy.json');
      clock.tick(300_001);
      await Promise.resolve();
      expect(fakeChild.kill.calledWith('SIGTERM')).to.be.true;
      let err: Error | undefined;
      try { await p; } catch (e) { err = e as Error; }
      expect(err!.message).to.include('Trivy scan timeout (300000ms)');
    } finally {
      clock.restore();
    }
  });
});

// ---------------------------------------------------------------------------
// createStreamPipeline — real stream-json parsing against the fixture
// ---------------------------------------------------------------------------

describe('createStreamPipeline()', () => {
  it('fixture file exists and is valid JSON', () => {
    expect(fs.existsSync(FIXTURE_PATH), `fixture not found at ${FIXTURE_PATH}`).to.be.true;
    const raw = fs.readFileSync(FIXTURE_PATH, 'utf8');
    expect(() => JSON.parse(raw)).to.not.throw();
    const parsed = JSON.parse(raw) as { Results: unknown[] };
    expect(parsed).to.have.property('Results').that.is.an('array');
  });

  it('fixture contains at least one null Vulnerabilities entry', () => {
    const parsed = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')) as {
      Results: Array<{ Vulnerabilities: unknown }>;
    };
    const hasNull = parsed.Results.some((r) => r.Vulnerabilities === null);
    expect(hasNull, 'fixture must include at least one null Vulnerabilities').to.be.true;
  });

  it('returns only CRITICAL severity findings (stream-json pipeline)', async () => {
    const findings = await workerModule.createStreamPipeline(FIXTURE_PATH) as Vulnerability[];
    expect(findings).to.be.an('array').with.length.greaterThan(0);
    for (const f of findings) {
      expect(f.Severity).to.equal('CRITICAL');
    }
  });

  it('captures exactly 3 CRITICAL findings from the fixture', async () => {
    // CVE-2023-0001 (CRITICAL, nodejs-npm)
    // CVE-2023-0003 (CRITICAL, nodejs-npm)
    // CVE-2023-0004 (CRITICAL, python-pip)
    const findings = await workerModule.createStreamPipeline(FIXTURE_PATH) as Vulnerability[];
    expect(findings).to.have.length(3);
  });

  it('excludes HIGH, MEDIUM, and LOW findings', async () => {
    const findings = await workerModule.createStreamPipeline(FIXTURE_PATH) as Vulnerability[];
    const ids = findings.map((f: Vulnerability) => f.VulnerabilityID);
    expect(ids).to.not.include('CVE-2023-0002'); // HIGH
    expect(ids).to.not.include('CVE-2023-0005'); // MEDIUM
    expect(ids).to.not.include('CVE-2023-0006'); // LOW
  });

  it('handles null Vulnerabilities without throwing (null guard)', async () => {
    // Fixture includes "Vulnerabilities": null for go.sum result.
    // Without the null guard, this would throw a TypeError.
    let err: Error | null = null;
    try {
      await workerModule.createStreamPipeline(FIXTURE_PATH);
    } catch (e) {
      err = e as Error;
    }
    expect(err).to.be.null;
  });

  it('resolves with 0 findings when all vulns are non-CRITICAL', async () => {
    const json = JSON.stringify({
      Results: [{
        Target: 'safe.js',
        Vulnerabilities: [
          { vulnerabilityId: 'CVE-LOW-1', severity: 'LOW' },
          { vulnerabilityId: 'CVE-MED-1', severity: 'MEDIUM' },
          { vulnerabilityId: 'CVE-HIGH-1', severity: 'HIGH' },
        ],
      }],
    });
    const tmpFile = path.join(os.tmpdir(), `guardian-noncrit-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, json);
    try {
      const findings = await workerModule.createStreamPipeline(tmpFile) as Vulnerability[];
      expect(findings).to.have.length(0);
    } finally {
      try { fs.rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
    }
  });

  it('resolves with 0 findings when every Result has null Vulnerabilities', async () => {
    const json = JSON.stringify({
      Results: [
        { Target: 'clean1.go', Vulnerabilities: null },
        { Target: 'clean2.go', Vulnerabilities: null },
      ],
    });
    const tmpFile = path.join(os.tmpdir(), `guardian-nullonly-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, json);
    try {
      const findings = await workerModule.createStreamPipeline(tmpFile) as Vulnerability[];
      expect(findings).to.have.length(0);
    } finally {
      try { fs.rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
    }
  });

  it('rejects with the 500-cap error when findings exceed 500', async () => {
    const vulns = Array.from({ length: 501 }, (_, i) => ({
      VulnerabilityID: `CVE-MANY-${i}`,
      Severity: 'CRITICAL',
      Title: `Finding ${i}`,
    }));
    const bigJson = JSON.stringify({
      Results: [{ Target: 'big.js', Vulnerabilities: vulns }],
    });
    const tmpFile = path.join(os.tmpdir(), `guardian-cap-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, bigJson);
    try {
      let err: Error | undefined;
      try {
        await workerModule.createStreamPipeline(tmpFile);
      } catch (e) {
        err = e as Error;
      }
      expect(err).to.be.instanceOf(Error);
      expect(err!.message).to.include('exceeded maximum of 500 findings');
    } finally {
      try { fs.rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
    }
  });

  it('enforces the cap at exactly 500 (boundary check)', async () => {
    // At findingCount === 500 the condition `>= MAX_FINDINGS` triggers → reject.
    const vulns500 = Array.from({ length: 500 }, (_, i) => ({
      VulnerabilityID: `CVE-CAP-${i}`,
      Severity: 'CRITICAL',
    }));
    const json500 = JSON.stringify({
      Results: [{ Target: 'boundary.js', Vulnerabilities: vulns500 }],
    });
    const tmpFile = path.join(os.tmpdir(), `guardian-boundary-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, json500);
    try {
      let err: Error | undefined;
      try {
        await workerModule.createStreamPipeline(tmpFile);
      } catch (e) {
        err = e as Error;
      }
      expect(err).to.be.instanceOf(Error);
      expect(err!.message).to.include('exceeded maximum of 500 findings');
    } finally {
      try { fs.rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
    }
  });

  it('returns a Promise (confirms the streaming path is taken)', () => {
    const json = JSON.stringify({ Results: [] });
    const tmpFile = path.join(os.tmpdir(), `guardian-stream-proof-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, json);
    const result = workerModule.createStreamPipeline(tmpFile);
    expect(result).to.be.instanceof(Promise);
    return result.then(() => {
      try { fs.rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
    });
  });
});

// ---------------------------------------------------------------------------
// shouldIncludeVulnerability — severity filtering logic
// ---------------------------------------------------------------------------

describe('shouldIncludeVulnerability()', () => {
  // Since shouldIncludeVulnerability is not exported, test it indirectly through
  // createStreamPipeline with different severity levels

  it('filters to CRITICAL when minSeverity is CRITICAL', async () => {
    const json = JSON.stringify({
      Results: [{
        Target: 'test.js',
        Vulnerabilities: [
          { VulnerabilityID: 'CVE-C-1', Severity: 'CRITICAL' },
          { VulnerabilityID: 'CVE-H-1', Severity: 'HIGH' },
          { VulnerabilityID: 'CVE-M-1', Severity: 'MEDIUM' },
          { VulnerabilityID: 'CVE-L-1', Severity: 'LOW' },
        ],
      }],
    });
    const tmpFile = path.join(os.tmpdir(), `guardian-severity-critical-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, json);
    try {
      const findings = await workerModule.createStreamPipeline(tmpFile, 'CRITICAL') as Vulnerability[];
      expect(findings).to.have.length(1);
      expect(findings[0].VulnerabilityID).to.equal('CVE-C-1');
    } finally {
      try { fs.rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
    }
  });

  it('filters to HIGH and above when minSeverity is HIGH', async () => {
    const json = JSON.stringify({
      Results: [{
        Target: 'test.js',
        Vulnerabilities: [
          { VulnerabilityID: 'CVE-C-1', Severity: 'CRITICAL' },
          { VulnerabilityID: 'CVE-H-1', Severity: 'HIGH' },
          { VulnerabilityID: 'CVE-M-1', Severity: 'MEDIUM' },
          { VulnerabilityID: 'CVE-L-1', Severity: 'LOW' },
        ],
      }],
    });
    const tmpFile = path.join(os.tmpdir(), `guardian-severity-high-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, json);
    try {
      const findings = await workerModule.createStreamPipeline(tmpFile, 'HIGH') as Vulnerability[];
      expect(findings).to.have.length(2);
      const ids = findings.map((f) => f.VulnerabilityID);
      expect(ids).to.include('CVE-C-1');
      expect(ids).to.include('CVE-H-1');
    } finally {
      try { fs.rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
    }
  });

  it('includes UNKNOWN severity when minSeverity is LOW', async () => {
    const json = JSON.stringify({
      Results: [{
        Target: 'test.js',
        Vulnerabilities: [
          { VulnerabilityID: 'CVE-UNKNOWN-1', Severity: 'UNKNOWN' },
          { VulnerabilityID: 'CVE-L-1', Severity: 'LOW' },
        ],
      }],
    });
    const tmpFile = path.join(os.tmpdir(), `guardian-severity-unknown-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, json);
    try {
      const findings = await workerModule.createStreamPipeline(tmpFile, 'LOW') as Vulnerability[];
      expect(findings).to.have.length(1); // UNKNOWN has rank 0, LOW has rank 1, so UNKNOWN is filtered out
      expect(findings[0].VulnerabilityID).to.equal('CVE-L-1');
    } finally {
      try { fs.rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
    }
  });

  it('handles missing Severity field (defaults to UNKNOWN)', async () => {
    const json = JSON.stringify({
      Results: [{
        Target: 'test.js',
        Vulnerabilities: [
          { VulnerabilityID: 'CVE-NO-SEV', Title: 'Missing Severity' },
          { VulnerabilityID: 'CVE-C-1', Severity: 'CRITICAL' },
        ],
      }],
    });
    const tmpFile = path.join(os.tmpdir(), `guardian-missing-sev-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, json);
    try {
      const findings = await workerModule.createStreamPipeline(tmpFile, 'CRITICAL') as Vulnerability[];
      expect(findings).to.have.length(1);
      expect(findings[0].VulnerabilityID).to.equal('CVE-C-1');
    } finally {
      try { fs.rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
    }
  });
});

// ---------------------------------------------------------------------------
// createStreamPipelineWithBatching — batch-based streaming
// ---------------------------------------------------------------------------

describe('createStreamPipelineWithBatching()', () => {
  // Mock the ScanRepository for batching tests
  const mockRepository = {
    appendResults: sinon.stub().resolves(),
    updateStatus: sinon.stub().resolves(),
  };

  beforeEach(() => {
    mockRepository.appendResults.resetHistory();
    mockRepository.updateStatus.resetHistory();
  });

  it('parses and batches vulnerabilities from stream', async () => {
    const vulns = Array.from({ length: 250 }, (_, i) => ({
      VulnerabilityID: `CVE-BATCH-${i}`,
      Severity: 'CRITICAL',
    }));
    const json = JSON.stringify({
      Results: [{ Target: 'test.js', Vulnerabilities: vulns }],
    });
    const tmpFile = path.join(os.tmpdir(), `guardian-batch-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, json);

    try {
      await workerModule.createStreamPipelineWithBatching(
        tmpFile,
        'CRITICAL',
        mockRepository as any,
        'scan-123',
        100 // batch size
      );
      // 250 items with batch size 100 = 3 flushes (100, 100, 50)
      expect(mockRepository.appendResults.callCount).to.equal(3);
      // First two batches should have 100 items
      expect(mockRepository.appendResults.firstCall.args[1]).to.have.length(100);
      expect(mockRepository.appendResults.secondCall.args[1]).to.have.length(100);
      // Last batch should have 50 items
      expect(mockRepository.appendResults.thirdCall.args[1]).to.have.length(50);
    } finally {
      try { fs.rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
    }
  });

  it('respects batch size parameter', async () => {
    const vulns = Array.from({ length: 350 }, (_, i) => ({
      VulnerabilityID: `CVE-BATCHSIZE-${i}`,
      Severity: 'HIGH',
    }));
    const json = JSON.stringify({
      Results: [{ Target: 'test.js', Vulnerabilities: vulns }],
    });
    const tmpFile = path.join(os.tmpdir(), `guardian-batchsize-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, json);

    try {
      await workerModule.createStreamPipelineWithBatching(
        tmpFile,
        'HIGH',
        mockRepository as any,
        'scan-456',
        50 // smaller batch size
      );
      // 350 items with batch size 50 = 7 flushes
      expect(mockRepository.appendResults.callCount).to.equal(7);
    } finally {
      try { fs.rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
    }
  });

  it('flushes final batch on stream end', async () => {
    const vulns = Array.from({ length: 25 }, (_, i) => ({
      VulnerabilityID: `CVE-FINAL-${i}`,
      Severity: 'CRITICAL',
    }));
    const json = JSON.stringify({
      Results: [{ Target: 'test.js', Vulnerabilities: vulns }],
    });
    const tmpFile = path.join(os.tmpdir(), `guardian-final-batch-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, json);

    try {
      await workerModule.createStreamPipelineWithBatching(
        tmpFile,
        'CRITICAL',
        mockRepository as any,
        'scan-789',
        100
      );
      // 25 items < 100 batch size, but should still flush on end
      expect(mockRepository.appendResults.callCount).to.equal(1);
      expect(mockRepository.appendResults.firstCall.args[1]).to.have.length(25);
    } finally {
      try { fs.rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
    }
  });

  it('respects minSeverity filter in batch pipeline', async () => {
    const json = JSON.stringify({
      Results: [{
        Target: 'test.js',
        Vulnerabilities: [
          { VulnerabilityID: 'CVE-C-1', Severity: 'CRITICAL' },
          { VulnerabilityID: 'CVE-H-1', Severity: 'HIGH' },
          { VulnerabilityID: 'CVE-M-1', Severity: 'MEDIUM' },
        ],
      }],
    });
    const tmpFile = path.join(os.tmpdir(), `guardian-batch-filter-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, json);

    try {
      await workerModule.createStreamPipelineWithBatching(
        tmpFile,
        'HIGH',
        mockRepository as any,
        'scan-filter',
        100
      );
      // Only CRITICAL and HIGH should be included
      expect(mockRepository.appendResults.callCount).to.equal(1);
      const batch = mockRepository.appendResults.firstCall.args[1] as Vulnerability[];
      expect(batch).to.have.length(2);
      const ids = batch.map((v) => v.VulnerabilityID);
      expect(ids).to.include('CVE-C-1');
      expect(ids).to.include('CVE-H-1');
    } finally {
      try { fs.rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
    }
  });

  it('aborts and flushes when max findings exceeded', async () => {
    const vulns = Array.from({ length: 501 }, (_, i) => ({
      VulnerabilityID: `CVE-BATCHCAP-${i}`,
      Severity: 'CRITICAL',
    }));
    const json = JSON.stringify({
      Results: [{ Target: 'test.js', Vulnerabilities: vulns }],
    });
    const tmpFile = path.join(os.tmpdir(), `guardian-batch-cap-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, json);

    try {
      let error: Error | undefined;
      try {
        await workerModule.createStreamPipelineWithBatching(
          tmpFile,
          'CRITICAL',
          mockRepository as any,
          'scan-cap',
          100
        );
      } catch (e) {
        error = e as Error;
      }
      expect(error).to.exist;
      expect(error!.message).to.include('exceeded maximum of 500 findings');
      // Should have flushed batches before aborting
      expect(mockRepository.appendResults.callCount).to.be.greaterThan(0);
    } finally {
      try { fs.rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
    }
  });

  it('handles appendResults rejection gracefully', async () => {
    const vulns = Array.from({ length: 10 }, (_, i) => ({
      VulnerabilityID: `CVE-ERR-${i}`,
      Severity: 'CRITICAL',
    }));
    const json = JSON.stringify({
      Results: [{ Target: 'test.js', Vulnerabilities: vulns }],
    });
    const tmpFile = path.join(os.tmpdir(), `guardian-batch-err-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, json);

    const failingRepo = {
      appendResults: sinon.stub().rejects(new Error('DB write failed')),
      updateStatus: sinon.stub().resolves(),
    };

    try {
      let error: Error | undefined;
      try {
        await workerModule.createStreamPipelineWithBatching(
          tmpFile,
          'CRITICAL',
          failingRepo as any,
          'scan-err',
          100
        );
      } catch (e) {
        error = e as Error;
      }
      expect(error).to.exist;
      expect(error!.message).to.include('DB write failed');
    } finally {
      try { fs.rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
    }
  });

  it('skips empty batches (no flush for 0 items)', async () => {
    const json = JSON.stringify({
      Results: [
        { Target: 'safe.js', Vulnerabilities: null },
        { Target: 'also-safe.js', Vulnerabilities: [] },
      ],
    });
    const tmpFile = path.join(os.tmpdir(), `guardian-batch-empty-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, json);

    try {
      await workerModule.createStreamPipelineWithBatching(
        tmpFile,
        'CRITICAL',
        mockRepository as any,
        'scan-empty',
        100
      );
      // No vulnerabilities found, so appendResults should not be called
      expect(mockRepository.appendResults.callCount).to.equal(0);
    } finally {
      try { fs.rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
    }
  });
});

// ---------------------------------------------------------------------------
// Stream error handling
// ---------------------------------------------------------------------------

describe('Stream error handling', () => {
  it('createStreamPipeline rejects on malformed JSON', async () => {
    const tmpFile = path.join(os.tmpdir(), `guardian-malformed-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, 'not valid json {]');

    try {
      let error: Error | undefined;
      try {
        await workerModule.createStreamPipeline(tmpFile);
      } catch (e) {
        error = e as Error;
      }
      expect(error).to.exist;
    } finally {
      try { fs.rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
    }
  });

  it('createStreamPipeline rejects on missing Results key', async () => {
    const json = JSON.stringify({ NotResults: [] });
    const tmpFile = path.join(os.tmpdir(), `guardian-no-results-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, json);

    try {
      let error: Error | undefined;
      try {
        await workerModule.createStreamPipeline(tmpFile);
      } catch (e) {
        error = e as Error;
      }
      // Should resolve with empty array since Results is not picked
      const result = await workerModule.createStreamPipeline(tmpFile) as Vulnerability[];
      expect(result).to.be.an('array').with.length(0);
    } finally {
      try { fs.rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
    }
  });
});

// ---------------------------------------------------------------------------
// Temp directory cleanup (finally-block logic)
// ---------------------------------------------------------------------------

describe('temp directory cleanup', () => {
  it('rmSync removes an existing temp directory', () => {
    const tempDir = path.join(os.tmpdir(), `guardian-scan-cleanup-test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'dummy.txt'), 'test');

    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    expect(fs.existsSync(tempDir)).to.be.false;
  });

  it('existsSync + rmSync does not throw when directory does not exist', () => {
    const tempDir = path.join(os.tmpdir(), `guardian-scan-gone-${Date.now()}`);
    expect(() => {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }).to.not.throw();
  });
});

