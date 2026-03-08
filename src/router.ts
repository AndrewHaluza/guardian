import express from 'express';
import { MongoClient } from 'mongodb';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { getGuardianMongoUri, getScanPostRateLimit, getScanGetRateLimit, getMaxConcurrentScans } from './config';
import { requestLogger } from './middleware/request-logger';
import { ScanRepository } from './repository/scan.repository';
import { ScanService } from './service/scan.service';
import { ScanController } from './controller/scan.controller';
import { WorkerPool, IScanPool } from './worker/scan.pool';
import { createLogger } from './logger';

const logger = createLogger('Guardian');

export interface GuardianRouterResult {
  router: express.Router;
  pool: IScanPool;
}

export async function createGuardianRouter(): Promise<GuardianRouterResult> {
  const mongoUri = getGuardianMongoUri();
  const client = new MongoClient(mongoUri, {
    maxPoolSize: 5,        // Conservative for 256MB pod with max 3 concurrent scans
    minPoolSize: 1,        // Create connections on demand
    maxIdleTimeMS: 60000,  // Close idle connections after 1 minute
  });
  await client.connect();
  logger.info('Connected to Guardian MongoDB');

  const repository = new ScanRepository(client);
  const pool = new WorkerPool(getMaxConcurrentScans());
  const service = new ScanService(repository, pool);
  const controller = new ScanController(service);

  const router = express.Router();

  // Security headers middleware: protects against clickjacking, XSS, MIME-sniffing, etc.
  router.use(helmet());

  // Request logging middleware
  router.use(requestLogger);

  // Request body size limit: prevent oversized payloads from consuming memory
  router.use(express.json({ limit: '1MB' }));

  // Rate limiting middleware
  const postScanLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: getScanPostRateLimit(),
    message: { error: `Rate limit exceeded. Maximum ${getScanPostRateLimit()} requests per minute.` },
    standardHeaders: false,
    skip: () => false,
  });

  const getScanLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: getScanGetRateLimit(),
    message: { error: `Rate limit exceeded. Maximum ${getScanGetRateLimit()} requests per minute.` },
    standardHeaders: false,
    skip: () => false,
  });

  router.post('/scan', postScanLimiter, (req, res) => controller.postScan(req, res));
  router.get('/scan/:scanId', getScanLimiter, (req, res) => controller.getScan(req, res));
  router.delete('/scan/:scanId', getScanLimiter, (req, res) => controller.deleteScan(req, res));
  router.get('/health', (req, res) => controller.getHealth(req, res));

  return { router, pool };
}
