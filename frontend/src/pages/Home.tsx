import { useState } from 'react';
import { useMutation } from '@apollo/client/react';
import { useNavigate } from 'react-router-dom';
import { START_SCAN } from '../graphql/queries';
import {
  StartScanResponse,
  StartScanVariables,
} from '../graphql/types';
import { useGraphQLError } from '../hooks/useGraphQLError';
import { validateRepoUrl } from '../utils/validation';
import '../App.css';

export function Home() {
  const [repoUrl, setRepoUrl] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { error, handleError, clearError } = useGraphQLError();

  const [startScan, { loading }] = useMutation<
    StartScanResponse,
    StartScanVariables
  >(START_SCAN, {
    onCompleted: (data: StartScanResponse) => {
      navigate(`/scan/${data.startScan.id}`);
    },
    onError: (err: Error) => {
      handleError(err, 'Failed to start scan');
    },
  });

  const handleStartScan = () => {
    clearError();
    setValidationError(null);

    const urlError = validateRepoUrl(repoUrl);
    if (urlError) {
      setValidationError(urlError);
      return;
    }

    startScan({ variables: { repoUrl } });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && repoUrl && !loading) {
      handleStartScan();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRepoUrl(e.target.value);
    // Clear validation error when user starts typing, allow re-validation on submit
    if (validationError) {
      setValidationError(null);
    }
  };

  return (
    <div className="container">
      <header className="header">
        <h1>🔐 Guardian Security Scanner</h1>
        <p>Scan your repositories for security vulnerabilities</p>
      </header>

      <div className="scan-form">
        <label htmlFor="repo-url" style={{ display: 'none' }}>
          Repository URL
        </label>
        <input
          id="repo-url"
          type="url"
          value={repoUrl}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Enter repository URL (https://...)"
          className="input"
          disabled={loading}
          aria-label="Repository URL"
          aria-describedby={validationError ? 'validation-error' : error ? 'graphql-error' : undefined}
        />
        <button
          onClick={handleStartScan}
          disabled={!repoUrl || loading || !!validationError}
          className="btn btn-primary"
          aria-busy={loading}
        >
          {loading ? 'Starting...' : 'Start Scan'}
        </button>
      </div>

      {validationError && (
        <div id="validation-error" className="error-message" role="alert">
          {validationError}
        </div>
      )}

      {error && (
        <div id="graphql-error" className="error-message" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
