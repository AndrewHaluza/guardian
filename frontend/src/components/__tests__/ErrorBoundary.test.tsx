import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from '../ErrorBoundary';

// Component that throws an error
function ThrowError(): React.ReactNode {
  throw new Error('Test error message');
}

// Component that throws error with no message
function ThrowEmptyError(): React.ReactNode {
  throw new Error();
}

// Component that renders normally
function SafeComponent(): React.ReactNode {
  return <div>Safe content</div>;
}

describe('ErrorBoundary', () => {
  const renderWithRouter = (component: React.ReactNode) => {
    return render(<BrowserRouter>{component}</BrowserRouter>);
  };

  it('should render children when no error occurs', () => {
    renderWithRouter(
      <ErrorBoundary>
        <SafeComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Safe content')).toBeInTheDocument();
  });

  it('should display error message when error occurs', () => {
    renderWithRouter(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('⚠️ Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  it('should render error container with correct class', () => {
    const { container } = renderWithRouter(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    const errorContainer = container.querySelector('.error-boundary-container');
    expect(errorContainer).toBeInTheDocument();
  });

  it('should have error title with correct class', () => {
    const { container } = renderWithRouter(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    const title = container.querySelector('.error-boundary-title');
    expect(title).toBeInTheDocument();
    expect(title).toHaveTextContent('⚠️ Something went wrong');
  });

  it('should have error message with correct class', () => {
    const { container } = renderWithRouter(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    const message = container.querySelector('.error-boundary-message');
    expect(message).toBeInTheDocument();
    expect(message).toHaveTextContent('Test error message');
  });

  it('should render return to home button', () => {
    renderWithRouter(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    const button = screen.getByRole('button', { name: /Return to Home/i });
    expect(button).toBeInTheDocument();
  });

  it('should have button with correct class', () => {
    const { container } = renderWithRouter(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    const button = container.querySelector('.error-boundary-button');
    expect(button).toBeInTheDocument();
  });

  it('should show default message when error has no message', () => {
    renderWithRouter(
      <ErrorBoundary>
        <ThrowEmptyError />
      </ErrorBoundary>
    );

    expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument();
  });

  it('should navigate to home when button is clicked', async () => {
    const user = userEvent.setup();

    renderWithRouter(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    const button = screen.getByRole('button', { name: /Return to Home/i });
    await user.click(button);

    // After navigation, location should be "/"
    // In jsdom environment, we can check the window location
    expect(window.location.pathname).toBe('/');
  });

  it('should display error warning icon', () => {
    renderWithRouter(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('⚠️ Something went wrong')).toBeInTheDocument();
  });

  it('should prevent error propagation', () => {
    // If error bubbled up, the entire test would fail
    // Since this test passes, it confirms error was caught
    renderWithRouter(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('⚠️ Something went wrong')).toBeInTheDocument();
  });

  it('should work with multiple children', () => {
    renderWithRouter(
      <ErrorBoundary>
        <div>
          <p>Content 1</p>
          <p>Content 2</p>
        </div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Content 1')).toBeInTheDocument();
    expect(screen.getByText('Content 2')).toBeInTheDocument();
  });
});
