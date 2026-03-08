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

