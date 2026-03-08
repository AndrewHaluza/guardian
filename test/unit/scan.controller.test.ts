/**
 * Unit tests for ScanController.
 *
 * Uses mock req/res objects (no HTTP server needed) and stubs ScanService.
 *
 * Contracts under test:
 * - POST handler: 202 on success, 400 on validation, 429 on limit, 500 on crash
 * - GET handler:  200 on found, 400 on bad UUID, 404 on missing, 500 on crash
 * - Response shapes vary by scan status (completed/failed/queued)
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { ScanController } from '../../src/controller/scan.controller';
import { ScanDocument } from '../../src/types';

// ---------------------------------------------------------------------------
// Helpers: minimal mock Request / Response
// ---------------------------------------------------------------------------

function makeReq(overrides: {
  body?: Record<string, unknown>;
  params?: Record<string, string>;
} = {}) {
  return {
    body: overrides.body ?? {},
    params: overrides.params ?? {},
  } as never;
}

function makeRes() {
  const res = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return res;
}

function makeServiceStub() {
  return {
    startScan: sinon.stub<[string], Promise<string | null>>(),
    getScan: sinon.stub<[string], Promise<ScanDocument | null>>(),
  };
}

// ---------------------------------------------------------------------------
// POST /api/scan
// ---------------------------------------------------------------------------

describe('ScanController', () => {
  describe('postScan()', () => {
    it('returns 202 with scanId and status "queued" on success', async () => {
      const service = makeServiceStub();
      service.startScan.resolves('test-scan-uuid-1234');
      const controller = new ScanController(service as never);

      const req = makeReq({ body: { repoUrl: 'https://github.com/example/repo' } });
      const res = makeRes();

      await controller.postScan(req, res as never);

      expect(res.statusCode).to.equal(202);
      expect((res.body as Record<string, unknown>).scanId).to.equal('test-scan-uuid-1234');
      expect((res.body as Record<string, unknown>).status).to.equal('queued');
    });

    it('calls service.startScan with the trimmed repoUrl', async () => {
      const service = makeServiceStub();
      service.startScan.resolves('id-abc');
      const controller = new ScanController(service as never);

      const req = makeReq({ body: { repoUrl: 'https://github.com/example/repo' } });
      await controller.postScan(req, makeRes() as never);

      expect(service.startScan.calledOnceWith('https://github.com/example/repo')).to.be.true;
    });

    // --- Validation: 400 ---

    it('returns 400 when repoUrl is missing', async () => {
      const service = makeServiceStub();
      const controller = new ScanController(service as never);
      const res = makeRes();

      await controller.postScan(makeReq({ body: {} }), res as never);

      expect(res.statusCode).to.equal(400);
      expect((res.body as Record<string, unknown>).error).to.be.a('string');
    });

    it('returns 400 when repoUrl is an empty string', async () => {
      const service = makeServiceStub();
      const controller = new ScanController(service as never);
      const res = makeRes();

      await controller.postScan(makeReq({ body: { repoUrl: '' } }), res as never);

      expect(res.statusCode).to.equal(400);
    });

    it('returns 400 when repoUrl is whitespace-only', async () => {
      const service = makeServiceStub();
      const controller = new ScanController(service as never);
      const res = makeRes();

      await controller.postScan(makeReq({ body: { repoUrl: '   ' } }), res as never);

      expect(res.statusCode).to.equal(400);
    });

    it('returns 400 when repoUrl is a non-string value', async () => {
      const service = makeServiceStub();
      const controller = new ScanController(service as never);
      const res = makeRes();

      await controller.postScan(makeReq({ body: { repoUrl: 42 } }), res as never);

      expect(res.statusCode).to.equal(400);
    });

    it('returns 400 when repoUrl does not start with https://', async () => {
      const service = makeServiceStub();
      const controller = new ScanController(service as never);
      const res = makeRes();

      await controller.postScan(
        makeReq({ body: { repoUrl: 'http://github.com/example/repo' } }),
        res as never,
      );

      expect(res.statusCode).to.equal(400);
      expect((res.body as Record<string, unknown>).error).to.include('HTTPS');
    });

    it('returns 400 when repoUrl exceeds 2048 characters', async () => {
      const service = makeServiceStub();
      const controller = new ScanController(service as never);
      const res = makeRes();

      const longUrl = 'https://' + 'a'.repeat(2048);
      await controller.postScan(makeReq({ body: { repoUrl: longUrl } }), res as never);

      expect(res.statusCode).to.equal(400);
      expect((res.body as Record<string, unknown>).error).to.include('2048');
    });

    it('accepts a repoUrl of exactly 2048 characters', async () => {
      const service = makeServiceStub();
      service.startScan.resolves('some-id');
      const controller = new ScanController(service as never);
      const res = makeRes();

      // Build a valid HTTPS URL exactly 2048 chars long
      const prefix = 'https://';
      const url2048 = prefix + 'a'.repeat(2048 - prefix.length);
      expect(url2048.length).to.equal(2048);

      await controller.postScan(makeReq({ body: { repoUrl: url2048 } }), res as never);

      expect(res.statusCode).to.equal(202);
    });

    // --- Concurrent limit: 429 ---

    it('returns 429 when service.startScan returns null', async () => {
      const service = makeServiceStub();
      service.startScan.resolves(null);
      const controller = new ScanController(service as never);
      const res = makeRes();

      await controller.postScan(
        makeReq({ body: { repoUrl: 'https://github.com/example/repo' } }),
        res as never,
      );

      expect(res.statusCode).to.equal(429);
      expect((res.body as Record<string, unknown>).error).to.be.a('string').that.includes('3');
    });

    // --- Server error: 500 ---

    it('returns 500 when service.startScan throws', async () => {
      const service = makeServiceStub();
      service.startScan.rejects(new Error('DB connection lost'));
      const controller = new ScanController(service as never);
      const res = makeRes();

      await controller.postScan(
        makeReq({ body: { repoUrl: 'https://github.com/example/repo' } }),
        res as never,
      );

      expect(res.statusCode).to.equal(500);
      // Error body must NOT contain stack trace
      const body = res.body as Record<string, unknown>;
      expect(body.error).to.equal('Internal server error');
      expect(JSON.stringify(body)).to.not.include('DB connection lost');
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/scan/:scanId
  // -------------------------------------------------------------------------

  describe('getScan()', () => {
    const VALID_UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

    // --- 200 responses for each status ---

    it('returns 200 with scanId and status for a queued scan', async () => {
      const doc: ScanDocument = {
        _id: VALID_UUID,
        status: 'queued',
        repoUrl: 'https://github.com/example/repo',
        results: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const service = makeServiceStub();
      service.getScan.resolves(doc);
      const controller = new ScanController(service as never);
      const res = makeRes();

      await controller.getScan(makeReq({ params: { scanId: VALID_UUID } }), res as never);

      expect(res.statusCode).to.equal(200);
      const body = res.body as Record<string, unknown>;
      expect(body.scanId).to.equal(VALID_UUID);
      expect(body.status).to.equal('queued');
      // queued scans must not include results or errorMessage
      expect(body.results).to.be.undefined;
      expect(body.errorMessage).to.be.undefined;
    });

    it('returns 200 with scanId and status for a scanning scan', async () => {
      const doc: ScanDocument = {
        _id: VALID_UUID,
        status: 'scanning',
        repoUrl: 'https://github.com/example/repo',
        results: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const service = makeServiceStub();
      service.getScan.resolves(doc);
      const controller = new ScanController(service as never);
      const res = makeRes();

      await controller.getScan(makeReq({ params: { scanId: VALID_UUID } }), res as never);

      expect(res.statusCode).to.equal(200);
      expect((res.body as Record<string, unknown>).status).to.equal('scanning');
    });

    it('returns 200 with results array when scan is completed', async () => {
      const doc: ScanDocument = {
        _id: VALID_UUID,
        status: 'completed',
        repoUrl: 'https://github.com/example/repo',
        results: [{ severity: 'CRITICAL', vulnerabilityId: 'CVE-2023-0001' }],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const service = makeServiceStub();
      service.getScan.resolves(doc);
      const controller = new ScanController(service as never);
      const res = makeRes();

      await controller.getScan(makeReq({ params: { scanId: VALID_UUID } }), res as never);

      expect(res.statusCode).to.equal(200);
      const body = res.body as Record<string, unknown>;
      expect(body.status).to.equal('completed');
      expect(body.results).to.deep.equal(doc.results);
      expect(body.errorMessage).to.be.undefined;
    });

    it('returns 200 with errorMessage when scan is failed', async () => {
      const doc: ScanDocument = {
        _id: VALID_UUID,
        status: 'failed',
        repoUrl: 'https://github.com/example/repo',
        results: [],
        errorMessage: 'Git clone failed: exit code 128',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const service = makeServiceStub();
      service.getScan.resolves(doc);
      const controller = new ScanController(service as never);
      const res = makeRes();

      await controller.getScan(makeReq({ params: { scanId: VALID_UUID } }), res as never);

      expect(res.statusCode).to.equal(200);
      const body = res.body as Record<string, unknown>;
      expect(body.status).to.equal('failed');
      expect(body.errorMessage).to.equal('Git clone failed: exit code 128');
      expect(body.results).to.be.undefined;
    });

    // --- 400: invalid UUID ---

    it('returns 400 for a non-UUID scanId', async () => {
      const service = makeServiceStub();
      const controller = new ScanController(service as never);
      const res = makeRes();

      await controller.getScan(makeReq({ params: { scanId: 'not-a-uuid' } }), res as never);

      expect(res.statusCode).to.equal(400);
      expect((res.body as Record<string, unknown>).error).to.include('UUID');
    });

    it('returns 400 for a UUID v1 (not v4)', async () => {
      const service = makeServiceStub();
      const controller = new ScanController(service as never);
      const res = makeRes();

      // UUID v1 has version digit '1' in the 3rd group
      await controller.getScan(
        makeReq({ params: { scanId: 'f47ac10b-58cc-1372-a567-0e02b2c3d479' } }),
        res as never,
      );

      expect(res.statusCode).to.equal(400);
    });

    it('returns 400 for an empty scanId', async () => {
      const service = makeServiceStub();
      const controller = new ScanController(service as never);
      const res = makeRes();

      await controller.getScan(makeReq({ params: { scanId: '' } }), res as never);

      expect(res.statusCode).to.equal(400);
    });

    // --- 404: not found ---

    it('returns 404 when service returns null for a valid UUID', async () => {
      const service = makeServiceStub();
      service.getScan.resolves(null);
      const controller = new ScanController(service as never);
      const res = makeRes();

      await controller.getScan(makeReq({ params: { scanId: VALID_UUID } }), res as never);

      expect(res.statusCode).to.equal(404);
      expect((res.body as Record<string, unknown>).error).to.include('not found');
    });

    // --- 500: service crash ---

    it('returns 500 when service.getScan throws', async () => {
      const service = makeServiceStub();
      service.getScan.rejects(new Error('cursor not found'));
      const controller = new ScanController(service as never);
      const res = makeRes();

      await controller.getScan(makeReq({ params: { scanId: VALID_UUID } }), res as never);

      expect(res.statusCode).to.equal(500);
      const body = res.body as Record<string, unknown>;
      expect(body.error).to.equal('Internal server error');
      expect(JSON.stringify(body)).to.not.include('cursor not found');
    });
  });
});
