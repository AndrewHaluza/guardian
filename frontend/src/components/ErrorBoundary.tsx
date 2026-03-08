import { Component, ReactNode, createContext } from 'react';
import { useNavigate } from 'react-router-dom';
import './ErrorBoundary.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryContextType {
  resetError: () => void;
}

const ErrorBoundaryContext = createContext<ErrorBoundaryContextType | undefined>(undefined);

/**
 * Error boundary component to catch React errors
 * Prevents the entire app from crashing
 * Uses context to provide navigation functionality
 */
class ErrorBoundaryImpl extends Component<Props & { onReset: () => void }, State> {
  constructor(props: Props & { onReset: () => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error('Error boundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-container">
          <h2 className="error-boundary-title">⚠️ Something went wrong</h2>
          <p className="error-boundary-message">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={this.props.onReset}
            className="error-boundary-button"
          >
            Return to Home
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Error boundary wrapper that provides React Router navigation
 * This functional component wraps the class component to use hooks
 */
export function ErrorBoundary({ children }: Props) {
  const navigate = useNavigate();

  const handleReset = () => {
    navigate('/', { replace: true });
  };

  return (
    <ErrorBoundaryContext.Provider value={{ resetError: handleReset }}>
      <ErrorBoundaryImpl onReset={handleReset}>
        {children}
      </ErrorBoundaryImpl>
    </ErrorBoundaryContext.Provider>
  );
}
