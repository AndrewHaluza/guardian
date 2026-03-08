import './LoadingSkeleton.css';

interface LoadingSkeletonProps {
  count?: number;
}

/**
 * Loading skeleton component for displaying placeholder content
 * Shows shimmer effect while data is being loaded
 * Improves perceived performance and perceived UX
 */
export function LoadingSkeleton({ count = 1 }: LoadingSkeletonProps) {
  return (
    <div className="skeleton-container">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="skeleton-item">
          <div className="skeleton-header">
            <div className="skeleton-badge"></div>
            <div className="skeleton-title"></div>
          </div>
          <div className="skeleton-description"></div>
          <div className="skeleton-details">
            <div className="skeleton-detail"></div>
            <div className="skeleton-detail"></div>
            <div className="skeleton-detail"></div>
          </div>
        </div>
      ))}
    </div>
  );
}
