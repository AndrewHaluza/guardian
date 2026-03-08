import { useNavigate } from 'react-router-dom';
import '../App.css';

interface ScanHeaderProps {
  title: string;
  subtitle?: string;
  showBackButton?: boolean;
}

/**
 * Reusable header component for scan pages
 * Provides consistent header styling and navigation
 */
export function ScanHeader({
  title,
  subtitle,
  showBackButton = false,
}: ScanHeaderProps) {
  const navigate = useNavigate();

  return (
    <header className="header">
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}

      {showBackButton && (
        <div className="back-button-container" style={{ marginTop: '1rem' }}>
          <button
            onClick={() => navigate('/')}
            className="btn btn-secondary btn-back"
            aria-label="Back to home page"
          >
            ← Back to Home
          </button>
        </div>
      )}
    </header>
  );
}
