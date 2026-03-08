import { ScanStatus as ScanStatusType } from '../graphql/types';
import { SCAN_STATUS_LABELS, SCAN_STATUS_STYLES, SCAN_STATUS_DESCRIPTIONS } from '../constants/scan';
import '../App.css';

interface ScanStatusProps {
  status: ScanStatusType;
  isLoading?: boolean;
}

/**
 * Reusable component for displaying scan status
 * Shows status badge with appropriate styling and accessibility labels
 */
export function ScanStatus({ status, isLoading = false }: ScanStatusProps) {
  const label = SCAN_STATUS_LABELS[status] || status.toUpperCase();
  const styleClass = SCAN_STATUS_STYLES[status] || '';
  const description = SCAN_STATUS_DESCRIPTIONS[status] || '';

  return (
    <div className="scan-status-container">
      <p className="status-text">
        Status:{' '}
        <span
          className={`status-badge ${styleClass}`}
          role="status"
          aria-live="polite"
          aria-label={description}
          title={description}
        >
          {label}
        </span>
      </p>

      {isLoading && (
        <div className="spinner" role="status" aria-live="polite">
          <div className="dot"></div>
          <span style={{ display: 'none' }}>Loading scan results</span>
        </div>
      )}
    </div>
  );
}
