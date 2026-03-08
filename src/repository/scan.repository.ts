import { MongoClient, Collection } from 'mongodb';
import { ScanDocument, Vulnerability } from '../types';
import { createLogger } from '../logger';

const logger = createLogger('ScanRepository');

export class ScanRepository {
  private collection: Collection<ScanDocument>;
  private mongoClient: MongoClient;

  constructor(mongoClient: MongoClient) {
    this.mongoClient = mongoClient;
    this.collection = mongoClient
      .db('guardian')
      .collection<ScanDocument>('scans');

    // Create TTL index on createdAt: documents expire after 7 days (604800 seconds)
    this.collection
      .createIndex({ createdAt: 1 }, { expireAfterSeconds: 604800 })
      .catch((err: unknown) => {
        logger.error('Failed to create TTL index on scans.createdAt', err);
      });
  }

  async create(doc: ScanDocument): Promise<void> {
    try {
      await this.collection.insertOne({
        _id: doc._id,
        status: doc.status,
        repoUrl: doc.repoUrl,
        results: [],
        errorMessage: doc.errorMessage,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ScanDocument);
    } catch (err: unknown) {
      const mongoErr = err as { code?: number };
      if (mongoErr.code === 11000) {
        throw new Error(`Duplicate scan ID: ${doc._id}`);
      }
      throw err;
    }
  }

  async findById(scanId: string): Promise<ScanDocument | null> {
    return await this.collection.findOne({ _id: scanId } as Partial<ScanDocument>);
  }

  async updateStatus(scanId: string, patch: Partial<ScanDocument>): Promise<void> {
    await this.collection.updateOne(
      { _id: scanId } as Partial<ScanDocument>,
      {
        $set: {
          ...patch,
          updatedAt: new Date(),
        },
      }
    );
  }

  async appendResults(scanId: string, vulns: Vulnerability[]): Promise<void> {
    await this.collection.updateOne(
      { _id: scanId } as Partial<ScanDocument>,
      { $push: { results: { $each: vulns } } }
    );
  }

  async checkHealth(): Promise<boolean> {
    try {
      const adminDb = this.mongoClient.db('admin');
      await adminDb.admin().ping();
      return true;
    } catch {
      return false;
    }
  }

  async deleteById(scanId: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ _id: scanId } as Partial<ScanDocument>);
    return result.deletedCount === 1;
  }
}
