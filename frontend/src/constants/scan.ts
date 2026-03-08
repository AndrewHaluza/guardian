/**
 * Scan status constants and mappings
 * Single source of truth for scan-related enums and styles
 */

import { ScanStatus } from '../graphql/types';

export const SCAN_STATUS_VALUES = {
  QUEUED: 'queued',
  SCANNING: 'scanning',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type ScanStatusValue = typeof SCAN_STATUS_VALUES[keyof typeof SCAN_STATUS_VALUES];

/**
 * CSS class names for each status
 * Maps status value to corresponding CSS class
 */
export const SCAN_STATUS_STYLES: Record<ScanStatus, string> = {
  queued: 'status-queued',
  scanning: 'status-scanning',
  completed: 'status-completed',
  failed: 'status-failed',
} as const;

/**
 * Display labels for each status
 * User-friendly names for UI display
 */
export const SCAN_STATUS_LABELS: Record<ScanStatus, string> = {
  queued: 'Queued',
  scanning: 'Scanning',
  completed: 'Completed',
  failed: 'Failed',
} as const;

/**
 * Status descriptions for accessibility
 */
export const SCAN_STATUS_DESCRIPTIONS: Record<ScanStatus, string> = {
  queued: 'Scan is waiting to start',
  scanning: 'Scan is in progress',
  completed: 'Scan has completed',
  failed: 'Scan encountered an error',
} as const;

/**
 * Determine if a status is terminal (no longer changing)
 */
export function isTerminalStatus(status: ScanStatus): boolean {
  return status === SCAN_STATUS_VALUES.COMPLETED || status === SCAN_STATUS_VALUES.FAILED;
}

/**
 * Determine if a status is in progress
 */
export function isInProgress(status: ScanStatus): boolean {
  return status === SCAN_STATUS_VALUES.QUEUED || status === SCAN_STATUS_VALUES.SCANNING;
}
