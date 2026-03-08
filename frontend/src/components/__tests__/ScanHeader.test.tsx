import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ScanHeader } from '../ScanHeader';

describe('ScanHeader', () => {
  const renderWithRouter = (component: React.ReactNode) => {
    return render(<BrowserRouter>{component}</BrowserRouter>);
  };

  it('should render title', () => {
    renderWithRouter(<ScanHeader title="Test Title" />);

    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });

  it('should render title in h1 element', () => {
    renderWithRouter(<ScanHeader title="Test Title" />);

    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Test Title');
  });

  it('should render subtitle when provided', () => {
    renderWithRouter(
      <ScanHeader title="Title" subtitle="Subtitle text" />
    );

    expect(screen.getByText('Subtitle text')).toBeInTheDocument();
  });

  it('should not render subtitle when not provided', () => {
    renderWithRouter(<ScanHeader title="Title" />);

    expect(screen.queryByText('Subtitle text')).not.toBeInTheDocument();
  });

  it('should render back button when showBackButton is true', () => {
    renderWithRouter(
      <ScanHeader title="Title" showBackButton={true} />
    );

    const backButton = screen.getByText(/Back to Home/i);
    expect(backButton).toBeInTheDocument();
  });

  it('should not render back button when showBackButton is false', () => {
    renderWithRouter(
      <ScanHeader title="Title" showBackButton={false} />
    );

    expect(screen.queryByText(/Back to Home/i)).not.toBeInTheDocument();
  });

  it('should render back button with correct aria-label', () => {
    renderWithRouter(
      <ScanHeader title="Title" showBackButton={true} />
    );

    const backButton = screen.getByRole('button', {
      name: /Back to home page/i,
    });
    expect(backButton).toBeInTheDocument();
  });

  it('should render header element', () => {
    const { container } = renderWithRouter(
      <ScanHeader title="Title" />
    );

    const header = container.querySelector('header');
    expect(header).toBeInTheDocument();
  });

  it('should have header class', () => {
    const { container } = renderWithRouter(
      <ScanHeader title="Title" />
    );

    const header = container.querySelector('header');
    expect(header).toHaveClass('header');
  });

  it('should render back button container when showBackButton is true', () => {
    const { container } = renderWithRouter(
      <ScanHeader title="Title" showBackButton={true} />
    );

    const backContainer = container.querySelector('.back-button-container');
    expect(backContainer).toBeInTheDocument();
  });

  it('should not render back button container when showBackButton is false', () => {
    const { container } = renderWithRouter(
      <ScanHeader title="Title" showBackButton={false} />
    );

    const backContainer = container.querySelector('.back-button-container');
    expect(backContainer).not.toBeInTheDocument();
  });

  it('should render back button with secondary styling', () => {
    renderWithRouter(
      <ScanHeader title="Title" showBackButton={true} />
    );

    const backButton = screen.getByRole('button', {
      name: /Back to home page/i,
    });
    expect(backButton).toHaveClass('btn', 'btn-secondary', 'btn-back');
  });

  it('should display back arrow icon', () => {
    renderWithRouter(
      <ScanHeader title="Title" showBackButton={true} />
    );

    const backButton = screen.getByRole('button');
    expect(backButton.textContent).toContain('← Back to Home');
  });

  it('should render with multiple subtitle lines if needed', () => {
    renderWithRouter(
      <ScanHeader
        title="Main Title"
        subtitle="ID: scan-123"
      />
    );

    expect(screen.getByText('ID: scan-123')).toBeInTheDocument();
  });

  it('should handle empty subtitle gracefully', () => {
    renderWithRouter(
      <ScanHeader title="Title" subtitle="" />
    );

    // Should not render empty paragraph
    expect(screen.getByText('Title')).toBeInTheDocument();
  });
});
