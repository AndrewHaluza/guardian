import cors, { CorsOptions } from 'cors';
import { RequestHandler } from 'express';

/**
 * CORS middleware factory
 * Handles both production and development environments with Docker support
 */
export function createCorsMiddleware(): RequestHandler {
  const corsOptions: CorsOptions = {
    origin: process.env.NODE_ENV === 'production'
      ? ['https://yourdomain.com']
      : corsOriginCallback,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    maxAge: 86400, // 24 hours
    optionsSuccessStatus: 200,
  };

  return cors(corsOptions);
}

/**
 * Development CORS origin callback
 * Allows:
 * - localhost:5173, localhost:5174 (host machine)
 * - localhost:3000 (API on host)
 * - 127.0.0.1 variants (loopback)
 * - guardian-frontend (Docker service name)
 * - 172.16.0.0/12 range (Docker internal network)
 * - 192.168.0.0/16 (Local network)
 */
function corsOriginCallback(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
): void {
  if (!origin) {
    // Allow requests without origin (like same-origin requests)
    callback(null, true);
    return;
  }

  // Whitelist patterns for development
  const allowedPatterns = [
    /^http:\/\/localhost(:[0-9]+)?$/,
    /^http:\/\/127\.0\.0\.1(:[0-9]+)?$/,
    /^http:\/\/guardian-frontend(:[0-9]+)?$/,
    /^http:\/\/172\.(1[6-9]|2[0-9]|3[01])\./,  // Docker network: 172.16.0.0/12
    /^http:\/\/192\.168\./,                     // Local network
  ];

  const isAllowed = allowedPatterns.some(pattern => pattern.test(origin));

  if (isAllowed) {
    callback(null, true);
  } else {
    callback(new Error(`CORS not allowed for origin: ${origin}`));
  }
}
