import { Request, Response } from 'express';
import { ScanService } from '../service/scan.service';
import { createLogger } from '../logger';

const logger = createLogger('ScanController');

// UUID v4 canonical pattern
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ScanController {
  private service: ScanService;

  constructor(service: ScanService) {
    this.service = service;
  }

  async postScan(req: Request, res: Response): Promise<void> {
    try {
      const { repoUrl } = req.body as { repoUrl?: unknown };

      if (!repoUrl || typeof repoUrl !== 'string' || repoUrl.trim() === '') {
        res.status(400).json({ error: 'repoUrl is required and must be a non-empty string' });
        return;
      }

      if (!repoUrl.startsWith('https://')) {
        res.status(400).json({ error: 'repoUrl must be an HTTPS URL' });
        return;
      }

      if (repoUrl.length > 2048) {
        res.status(400).json({ error: 'repoUrl must not exceed 2048 characters' });
        return;
      }

      const scanId = await this.service.startScan(repoUrl);

      if (scanId === null) {
        res.status(429).json({
          error: 'Server is at maximum concurrent scans (3). Please try again later.',
        });
        return;
      }

      res.status(202).json({ scanId, status: 'queued' });
    } catch (err) {
      logger.error('POST /api/scan error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getScan(req: Request, res: Response): Promise<void> {
    try {
      const scanId = req.params['scanId'] as string;

      if (!UUID_V4_REGEX.test(scanId)) {
        res.status(400).json({ error: 'Invalid scanId format. Must be UUID v4.' });
        return;
      }

      const scan = await this.service.getScan(scanId);

      if (!scan) {
        res.status(404).json({ error: 'Scan not found' });
        return;
      }

      // Build a status-specific response shape: only include fields relevant
      // to the current status so callers don't have to handle undefined noise.
      const response: Record<string, unknown> = {
        scanId: scan._id,
        status: scan.status,
      };

      if (scan.status === 'completed') {
        response.results = scan.results;
      } else if (scan.status === 'failed') {
        response.errorMessage = scan.errorMessage;
      }

      res.status(200).json(response);
    } catch (err) {
      logger.error('GET /api/scan/:scanId error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getHealth(req: Request, res: Response): Promise<void> {
    try {
      const startTime = Date.now();
      const isHealthy = await this.service.getHealth();
      const duration = Date.now() - startTime;

      if (!isHealthy) {
        res.status(503).json({
          status: 'unhealthy',
          error: 'Database connection failed',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime_seconds: Math.floor(process.uptime()),
        check_duration_ms: duration,
      });
    } catch (err) {
      logger.error('GET /api/health error', err);
      res.status(503).json({
        status: 'unhealthy',
        error: 'Health check failed',
        timestamp: new Date().toISOString(),
      });
    }
  }

  async deleteScan(req: Request, res: Response): Promise<void> {
    try {
      const scanId = req.params['scanId'] as string;

      if (!UUID_V4_REGEX.test(scanId)) {
        res.status(400).json({ error: 'Invalid scanId format. Must be UUID v4.' });
        return;
      }

      const deleted = await this.service.deleteScan(scanId);

      if (!deleted) {
        res.status(404).json({ error: 'Scan not found' });
        return;
      }

      res.status(200).json({ message: 'Scan deleted successfully' });
    } catch (err) {
      logger.error('DELETE /api/scan/:scanId error', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
