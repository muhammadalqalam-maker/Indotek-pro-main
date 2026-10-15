import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

// Mock useIsMobile hook
vi.mock('../../hooks/useMediaQuery', () => ({
  useIsMobile: () => false,
}));

describe('Button', () => {
  it('renders button with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('Click me');
  });

  it('applies primary variant by default', () => {
    const { container } = render(<Button>Submit</Button>);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-primary');
  });

  it('applies secondary variant', () => {
    const { container } = render(<Button variant="secondary">Secondary</Button>);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-surface');
  });

  it('applies danger variant', () => {
    const { container } = render(<Button variant="danger">Delete</Button>);
    const btn = container.querySelector('button');
    expect(btn?.className).toContain('bg-danger');
  });

  it('disables button when disabled prop true', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('disables button during loading', () => {
    render(<Button isLoading>Loading</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows loading spinner when isLoading true', () => {
    const { container } = render(<Button isLoading>Loading</Button>);
    expect(container.querySelector('svg')).toHaveClass('animate-spin');
  });

  it('handles click events', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    
    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('renders left icon', () => {
    render(<Button leftIcon={<span>←</span>}>Back</Button>);
    expect(screen.getByText('←')).toBeInTheDocument();
  });

  it('renders right icon', () => {
    render(<Button rightIcon={<span>→</span>}>Next</Button>);
    expect(screen.getByText('→')).toBeInTheDocument();
  });

  it('renders icon-only button with aria-label', () => {
    render(<Button leftIcon={<span>⚙️</span>} aria-label="Settings" />);
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });

  it('sets default aria-label for icon-only button without label', () => {
    render(<Button leftIcon={<span>⚙️</span>} />);
    expect(screen.getByRole('button', { name: 'Button' })).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<Button className="custom-class">Custom</Button>);
    expect(container.querySelector('button')).toHaveClass('custom-class');
  });

  it('applies size classes correctly', () => {
    const { container: smallContainer } = render(<Button size="sm">Small</Button>);
    expect(smallContainer.querySelector('button')?.className).toContain('md:min-h-8');

    const { container: largeContainer } = render(<Button size="lg">Large</Button>);
    expect(largeContainer.querySelector('button')?.className).toContain('md:min-h-10');
  });

  it('has minimum tap target of 44px on mobile', () => {
    const { container } = render(<Button>Touch</Button>);
    expect(container.querySelector('button')?.className).toContain('min-h-[44px]');
  });

  it('handles right icon with loading state (hides icon)', async () => {
    const { container } = render(
      <Button rightIcon={<span>→</span>} isLoading>
        Loading
      </Button>
    );
    expect(screen.queryByText('→')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('has focus ring for accessibility', () => {
    const { container } = render(<Button>Focus me</Button>);
    expect(container.querySelector('button')?.className).toContain('focus-visible:ring-2');
  });
});
