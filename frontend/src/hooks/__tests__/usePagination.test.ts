import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePagination } from '../usePagination';

describe('usePagination', () => {
  const mockItems = Array.from({ length: 25 }, (_, i) => `Item ${i + 1}`);

  it('should initialize with default values', () => {
    const { result } = renderHook(() => usePagination(mockItems));

    expect(result.current.currentPage).toBe(1);
    expect(result.current.totalPages).toBe(5); // 25 items / 5 per page
    expect(result.current.paginatedItems).toHaveLength(5);
    expect(result.current.canGoPrevious).toBe(false);
    expect(result.current.canGoNext).toBe(true);
  });

  it('should return correct paginated items for first page', () => {
    const { result } = renderHook(() => usePagination(mockItems));

    expect(result.current.paginatedItems).toEqual([
      'Item 1',
      'Item 2',
      'Item 3',
      'Item 4',
      'Item 5',
    ]);
    expect(result.current.pageInfo.start).toBe(1);
    expect(result.current.pageInfo.end).toBe(5);
    expect(result.current.pageInfo.total).toBe(25);
  });

  it('should navigate to next page', () => {
    const { result } = renderHook(() => usePagination(mockItems));

    act(() => {
      result.current.goToNext();
    });

    expect(result.current.currentPage).toBe(2);
    expect(result.current.paginatedItems[0]).toBe('Item 6');
    expect(result.current.pageInfo.start).toBe(6);
    expect(result.current.pageInfo.end).toBe(10);
  });

  it('should navigate to previous page', () => {
    const { result } = renderHook(() => usePagination(mockItems));

    act(() => {
      result.current.goToNext();
      result.current.goToPrevious();
    });

    expect(result.current.currentPage).toBe(1);
    expect(result.current.paginatedItems[0]).toBe('Item 1');
  });

  it('should navigate to first page', () => {
    const { result } = renderHook(() => usePagination(mockItems));

    act(() => {
      result.current.goToLast();
      result.current.goToFirst();
    });

    expect(result.current.currentPage).toBe(1);
  });

  it('should navigate to last page', () => {
    const { result } = renderHook(() => usePagination(mockItems));

    act(() => {
      result.current.goToLast();
    });

    expect(result.current.currentPage).toBe(5);
    expect(result.current.paginatedItems[0]).toBe('Item 21');
    expect(result.current.pageInfo.end).toBe(25);
  });

  it('should navigate to specific page', () => {
    const { result } = renderHook(() => usePagination(mockItems));

    act(() => {
      result.current.goToPage(3);
    });

    expect(result.current.currentPage).toBe(3);
    expect(result.current.paginatedItems[0]).toBe('Item 11');
  });

  it('should handle custom items per page', () => {
    const { result } = renderHook(() => usePagination(mockItems, 10));

    expect(result.current.totalPages).toBe(3); // 25 / 10 = 2.5, ceil = 3
    expect(result.current.paginatedItems).toHaveLength(10);
  });

  it('should handle empty items array', () => {
    const { result } = renderHook(() => usePagination([]));

    expect(result.current.totalPages).toBe(1);
    expect(result.current.paginatedItems).toHaveLength(0);
    expect(result.current.pageInfo.total).toBe(0);
    expect(result.current.pageInfo.start).toBe(0);
  });

  it('should prevent navigation beyond bounds', () => {
    const { result } = renderHook(() => usePagination(mockItems));

    act(() => {
      result.current.goToPrevious(); // Should stay on page 1
    });

    expect(result.current.currentPage).toBe(1);

    act(() => {
      result.current.goToPage(100); // Should go to last page
    });

    expect(result.current.currentPage).toBe(5);
  });

  it('should update pageInfo when navigating', () => {
    const { result } = renderHook(() => usePagination(mockItems));

    act(() => {
      result.current.goToPage(2);
    });

    expect(result.current.pageInfo).toEqual({
      start: 6,
      end: 10,
      total: 25,
    });
  });

  it('should handle single item', () => {
    const { result } = renderHook(() => usePagination(['Single Item']));

    expect(result.current.totalPages).toBe(1);
    expect(result.current.paginatedItems).toEqual(['Single Item']);
    expect(result.current.canGoNext).toBe(false);
    expect(result.current.canGoPrevious).toBe(false);
  });
});
