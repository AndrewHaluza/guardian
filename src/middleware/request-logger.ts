import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../logger';

const logger = createLogger('HTTP');

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Generate request ID if not present
  const requestId = req.header('X-Request-ID') || uuidv4();
  (req as any).requestId = requestId;

  // Add request ID to response header
  res.setHeader('X-Request-ID', requestId);

  // Capture start time
  const startTime = Date.now();

  // Override res.json and res.send to capture status
  const originalJson = res.json;
  const originalSend = res.send;

  res.json = function (data: unknown) {
    const duration = Date.now() - startTime;
    const status = res.statusCode || 200;

    // Extract relevant fields for logging based on endpoint
    const logData: Record<string, unknown> = {
      type: 'http.request',
      requestId,
      method: req.method,
      path: req.path,
      status,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    };

    // Include scanId if available (in path or response)
    const scanIdMatch = req.path.match(/\/scan\/([a-f0-9\-]+)/);
    if (scanIdMatch) {
      logData.scanId = scanIdMatch[1];
    }

    // Log based on status code
    if (status >= 500) {
      logger.error('Request completed', logData);
    } else if (status >= 400) {
      logger.warn('Request completed with client error', logData);
    } else {
      logger.info('Request completed', logData);
    }

    return originalJson.call(this, data);
  };

  res.send = function (data: unknown) {
    const duration = Date.now() - startTime;
    const status = res.statusCode || 200;

    const logData: Record<string, unknown> = {
      type: 'http.request',
      requestId,
      method: req.method,
      path: req.path,
      status,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    };

    if (status >= 500) {
      logger.error('Request completed', logData);
    } else if (status >= 400) {
      logger.warn('Request completed with client error', logData);
    } else {
      logger.info('Request completed', logData);
    }

    return originalSend.call(this, data);
  };

  next();
}
