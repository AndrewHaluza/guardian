/**
 * Integration tests for the Guardian API router.
 *
 * Tests the full stack: Express router → ScanController → ScanService →
 * ScanRepository → MongoMemoryServer.
 *
 * The worker pool is stubbed so no real worker threads are created,
 * allowing us to control submission and verify the lifecycle.
 *
 * CRITICAL contract: POST /api/scan must return HTTP 202 in < 200ms.
 */

import { expect } from 'chai';
import sinon from 'sinon';
import supertest from 'supertest';
import express from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { ScanRepository } from '../../src/repository/scan.repository';
import { ScanService } from '../../src/service/scan.service';
import { ScanController } from '../../src/controller/scan.controller';
import { IScanPool } from '../../src/worker/scan.pool';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePoolStub(atCapacity: boolean = false): IScanPool {
  return {
    isAtCapacity: sinon.stub().returns(atCapacity),
    submit: sinon.stub(),
    shutdown: sinon.stub().resolves(),
  } as unknown as IScanPool;
}

/** Build a complete in-process app without calling createGuardianRouter()
 * (which would create a real Mongo connection). Instead we wire the layers
 * manually using MongoMemoryServer. */
async function buildTestApp(mongoUri: string, pool: IScanPool): Promise<{
  app: express.Application;
  service: ScanService;
  pool: IScanPool;
  client: MongoClient;
}> {
  const client = new MongoClient(mongoUri);
  await client.connect();

  const repository = new ScanRepository(client);
  const service = new ScanService(repository, pool);
  const controller = new ScanController(service);

  const router = express.Router();
  router.post('/scan', (req, res) => controller.postScan(req, res));
  router.get('/scan/:scanId', (req, res) => controller.getScan(req, res));

  const app = express();
  app.use(express.json());
  app.use('/api', router);

  // Express 5 error middleware: satisfies 4-argument requirement and prevents
  // requests from hanging due to unhandled async errors closing the connection
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: err.message });
  });

  return { app, service, pool, client };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Guardian API Integration', function () {
  // MongoMemoryServer can be slow to start on CI
  this.timeout(60_000);

  let mongoServer: MongoMemoryServer;
  let mongoClient: MongoClient;
  let app: express.Application;
  let service: ScanService;
  let pool: IScanPool;
  let request: ReturnType<typeof supertest>;

  before(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    pool = makePoolStub();

    const built = await buildTestApp(uri, pool);
    app = built.app;
    service = built.service;
    mongoClient = built.client;
    request = supertest(app);
  });

  after(async () => {
    await mongoClient.close();
    await mongoServer.stop();
  });

  beforeEach(() => {
    // Reset pool stub for each test
    pool = makePoolStub();
    (service as never as { pool: IScanPool }).pool = pool;
  });

  // -------------------------------------------------------------------------
  // POST /api/scan — basic lifecycle
  // -------------------------------------------------------------------------

  describe('POST /api/scan', () => {
    it('returns HTTP 202 with scanId and status queued', async () => {
      const res = await request
        .post('/api/scan')
        .send({ repoUrl: 'https://github.com/example/nodegoat' })
        .expect(202);

      expect(res.body.scanId).to.be.a('string');
      expect(res.body.status).to.equal('queued');
    });

    it('returns HTTP 202 in under 200ms (non-blocking contract)', async () => {
      const start = Date.now();

      await request
        .post('/api/scan')
        .send({ repoUrl: 'https://github.com/example/nodegoat' })
        .expect(202);

      const elapsed = Date.now() - start;
      expect(elapsed, `POST took ${elapsed}ms — must be < 200ms`).to.be.lessThan(200);
    });

    it('returns HTTP 400 when repoUrl is missing', async () => {
      const res = await request
        .post('/api/scan')
        .send({})
        .expect(400);

      expect(res.body.error).to.be.a('string');
    });

    it('returns HTTP 400 when repoUrl is not HTTPS', async () => {
      await request
        .post('/api/scan')
        .send({ repoUrl: 'http://github.com/example/repo' })
        .expect(400);
    });

    it('returns HTTP 400 when repoUrl exceeds 2048 characters', async () => {
      const longUrl = 'https://' + 'x'.repeat(2048);
      await request
        .post('/api/scan')
        .send({ repoUrl: longUrl })
        .expect(400);
    });

    it('returns HTTP 429 when pool is at capacity', async () => {
      // Simulate pool at capacity
      (pool.isAtCapacity as sinon.SinonStub).returns(true);

      const res = await request
        .post('/api/scan')
        .send({ repoUrl: 'https://github.com/r4' })
        .expect(429);

      expect(res.body.error).to.be.a('string');
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/scan/:scanId
  // -------------------------------------------------------------------------

  describe('GET /api/scan/:scanId', () => {
    it('returns HTTP 200 with queued status immediately after POST', async () => {
      const postRes = await request
        .post('/api/scan')
        .send({ repoUrl: 'https://github.com/example/nodegoat' })
        .expect(202);

      const { scanId } = postRes.body as { scanId: string };

      const getRes = await request
        .get(`/api/scan/${scanId}`)
        .expect(200);

      expect(getRes.body.scanId).to.equal(scanId);
      expect(getRes.body.status).to.equal('queued');
    });

    it('returns HTTP 400 for an invalid UUID', async () => {
      await request.get('/api/scan/not-a-uuid').expect(400);
    });

    it('returns HTTP 400 for a UUID v1 (not v4)', async () => {
      await request
        .get('/api/scan/f47ac10b-58cc-1372-a567-0e02b2c3d479')
        .expect(400);
    });

    it('returns HTTP 404 for a valid UUID that was never started', async () => {
      await request
        .get('/api/scan/00000000-0000-4000-8000-000000000001')
        .expect(404);
    });

    it('returns completed status with results after worker updates DB', async () => {
      // Start scan
      const postRes = await request
        .post('/api/scan')
        .send({ repoUrl: 'https://github.com/example/nodegoat' })
        .expect(202);

      const { scanId } = postRes.body as { scanId: string };

      // Simulate the worker updating the DB to 'completed'.
      // We do this directly through the service's repository to mirror what the
      // real worker process would do over its own Mongo connection.
      const repo = (service as never as { repository: ScanRepository }).repository;
      await repo.appendResults(scanId, [
        { severity: 'CRITICAL', vulnerabilityId: 'CVE-TEST-001', title: 'Test finding' },
      ]);
      await repo.updateStatus(scanId, { status: 'completed' });

      const getRes = await request.get(`/api/scan/${scanId}`).expect(200);

      expect(getRes.body.status).to.equal('completed');
      expect(getRes.body.results).to.be.an('array').with.length(1);
      expect(getRes.body.results[0].vulnerabilityId).to.equal('CVE-TEST-001');
      expect(getRes.body.errorMessage).to.be.undefined;
    });

    it('returns failed status with errorMessage after worker sets status to failed', async () => {
      const postRes = await request
        .post('/api/scan')
        .send({ repoUrl: 'https://github.com/example/nodegoat' })
        .expect(202);

      const { scanId } = postRes.body as { scanId: string };

      const repo = (service as never as { repository: ScanRepository }).repository;
      await repo.updateStatus(scanId, {
        status: 'failed',
        errorMessage: 'Git clone failed: exit code 128',
      });

      const getRes = await request.get(`/api/scan/${scanId}`).expect(200);

      expect(getRes.body.status).to.equal('failed');
      expect(getRes.body.errorMessage).to.equal('Git clone failed: exit code 128');
      expect(getRes.body.results).to.be.undefined;
    });
  });

  // -------------------------------------------------------------------------
  // Full lifecycle: POST → GET queued → worker completes → GET completed
  // -------------------------------------------------------------------------

  describe('Full scan lifecycle', () => {
    it('transitions from queued to completed', async () => {
      // 1. Start the scan
      const postRes = await request
        .post('/api/scan')
        .send({ repoUrl: 'https://github.com/example/lifecycle-test' })
        .expect(202);

      const { scanId } = postRes.body as { scanId: string };
      expect(scanId).to.be.a('string');

      // 2. Immediately GET — should be queued
      const queuedRes = await request.get(`/api/scan/${scanId}`).expect(200);
      expect(queuedRes.body.status).to.equal('queued');
      expect(queuedRes.body.results).to.be.undefined;

      // 3. Simulate worker setting status to scanning then completed
      const repo = (service as never as { repository: ScanRepository }).repository;
      await repo.updateStatus(scanId, { status: 'scanning' });

      const scanningRes = await request.get(`/api/scan/${scanId}`).expect(200);
      expect(scanningRes.body.status).to.equal('scanning');

      await repo.appendResults(scanId, [
        { severity: 'CRITICAL', vulnerabilityId: 'CVE-LIFECYCLE-001' },
      ]);
      await repo.updateStatus(scanId, { status: 'completed' });

      // 4. GET completed — must include results
      const completedRes = await request.get(`/api/scan/${scanId}`).expect(200);
      expect(completedRes.body.status).to.equal('completed');
      expect(completedRes.body.results).to.have.length(1);
    });
  });

  // -------------------------------------------------------------------------
  // Concurrent limit recovery
  // -------------------------------------------------------------------------

  describe('Concurrent scan limit', () => {
    it('accepts a new scan when pool transitions from at-capacity to not', async () => {
      // Simulate pool at capacity
      (pool.isAtCapacity as sinon.SinonStub).returns(true);

      // 4th must be rejected
      await request
        .post('/api/scan')
        .send({ repoUrl: 'https://github.com/slot-4' })
        .expect(429);

      // Release capacity by changing the stub
      (pool.isAtCapacity as sinon.SinonStub).returns(false);

      // 5th scan should now be accepted
      const retryRes = await request
        .post('/api/scan')
        .send({ repoUrl: 'https://github.com/slot-5' })
        .expect(202);

      expect(retryRes.body.scanId).to.be.a('string');
    });
  });
});
