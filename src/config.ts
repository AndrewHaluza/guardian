import dotenv from 'dotenv';

// Load .env file if it exists (takes precedence only for values not already in process.env)
dotenv.config({ path: '.env' });

/**
 * Get MongoDB connection URI from environment or defaults
 */
export function getGuardianMongoUri(): string {
  return process.env.GUARDIAN_MONGODB_URI || 'mongodb://localhost:27017/guardian';
}

/**
 * Get HTTP server port
 */
export function getGuardianPort(): number {
  const port = process.env.GUARDIAN_PORT || '3000';
  return parseInt(port, 10);
}

/**
 * Get maximum concurrent scans allowed
 * Validates that the value is between 1 and 128 to prevent misconfiguration.
 * Default: 3 (uses ~6MB for thread pool + 70-140MB per scan = ~180MB under 256MB constraint)
 */
export function getMaxConcurrentScans(): number {
  const max = parseInt(process.env.GUARDIAN_MAX_CONCURRENT_SCANS || '3', 10);
  if (max < 1 || max > 128) {
    console.warn(
      `Invalid GUARDIAN_MAX_CONCURRENT_SCANS="${max}". Must be between 1 and 128. Defaulting to 3.`
    );
    return 3;
  }
  return max;
}

/**
 * Get Trivy scan timeout in milliseconds
 */
export function getTrivyTimeout(): number {
  const timeout = process.env.GUARDIAN_TRIVY_TIMEOUT || '300000'; // 5 minutes default
  return parseInt(timeout, 10);
}

/**
 * Get Git clone timeout in milliseconds
 */
export function getGitTimeout(): number {
  const timeout = process.env.GUARDIAN_GIT_TIMEOUT || '120000'; // 2 minutes default
  return parseInt(timeout, 10);
}

/**
 * Get rate limit for POST /api/scan (requests per minute)
 */
export function getScanPostRateLimit(): number {
  const limit = process.env.GUARDIAN_RATE_LIMIT_POST_SCAN || '10';
  return parseInt(limit, 10);
}

/**
 * Get rate limit for GET /api/scan/:scanId (requests per minute)
 */
export function getScanGetRateLimit(): number {
  const limit = process.env.GUARDIAN_RATE_LIMIT_GET_SCAN || '100';
  return parseInt(limit, 10);
}

/**
 * Get minimum severity level to report (CRITICAL, HIGH, MEDIUM, LOW, UNKNOWN)
 * Defaults to CRITICAL for high signal-to-noise ratio
 */
export function getMinimumSeverity(): string {
  const severity = process.env.GUARDIAN_MIN_SEVERITY || 'CRITICAL';
  const validSeverities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];
  if (!validSeverities.includes(severity)) {
    console.warn(
      `Invalid GUARDIAN_MIN_SEVERITY="${severity}". Must be one of: ${validSeverities.join(', ')}. Defaulting to CRITICAL.`
    );
    return 'CRITICAL';
  }
  return severity;
}

/**
 * Get minimum free disk space in bytes (default: 512 MB)
 */
export function getMinFreeDiskSpace(): number {
  const bytes = process.env.GUARDIAN_MIN_FREE_DISK_MB || '512';
  return parseInt(bytes, 10) * 1024 * 1024;
}

/**
 * Get maximum findings to report per scan (default: 500)
 */
export function getMaxFindings(): number {
  const max = process.env.GUARDIAN_MAX_FINDINGS || '500';
  return parseInt(max, 10);
}

/**
 * Get the complete configuration object
 */