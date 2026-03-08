import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScanStatus } from '../ScanStatus';

describe('ScanStatus', () => {
  it('should render with queued status', () => {
    render(<ScanStatus status="queued" />);

    expect(screen.getByText('Queued')).toBeInTheDocument();
    expect(screen.getByText('Queued')).toHaveClass('status-queued');
  });

  it('should render with scanning status', () => {
    render(<ScanStatus status="scanning" />);

    expect(screen.getByText('Scanning')).toBeInTheDocument();
    expect(screen.getByText('Scanning')).toHaveClass('status-scanning');
  });

  it('should render with completed status', () => {
    render(<ScanStatus status="completed" />);

    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toHaveClass('status-completed');
  });

  it('should render with failed status', () => {
    render(<ScanStatus status="failed" />);

    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toHaveClass('status-failed');
  });

  it('should show loading spinner when isLoading is true', () => {
    const { container } = render(<ScanStatus status="scanning" isLoading={true} />);

    const spinner = container.querySelector('.spinner');
    expect(spinner).toBeInTheDocument();
  });

  it('should not show loading spinner when isLoading is false', () => {
    const { container } = render(<ScanStatus status="scanning" isLoading={false} />);

    const spinner = container.querySelector('.spinner');
    expect(spinner).not.toBeInTheDocument();
  });

  it('should have status role with aria-live for accessibility', () => {
    render(<ScanStatus status="scanning" />);

    const statusBadge = screen.getByText('Scanning').closest('[role="status"]');
    expect(statusBadge).toHaveAttribute('aria-live', 'polite');
  });

  it('should have aria-label with description', () => {
    render(<ScanStatus status="scanning" />);

    const statusBadge = screen.getByText('Scanning');
    expect(statusBadge).toHaveAttribute('aria-label', 'Scan is in progress');
  });

  it('should have title attribute with description', () => {
    render(<ScanStatus status="completed" />);

    const statusBadge = screen.getByText('Completed');
    expect(statusBadge).toHaveAttribute('title', 'Scan has completed');
  });

  it('should render "Status: " label', () => {
    render(<ScanStatus status="queued" />);

    expect(screen.getByText(/Status:/)).toBeInTheDocument();
  });

  it('should render status badge in status text paragraph', () => {
    const { container } = render(<ScanStatus status="queued" />);

    const statusText = container.querySelector('.status-text');
    expect(statusText).toBeInTheDocument();
    expect(statusText?.querySelector('.status-badge')).toBeInTheDocument();
  });

  it('should render hidden loading text for screen readers', () => {
    const { container } = render(<ScanStatus status="scanning" isLoading={true} />);

    const hiddenText = container.querySelector('span[style*="display: none"]');
    expect(hiddenText?.textContent).toBe('Loading scan results');
  });

  it('should render spinner with status role when loading', () => {
    const { container } = render(<ScanStatus status="scanning" isLoading={true} />);

    const spinner = container.querySelector('.spinner');
    expect(spinner).toHaveAttribute('role', 'status');
    expect(spinner).toHaveAttribute('aria-live', 'polite');
  });

  it('should render dot element inside spinner', () => {
    const { container } = render(<ScanStatus status="scanning" isLoading={true} />);

    const spinner = container.querySelector('.spinner');
    const dot = spinner?.querySelector('.dot');
    expect(dot).toBeInTheDocument();
  });

  it('should render scan status container', () => {
    const { container } = render(<ScanStatus status="queued" />);

    const container_element = container.querySelector('.scan-status-container');
    expect(container_element).toBeInTheDocument();
  });
});
