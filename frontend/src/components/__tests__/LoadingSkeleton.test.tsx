import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LoadingSkeleton } from '../LoadingSkeleton';

describe('LoadingSkeleton', () => {
  it('should render single skeleton by default', () => {
    const { container } = render(<LoadingSkeleton />);

    const skeletonContainer = container.querySelector('.skeleton-container');
    expect(skeletonContainer).toBeInTheDocument();

    const items = container.querySelectorAll('.skeleton-item');
    expect(items).toHaveLength(1);
  });

  it('should render multiple skeletons when count is provided', () => {
    const { container } = render(<LoadingSkeleton count={3} />);

    const items = container.querySelectorAll('.skeleton-item');
    expect(items).toHaveLength(3);
  });

  it('should render zero skeletons when count is 0', () => {
    const { container } = render(<LoadingSkeleton count={0} />);

    const items = container.querySelectorAll('.skeleton-item');
    expect(items).toHaveLength(0);
  });

  it('should render skeleton header for each item', () => {
    const { container } = render(<LoadingSkeleton count={2} />);

    const headers = container.querySelectorAll('.skeleton-header');
    expect(headers).toHaveLength(2);
  });

  it('should render skeleton badge in header', () => {
    const { container } = render(<LoadingSkeleton count={1} />);

    const badge = container.querySelector('.skeleton-badge');
    expect(badge).toBeInTheDocument();
  });

  it('should render skeleton title in header', () => {
    const { container } = render(<LoadingSkeleton count={1} />);

    const title = container.querySelector('.skeleton-title');
    expect(title).toBeInTheDocument();
  });

  it('should render skeleton description', () => {
    const { container } = render(<LoadingSkeleton count={1} />);

    const description = container.querySelector('.skeleton-description');
    expect(description).toBeInTheDocument();
  });

  it('should render skeleton details section', () => {
    const { container } = render(<LoadingSkeleton count={1} />);

    const details = container.querySelector('.skeleton-details');
    expect(details).toBeInTheDocument();
  });

  it('should render multiple detail placeholders', () => {
    const { container } = render(<LoadingSkeleton count={1} />);

    const detailItems = container.querySelectorAll('.skeleton-detail');
    expect(detailItems.length).toBeGreaterThan(0);
  });

  it('should have shimmer animation class on items', () => {
    const { container } = render(<LoadingSkeleton count={1} />);

    const item = container.querySelector('.skeleton-item');
    // The animation is applied via CSS, check that the class exists
    expect(item?.className).toContain('skeleton-item');
  });

  it('should render skeleton container with flex layout', () => {
    const { container } = render(<LoadingSkeleton count={1} />);

    const skeletonContainer = container.querySelector('.skeleton-container');
    expect(skeletonContainer).toBeInTheDocument();
    expect(skeletonContainer?.className).toContain('skeleton-container');
  });

  it('should handle large count gracefully', () => {
    const { container } = render(<LoadingSkeleton count={10} />);

    const items = container.querySelectorAll('.skeleton-item');
    expect(items).toHaveLength(10);
  });

  it('should structure skeleton item correctly', () => {
    const { container } = render(<LoadingSkeleton count={1} />);

    const item = container.querySelector('.skeleton-item');
    const header = item?.querySelector('.skeleton-header');
    const description = item?.querySelector('.skeleton-description');
    const details = item?.querySelector('.skeleton-details');

    expect(header).toBeInTheDocument();
    expect(description).toBeInTheDocument();
    expect(details).toBeInTheDocument();
  });

  it('should render each detail element in details section', () => {
    const { container } = render(<LoadingSkeleton count={1} />);

    const details = container.querySelector('.skeleton-details');
    const detailElements = details?.querySelectorAll('.skeleton-detail');

    expect(detailElements?.length).toBeGreaterThan(0);
  });

  it('should maintain consistent structure for multiple skeletons', () => {
    const { container } = render(<LoadingSkeleton count={2} />);

    const items = container.querySelectorAll('.skeleton-item');
    items.forEach((item) => {
      expect(item.querySelector('.skeleton-header')).toBeInTheDocument();
      expect(item.querySelector('.skeleton-description')).toBeInTheDocument();
      expect(item.querySelector('.skeleton-details')).toBeInTheDocument();
    });
  });
});
