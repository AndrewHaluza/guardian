import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGraphQLError } from '../useGraphQLError';

describe('useGraphQLError', () => {
  it('should initialize with empty error', () => {
    const { result } = renderHook(() => useGraphQLError());

    expect(result.current.error).toBe('');
    expect(result.current.hasError).toBe(false);
  });

  it('should handle error with message', () => {
    const { result } = renderHook(() => useGraphQLError());
    const error = new Error('Test error message');

    act(() => {
      result.current.handleError(error, 'Fallback message');
    });

    expect(result.current.error).toBe('Test error message');
    expect(result.current.hasError).toBe(true);
  });

  it('should use fallback message when error has no message', () => {
    const { result } = renderHook(() => useGraphQLError());
    const error = new Error();

    act(() => {
      result.current.handleError(error, 'Fallback message');
    });

    expect(result.current.error).toBe('Fallback message');
  });

  it('should use fallback message when error is null', () => {
    const { result } = renderHook(() => useGraphQLError());

    act(() => {
      result.current.handleError(null, 'Fallback message');
    });

    expect(result.current.error).toBe('Fallback message');
  });

  it('should use fallback message when error is undefined', () => {
    const { result } = renderHook(() => useGraphQLError());

    act(() => {
      result.current.handleError(undefined, 'Fallback message');
    });

    expect(result.current.error).toBe('Fallback message');
  });

  it('should clear error', () => {
    const { result } = renderHook(() => useGraphQLError());
    const error = new Error('Test error');

    act(() => {
      result.current.handleError(error, 'Fallback');
    });

    expect(result.current.hasError).toBe(true);

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBe('');
    expect(result.current.hasError).toBe(false);
  });

  it('should set error message directly', () => {
    const { result } = renderHook(() => useGraphQLError());

    act(() => {
      result.current.setError('Custom error message');
    });

    expect(result.current.error).toBe('Custom error message');
    expect(result.current.hasError).toBe(true);
  });

  it('should return correct hasError flag', () => {
    const { result } = renderHook(() => useGraphQLError());

    expect(result.current.hasError).toBe(false);

    act(() => {
      result.current.setError('Some error');
    });

    expect(result.current.hasError).toBe(true);

    act(() => {
      result.current.clearError();
    });

    expect(result.current.hasError).toBe(false);
  });

  it('should allow setting empty string as error', () => {
    const { result } = renderHook(() => useGraphQLError());

    act(() => {
      result.current.setError('Error');
    });

    act(() => {
      result.current.setError('');
    });

    expect(result.current.error).toBe('');
    expect(result.current.hasError).toBe(false);
  });
});
