import { useState } from 'react';

interface PaginationInfo {
  start: number;
  end: number;
  total: number;
}

interface UsePaginationReturn<T> {
  currentPage: number;
  totalPages: number;
  paginatedItems: T[];
  pageInfo: PaginationInfo;
  goToPage: (page: number) => void;
  goToFirst: () => void;
  goToLast: () => void;
  goToPrevious: () => void;
  goToNext: () => void;
  canGoNext: boolean;
  canGoPrevious: boolean;
}

/**
 * Custom hook for managing pagination state
 * Reusable across components with any data type
 *
 * @param items - Array of items to paginate
 * @param itemsPerPage - Number of items per page (default: 5)
 * @returns Pagination state and navigation functions
 */
export function usePagination<T>(
  items: T[],
  itemsPerPage: number = 5
): UsePaginationReturn<T> {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedItems = items.slice(startIndex, endIndex);

  const validatePage = (page: number): number => {
    return Math.max(1, Math.min(page, totalPages));
  };

  const goToPage = (page: number) => {
    setCurrentPage(validatePage(page));
  };

  const goToFirst = () => {
    setCurrentPage(1);
  };

  const goToLast = () => {
    setCurrentPage(totalPages);
  };

  const goToPrevious = () => {
    setCurrentPage((prev) => validatePage(prev - 1));
  };

  const goToNext = () => {
    setCurrentPage((prev) => validatePage(prev + 1));
  };

  const canGoPrevious = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  const pageInfo: PaginationInfo = {
    start: items.length === 0 ? 0 : startIndex + 1,
    end: Math.min(endIndex, items.length),
    total: items.length,
  };

  return {
    currentPage,
    totalPages,
    paginatedItems,
    pageInfo,
    goToPage,
    goToFirst,
    goToLast,
    goToPrevious,
    goToNext,
    canGoNext,
    canGoPrevious,
  };
}
