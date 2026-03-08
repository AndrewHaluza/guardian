import { useState } from 'react';

/**
 * Custom hook for managing GraphQL error handling
 * Provides consistent error message display across the app
 */
export function useGraphQLError() {
  const [error, setError] = useState<string>('');

  /**
   * Handle GraphQL errors with fallback message
   * @param err - The error object (can be null)
   * @param fallback - Fallback message if error has no message
   */
  const handleError = (err: Error | null | undefined, fallback: string): void => {
    if (!err) {
      setError(fallback);
      return;
    }
    setError(err.message || fallback);
  };

  /**
   * Clear the current error
   */
  const clearError = (): void => {
    setError('');
  };

  /**
   * Set error from a string message
   */
  const setErrorMessage = (message: string): void => {
    setError(message);
  };

  return {
    error,
    setError: setErrorMessage,
    handleError,
    clearError,
    hasError: error.length > 0,
  };
}
