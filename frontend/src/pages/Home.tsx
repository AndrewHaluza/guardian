import { useState } from 'react';
import { useMutation } from '@apollo/client/react';
import { useNavigate } from 'react-router-dom';
import { START_SCAN } from '../graphql/queries';
import {
  StartScanResponse,
  StartScanVariables,
} from '../graphql/types';
import { useGraphQLError } from '../hooks/useGraphQLError';
import '../App.css';

export function Home() {
  const [repoUrl, setRepoUrl] = useState('');
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
    startScan({ variables: { repoUrl } });
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && repoUrl && !loading) {
      handleStartScan();
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
          onChange={(e) => setRepoUrl(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Enter repository URL (https://...)"
          className="input"
          disabled={loading}
          aria-label="Repository URL"
          aria-describedby={error ? 'error-message' : undefined}
        />
        <button
          onClick={handleStartScan}
          disabled={!repoUrl || loading}
          className="btn btn-primary"
          aria-busy={loading}
        >
          {loading ? 'Starting...' : 'Start Scan'}
        </button>
      </div>

      {error && (
        <div id="error-message" className="error-message" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
