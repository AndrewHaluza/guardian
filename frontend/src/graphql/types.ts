/**
 * Centralized GraphQL type definitions
 * Single source of truth for data structures
 */

export type ScanStatus = 'queued' | 'scanning' | 'completed' | 'failed';

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

export interface Scan {
  id: string;
  status: ScanStatus;
  repoUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  errorMessage?: string;
  results?: Vulnerability[];
}

// GraphQL Operation Response Types

export interface StartScanResponse {
  startScan: Scan;
}

export interface GetScanResponse {
  scan: Scan;
}

export interface ScanStatusSubscriptionResponse {
  scanStatus: Scan;
}

// GraphQL Operation Variable Types

export interface StartScanVariables {
  repoUrl: string;
}

export interface GetScanVariables {
  id: string;
}

export interface ScanStatusSubscriptionVariables {
  id: string;
}

export interface DeleteScanVariables {
  id: string;
}
