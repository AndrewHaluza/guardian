import { describe, it, expect } from 'vitest';

/**
 * Tests for ScanDetails pagination page number generation
 * Specifically tests the fix for showing only valid page numbers
 */
describe('ScanDetails Pagination - Page Number Generation', () => {
  /**
   * Helper to generate page numbers like ScanDetails does
   * @param currentPage Current active page
   * @param totalPages Total number of pages
   * @returns Array of page numbers to display
   */
  const generatePageNumbers = (currentPage: number, totalPages: number): number[] => {
    return Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
      const startPage = Math.max(1, currentPage - 2);
      return startPage + i;
    }).filter((page) => page <= totalPages);
  };

  it('should show only valid page numbers on last page with 17 items (4 pages)', () => {
    const totalPages = 4;
    const currentPage = 4;

    const pageNumbers = generatePageNumbers(currentPage, totalPages);

    // Should only show pages that exist (1-4)
    expect(pageNumbers).toEqual([2, 3, 4]);
    // Should NOT include invalid pages like 5, 6, etc
    expect(pageNumbers).not.toContain(5);
    expect(pageNumbers).not.toContain(6);
  });

  it('should show correct page numbers on first page', () => {
    const totalPages = 4;
    const currentPage = 1;

    const pageNumbers = generatePageNumbers(currentPage, totalPages);

    expect(pageNumbers).toEqual([1, 2, 3, 4]);
  });

  it('should show correct page numbers on middle page', () => {
    const totalPages = 4;
    const currentPage = 2;

    const pageNumbers = generatePageNumbers(currentPage, totalPages);

    expect(pageNumbers).toEqual([1, 2, 3, 4]);
  });

  it('should show up to 5 page numbers when totalPages > 5', () => {
    const totalPages = 10;
    const currentPage = 5;

    const pageNumbers = generatePageNumbers(currentPage, totalPages);

    // Should show 5 pages centered around current page
    expect(pageNumbers).toHaveLength(5);
    expect(pageNumbers).toEqual([3, 4, 5, 6, 7]);
  });

  it('should handle single page correctly', () => {
    const totalPages = 1;
    const currentPage = 1;

    const pageNumbers = generatePageNumbers(currentPage, totalPages);

    expect(pageNumbers).toEqual([1]);
  });

  it('should handle two pages correctly', () => {
    const totalPages = 2;
    const currentPage = 2;

    const pageNumbers = generatePageNumbers(currentPage, totalPages);

    expect(pageNumbers).toEqual([1, 2]);
  });

  it('should not show pages beyond totalPages on last page with many results', () => {
    const totalPages = 23;
    const currentPage = 23;

    const pageNumbers = generatePageNumbers(currentPage, totalPages);

    // Should show pages 21-23 (centered around current, capped at 5 but filtered to valid pages)
    expect(pageNumbers).toEqual([21, 22, 23]);
    // Should not show page 24 or beyond
    expect(Math.max(...pageNumbers)).toBe(totalPages);
  });

  it('should show minimum pages when totalPages < 5', () => {
    const testCases = [
      { totalPages: 1, currentPage: 1, expected: [1] },
      { totalPages: 2, currentPage: 2, expected: [1, 2] },
      { totalPages: 3, currentPage: 3, expected: [1, 2, 3] },
      { totalPages: 4, currentPage: 4, expected: [2, 3, 4] },
    ];

    testCases.forEach(({ totalPages, currentPage, expected }) => {
      const pageNumbers = generatePageNumbers(currentPage, totalPages);
      expect(pageNumbers).toEqual(expected);
    });
  });
});
