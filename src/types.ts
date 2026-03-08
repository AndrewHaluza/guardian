export type ScanStatus = 'queued' | 'scanning' | 'completed' | 'failed';

/**
 * Vulnerability represents a security finding from Trivy vulnerability scanner.
 *
 * The interface includes typed fields for the most common Trivy fields while using
 * a catch-all `[key: string]: unknown` to accommodate variations in Trivy output schemas
 * across different scanner versions and configuration modes.
 *
 * Common Trivy fields (from actual JSON schema):
 * - Severity: CRITICAL, HIGH, MEDIUM, LOW, UNKNOWN
 * - VulnerabilityID: CVE-XXXX-XXXXX format or GHSA identifier
 * - Title: Short description of the vulnerability
 * - Description: Detailed explanation
 * - PkgName: Name of the vulnerable package
 * - InstalledVersion: Version of the vulnerable package
 * - FixedVersion: Available fixed version(s) (if any)
 * - References: URLs to vulnerability details
 *
 * Note: Trivy schemas can vary between releases. The catch-all field ensures forward
 * compatibility if Trivy adds new fields without requiring code changes.
 *
 * See: https://aquasecurity.github.io/trivy/latest/docs/vulnerability/
 */
export interface Vulnerability {
  Severity?: string;
  VulnerabilityID?: string;
  Title?: string;
  Description?: string;
  PkgName?: string;
  InstalledVersion?: string;
  FixedVersion?: string;
  [key: string]: unknown;
}

export interface ScanDocument {
  _id: string; // scanId (UUID v4)
  status: ScanStatus;
  repoUrl: string;
  results: Vulnerability[];
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateScanResponse {
  scanId: string;
  status: ScanStatus;
}

export interface GetScanResponse {
  scanId: string;
  status: ScanStatus;
  repoUrl?: string;
  results?: Vulnerability[];
  errorMessage?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Worker thread messages for scan operations.
 * Threads communicate with the pool via postMessage/on('message') using these types.
 */
export interface WorkerScanMessage {
  type: 'scan';
  scanId: string;
  repoUrl: string;
}

export interface WorkerResultMessage {
  type: 'done' | 'error';
  scanId: string;
  message?: string;
}

export type WorkerMessage = WorkerScanMessage | WorkerResultMessage;
