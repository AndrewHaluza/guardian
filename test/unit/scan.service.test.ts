/**
 * Unit tests for ScanService.
 *
 * Key contracts under test:
 * 1. startScan() submits a task to the pool WITHOUT awaiting it (non-blocking, < 200ms).
 * 2. startScan() returns a UUID scanId immediately after persisting to DB.
 * 3. startScan() returns null when pool.isAtCapacity() returns true.
 * 4. getScan() delegates to repository.findById().
 *
 * The pool is stubbed via sinon so no real worker threads are created.
 */

import { expect } from 'chai';
import sinon from 'sinon';

import { ScanService } from '../../src/service/scan.service';
import { ScanDocument } from '../../src/types';
import { IScanPool } from '../../src/worker/scan.pool';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a stub pool where every method works as expected. */
function makePoolStub(atCapacity: boolean = false): IScanPool {
  return {
    isAtCapacity: sinon.stub().returns(atCapacity),
    submit: sinon.stub(),
    shutdown: sinon.stub().resolves(),
  } as unknown as IScanPool;
}

/** Build a stub repository where every method resolves immediately. */
function makeRepoStub(findResult: ScanDocument | null = null) {
  return {
    create: sinon.stub().resolves(),
    findById: sinon.stub().resolves(findResult),
    updateStatus: sinon.stub().resolves(),
    appendResults: sinon.stub().resolves(),
  };
}

// ---------------------------------------------------------------------------
// ScanService — startScan()
// ---------------------------------------------------------------------------

describe('ScanService', () => {
  let pool: IScanPool;

  beforeEach(() => {
    pool = makePoolStub();
  });

  // -------------------------------------------------------------------------
  // startScan — basic success path
  // -------------------------------------------------------------------------

  describe('startScan()', () => {
    it('returns a non-null string (UUID v4) immediately', async () => {
      const repo = makeRepoStub();
      const service = new ScanService(repo as never, pool);

      const scanId = await service.startScan('https://github.com/example/repo');

      expect(scanId).to.be.a('string').with.length.greaterThan(0);
      // Loose UUID v4 format check
      expect(scanId).to.match(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('calls repository.create() with queued status before returning', async () => {
      const repo = makeRepoStub();
      const service = new ScanService(repo as never, pool);

      const scanId = await service.startScan('https://github.com/example/repo');

      expect(repo.create.calledOnce).to.be.true;
      const docArg: ScanDocument = repo.create.firstCall.args[0];
      expect(docArg._id).to.equal(scanId);
      expect(docArg.status).to.equal('queued');
      expect(docArg.repoUrl).to.equal('https://github.com/example/repo');
      expect(docArg.results).to.deep.equal([]);
    });

    it('submits task to pool without awaiting (worker called synchronously after create)', async () => {
      const repo = makeRepoStub();
      const service = new ScanService(repo as never, pool);

      const start = Date.now();
      const scanId = await service.startScan('https://github.com/example/repo');
      const elapsed = Date.now() - start;

      expect(scanId).to.not.be.null;
      expect((pool.submit as sinon.SinonStub).calledOnce).to.be.true;
      // startScan should have returned immediately without waiting
      expect(elapsed).to.be.lessThan(200);
    });

    it('passes scanId and repoUrl to pool.submit()', async () => {
      const repo = makeRepoStub();
      const service = new ScanService(repo as never, pool);
      const repoUrl = 'https://github.com/example/repo';

      const scanId = await service.startScan(repoUrl);

      expect((pool.submit as sinon.SinonStub).calledOnce).to.be.true;
      const task = (pool.submit as sinon.SinonStub).firstCall.args[0];
      expect(task.scanId).to.equal(scanId);
      expect(task.repoUrl).to.equal(repoUrl);
    });

    it('returns null when pool is at capacity', async () => {
      const repo = makeRepoStub();
      const capacityPool = makePoolStub(true);
      const service = new ScanService(repo as never, capacityPool);

      const result = await service.startScan('https://github.com/repo-1');

      expect(result).to.be.null;
      // DB create should not have been called
      expect(repo.create.called).to.be.false;
    });

    it('allows a new scan when pool is no longer at capacity', async () => {
      const repo = makeRepoStub();
      const capacityPool = makePoolStub(true);
      let service = new ScanService(repo as never, capacityPool);

      // Confirm first scan rejected
      const result1 = await service.startScan('https://github.com/repo-1');
      expect(result1).to.be.null;

      // Now pool is not at capacity
      pool = makePoolStub(false);
      service = new ScanService(repo as never, pool);

      // Scan should now be accepted
      const result2 = await service.startScan('https://github.com/repo-2');
      expect(result2).to.not.be.null;
    });

    it('propagates repo.create() errors to caller', async () => {
      const repo = makeRepoStub();
      (repo.create as sinon.SinonStub).rejects(new Error('DB connection lost'));
      const service = new ScanService(repo as never, pool);

      let err: Error | null = null;
      try {
        await service.startScan('https://github.com/example/repo');
      } catch (e) {
        err = e as Error;
      }

      expect(err).to.not.be.null;
      expect(err!.message).to.include('DB connection lost');
      expect((pool.submit as sinon.SinonStub).called).to.be.false;
    });

    it('propagates pool.submit() errors to caller', async () => {
      const repo = makeRepoStub();
      const faultyPool = makePoolStub();
      (faultyPool.submit as sinon.SinonStub).throws(new Error('Thread spawn failed'));
      const service = new ScanService(repo as never, faultyPool);

      let err: Error | null = null;
      try {
        await service.startScan('https://github.com/example/repo');
      } catch (e) {
        err = e as Error;
      }

      expect(err).to.not.be.null;
      expect(err!.message).to.include('Thread spawn failed');
    });
  });


  // -------------------------------------------------------------------------
  // getScan()
  // -------------------------------------------------------------------------

  describe('getScan()', () => {
    it('delegates to repository.findById() and returns the document', async () => {
      const doc: ScanDocument = {
        _id: 'abc-123',
        status: 'completed',
        repoUrl: 'https://github.com/example/repo',
        results: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const repo = makeRepoStub(doc);
      const service = new ScanService(repo as never, pool);

      const result = await service.getScan('abc-123');

      expect(repo.findById.calledOnceWith('abc-123')).to.be.true;
      expect(result).to.deep.equal(doc);
    });

    it('returns null when repository returns null (scan not found)', async () => {
      const repo = makeRepoStub(null);
      const service = new ScanService(repo as never, pool);

      const result = await service.getScan('no-such-id');

      expect(result).to.be.null;
    });

    it('does not throw when repository returns null', async () => {
      const repo = makeRepoStub(null);
      const service = new ScanService(repo as never, pool);

      let err: Error | null = null;
      try {
        await service.getScan('non-existent');
      } catch (e) {
        err = e as Error;
      }

      expect(err).to.be.null;
    });
  });
});
