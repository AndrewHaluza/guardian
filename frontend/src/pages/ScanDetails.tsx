import { useSubscription, useQuery } from '@apollo/client/react';
import { useParams } from 'react-router-dom';
import { MdFirstPage, MdChevronLeft, MdChevronRight, MdLastPage } from 'react-icons/md';
import { SCAN_STATUS_SUBSCRIPTION, GET_SCAN } from '../graphql/queries';
import {
  ScanStatus as ScanStatusType,
  ScanStatusSubscriptionResponse,
  ScanStatusSubscriptionVariables,
  GetScanResponse,
  GetScanVariables,
} from '../graphql/types';
import { usePagination } from '../hooks/usePagination';
import { useGraphQLError } from '../hooks/useGraphQLError';
import { validateVulnerabilities } from '../utils/validation';
import { VulnerabilityCard } from '../components/VulnerabilityCard';
import { ScanHeader } from '../components/ScanHeader';
import { ScanStatus } from '../components/ScanStatus';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import '../App.css';

export function ScanDetails() {
  const { scanId } = useParams<{ scanId: string }>();
  const { error: graphQLError, handleError } = useGraphQLError();

  // Initial query to get current scan state
  const { data: initialData, loading: initialLoading } = useQuery<
    GetScanResponse,
    GetScanVariables
  >(GET_SCAN, {
    variables: { id: scanId || '' },
    skip: !scanId,
  });

  // Subscribe to scan status updates via WebSocket
  const { data: subscriptionData } =
    useSubscription<ScanStatusSubscriptionResponse, ScanStatusSubscriptionVariables>(
      SCAN_STATUS_SUBSCRIPTION,
      {
        variables: { id: scanId || '' },
        skip: !scanId,
        onError: (err) => {
          handleError(err, 'Failed to subscribe to scan updates');
        },
      }
    );

  if (!scanId) {
    return (
      <div className="container">
        <div className="scan-status">
          <div className="status-card">
            <div className="error-message" role="alert">
              No scan ID provided
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Use subscription data if available, otherwise use initial data
  const scan = subscriptionData?.scanStatus || initialData?.scan;
  const isLoading = initialLoading && !scan;
  const status = (scan?.status || 'queued') as ScanStatusType;
  // Validate vulnerability results at runtime for data integrity
  const results = validateVulnerabilities(scan?.results || []);
  const scanErrorMessage = scan?.errorMessage || '';

  // Combine all error sources
  const error = graphQLError || scanErrorMessage;

  // Use pagination hook for managing result pages
  const {
    paginatedItems: paginatedResults,
    currentPage,
    totalPages,
    pageInfo,
    goToPage,
    goToFirst,
    goToLast,
    goToPrevious,
    goToNext,
    canGoNext,
    canGoPrevious,
  } = usePagination(results);

  return (
    <div className="container">
      <ScanHeader
        title="🔍 Scan Details"
        subtitle={`Scan ID: ${scanId}`}
        showBackButton={true}
      />

      <div className="scan-status">
        <div className="status-card">
          <ScanStatus status={status} isLoading={isLoading} />

          {isLoading && <LoadingSkeleton count={3} />}

          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}

          {status === 'completed' && results.length > 0 && (
            <div className="results">
              <h3>Found {results.length} Vulnerabilities</h3>

              {/* Pagination Info */}
              <div className="pagination-info" aria-label="Pagination info">
                Showing {pageInfo.start} to {pageInfo.end} of {pageInfo.total} results
              </div>

              {/* Vulnerability List */}
              <div className="vulnerability-list" role="region" aria-label="Scan results">
                {paginatedResults.map((vuln, index) => {
                  const uniqueKey = `${vuln.VulnerabilityID}-${vuln.PkgName}-${currentPage}-${index}`;
                  return <VulnerabilityCard key={uniqueKey} vulnerability={vuln} uniqueKey={uniqueKey} />;
                })}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <nav className="pagination" aria-label="Vulnerability pagination">
                  <button
                    onClick={goToFirst}
                    disabled={!canGoPrevious}
                    className="btn btn-small"
                    aria-label="Go to first page"
                  >
                    <MdFirstPage size={20} />
                  </button>
                  <button
                    onClick={goToPrevious}
                    disabled={!canGoPrevious}
                    className="btn btn-small"
                    aria-label="Go to previous page"
                  >
                    <MdChevronLeft size={20} />
                  </button>

                  <div className="page-numbers" role="group" aria-label="Page numbers">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const startPage = Math.max(1, currentPage - 2);
                      return startPage + i;
                    })
                      .filter((page) => page <= totalPages)
                      .map((page) => (
                        <button
                          key={page}
                          onClick={() => goToPage(page)}
                          className={`btn ${currentPage === page ? 'btn-active' : 'btn-small'}`}
                          aria-current={currentPage === page ? 'page' : undefined}
                          aria-label={`Page ${page}`}
                        >
                          {page}
                        </button>
                      ))}
                  </div>

                  <button
                    onClick={goToNext}
                    disabled={!canGoNext}
                    className="btn btn-small"
                    aria-label="Go to next page"
                  >
                    <MdChevronRight size={20} />
                  </button>
                  <button
                    onClick={goToLast}
                    disabled={!canGoNext}
                    className="btn btn-small"
                    aria-label="Go to last page"
                  >
                    <MdLastPage size={20} />
                  </button>
                </nav>
              )}
            </div>
          )}

          {status === 'completed' && results.length === 0 && (
            <div className="success-message">✓ No vulnerabilities found!</div>
          )}
        </div>
      </div>
    </div>
  );
}
