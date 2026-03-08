import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { expect } from 'chai';
import { ScanRepository } from '../../src/repository/scan.repository';
import { ScanDocument, Vulnerability } from '../../src/types';

function makeScanDoc(overrides: Partial<ScanDocument> = {}): ScanDocument {
  return {
    _id: 'test-scan-' + Math.random().toString(36).slice(2),
    status: 'queued',
    repoUrl: 'https://github.com/example/repo',
    results: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ScanRepository', () => {
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let repository: ScanRepository;

  before(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    client = new MongoClient(uri);
    await client.connect();
    repository = new ScanRepository(client);
    // Allow TTL index creation to settle
    await new Promise((r) => setTimeout(r, 50));
  });

  after(async () => {
    await client.close();
    await mongoServer.stop();
  });

  // -----------------------------------------------------------------------
  // create()
  // -----------------------------------------------------------------------
  describe('create()', () => {
    it('inserts a new scan document successfully', async () => {
      const doc = makeScanDoc({ _id: 'create-success-1' });
      await repository.create(doc);

      const found = await repository.findById(doc._id);
      expect(found).to.not.be.null;
      expect(found!._id).to.equal(doc._id);
      expect(found!.status).to.equal('queued');
      expect(found!.repoUrl).to.equal(doc.repoUrl);
      expect(found!.results).to.deep.equal([]);
    });

    it('sets createdAt and updatedAt on insert (not from doc)', async () => {
      const past = new Date('2000-01-01');
      const doc = makeScanDoc({ _id: 'create-timestamps-1', createdAt: past, updatedAt: past });
      const before = new Date();
      await repository.create(doc);
      const after = new Date();

      const found = await repository.findById(doc._id);
      expect(found!.createdAt.getTime()).to.be.gte(before.getTime());
      expect(found!.createdAt.getTime()).to.be.lte(after.getTime());
      expect(found!.updatedAt.getTime()).to.be.gte(before.getTime());
    });

    it('throws on duplicate scan ID with message containing the ID', async () => {
      const doc = makeScanDoc({ _id: 'create-dup-1' });
      await repository.create(doc);

      let caught: Error | null = null;
      try {
        await repository.create(doc);
      } catch (err) {
        caught = err as Error;
      }

      expect(caught).to.not.be.null;
      expect(caught!.message).to.include('Duplicate scan ID');
      expect(caught!.message).to.include('create-dup-1');
    });
  });

  // -----------------------------------------------------------------------
  // findById()
  // -----------------------------------------------------------------------
  describe('findById()', () => {
    it('returns the document when it exists', async () => {
      const doc = makeScanDoc({ _id: 'find-exists-1', status: 'scanning' });
      await repository.create(doc);

      const found = await repository.findById('find-exists-1');
      expect(found).to.not.be.null;
      expect(found!.status).to.equal('scanning');
    });

    it('returns null for a non-existent ID without throwing', async () => {
      const result = await repository.findById('no-such-id-xyz-999');
      expect(result).to.be.null;
    });
  });

  // -----------------------------------------------------------------------
  // updateStatus()
  // -----------------------------------------------------------------------
  describe('updateStatus()', () => {
    it('updates a single field and refreshes updatedAt', async () => {
      const doc = makeScanDoc({ _id: 'update-single-1', status: 'queued' });
      await repository.create(doc);

      const before = new Date();
      await repository.updateStatus('update-single-1', { status: 'scanning' });
      const after = new Date();

      const found = await repository.findById('update-single-1');
      expect(found!.status).to.equal('scanning');
      expect(found!.updatedAt.getTime()).to.be.gte(before.getTime());
      expect(found!.updatedAt.getTime()).to.be.lte(after.getTime());
    });

    it('updates multiple fields without overwriting unrelated fields', async () => {
      const doc = makeScanDoc({ _id: 'update-multi-1', status: 'scanning', repoUrl: 'https://github.com/keep-me' });
      await repository.create(doc);

      await repository.updateStatus('update-multi-1', {
        status: 'failed',
        errorMessage: 'something went wrong',
      });

      const found = await repository.findById('update-multi-1');
      expect(found!.status).to.equal('failed');
      expect(found!.errorMessage).to.equal('something went wrong');
      // repoUrl must remain intact
      expect(found!.repoUrl).to.equal('https://github.com/keep-me');
    });

    it('always overwrites updatedAt even if not supplied in patch', async () => {
      const doc = makeScanDoc({ _id: 'update-time-1' });
      await repository.create(doc);
      const original = (await repository.findById('update-time-1'))!.updatedAt;

      // Ensure at least 1 ms passes
      await new Promise((r) => setTimeout(r, 5));
      await repository.updateStatus('update-time-1', { status: 'completed' });

      const found = await repository.findById('update-time-1');
      expect(found!.updatedAt.getTime()).to.be.gt(original.getTime());
    });
  });

  // -----------------------------------------------------------------------
  // appendResults()
  // -----------------------------------------------------------------------
  describe('appendResults()', () => {
    it('appends vulnerabilities to an empty results array', async () => {
      const doc = makeScanDoc({ _id: 'append-empty-1' });
      await repository.create(doc);

      const vulns: Vulnerability[] = [
        { severity: 'HIGH', vulnerabilityId: 'CVE-2023-0001', title: 'Test vuln' },
      ];
      await repository.appendResults('append-empty-1', vulns);

      const found = await repository.findById('append-empty-1');
      expect(found!.results).to.have.length(1);
      expect(found!.results[0].severity).to.equal('HIGH');
      expect(found!.results[0].vulnerabilityId).to.equal('CVE-2023-0001');
    });

    it('appends vulnerabilities to an existing results array', async () => {
      const doc = makeScanDoc({ _id: 'append-existing-1' });
      await repository.create(doc);

      await repository.appendResults('append-existing-1', [
        { severity: 'LOW', vulnerabilityId: 'CVE-2023-0002' },
      ]);
      await repository.appendResults('append-existing-1', [
        { severity: 'CRITICAL', vulnerabilityId: 'CVE-2023-0003' },
        { severity: 'MEDIUM', vulnerabilityId: 'CVE-2023-0004' },
      ]);

      const found = await repository.findById('append-existing-1');
      expect(found!.results).to.have.length(3);
      expect(found!.results.map((v) => v.vulnerabilityId)).to.deep.equal([
        'CVE-2023-0002',
        'CVE-2023-0003',
        'CVE-2023-0004',
      ]);
    });

    it('appending an empty array leaves results unchanged', async () => {
      const doc = makeScanDoc({ _id: 'append-noop-1' });
      await repository.create(doc);

      await repository.appendResults('append-noop-1', [
        { severity: 'LOW', vulnerabilityId: 'CVE-2023-0005' },
      ]);
      await repository.appendResults('append-noop-1', []);

      const found = await repository.findById('append-noop-1');
      expect(found!.results).to.have.length(1);
    });
  });
});
