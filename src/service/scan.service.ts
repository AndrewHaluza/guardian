import { v4 as uuidv4 } from 'uuid';
import { ScanRepository } from '../repository/scan.repository';
import { ScanDocument } from '../types';
import { IScanPool } from '../worker/scan.pool';

export class ScanService {
  private repository: ScanRepository;
  private pool: IScanPool;

  constructor(repository: ScanRepository, pool: IScanPool) {
    this.repository = repository;
    this.pool = pool;
  }

  async startScan(repoUrl: string): Promise<string | null> {
    // Enforce concurrent scan limit before allocating any resources
    if (this.pool.isAtCapacity()) {
      return null;
    }

    const scanId = uuidv4();

    // Persist the scan document immediately so GET can return 'queued' status
    await this.repository.create({
      _id: scanId,
      status: 'queued',
      repoUrl,
      results: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Submit the scan task to the pool without awaiting.
    // This is what keeps POST /api/scan under 200ms regardless of repo size.
    this.pool.submit({ scanId, repoUrl });

    return scanId;
  }

  async getScan(scanId: string): Promise<ScanDocument | null> {
    return await this.repository.findById(scanId);
  }

  async getHealth(): Promise<boolean> {
    return await this.repository.checkHealth();
  }

  async deleteScan(scanId: string): Promise<boolean> {
    return await this.repository.deleteById(scanId);
  }
}
