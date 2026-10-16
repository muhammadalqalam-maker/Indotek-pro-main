import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';

// Mock useIsMobile hook
vi.mock('../../hooks/useMediaQuery', () => ({
  useIsMobile: vi.fn(() => false),
}));

describe('Modal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    title: 'Test Modal',
    children: <div>Modal content</div>,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders when isOpen is true', () => {
    render(<Modal {...defaultProps} />);
    expect(screen.getByText('Test Modal')).toBeInTheDocument();
    expect(screen.getByText('Modal content')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<Modal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('Test Modal')).not.toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<Modal {...defaultProps} description="Modal description" />);
    expect(screen.getByText('Modal description')).toBeInTheDocument();
  });

  it('renders footer when provided', () => {
    render(<Modal {...defaultProps} footer={<button>Submit</button>} />);
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
  });

  it('calls onClose when backdrop is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(<Modal {...defaultProps} onClose={onClose} />);
    
    const backdrop = container.querySelector('[aria-hidden="true"]');
    if (backdrop) {
      await user.click(backdrop);
      expect(onClose).toHaveBeenCalledOnce();
    }
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Modal {...defaultProps} onClose={onClose} />);
    
    const closeButton = screen.getByRole('button', { name: /close|tutup/i });
    await user.click(closeButton);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Escape key is pressed', async () => {
    const onClose = vi.fn();
    render(<Modal {...defaultProps} onClose={onClose} />);
    
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    window.dispatchEvent(event);
    
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it('locks body scroll when open', () => {
    render(<Modal {...defaultProps} />);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('restores body scroll when closed', () => {
    const { rerender } = render(<Modal {...defaultProps} />);
    expect(document.body.style.overflow).toBe('hidden');
    
    rerender(<Modal {...defaultProps} isOpen={false} />);
    expect(document.body.style.overflow).toBe('unset');
  });

  it('applies maxWidth classes correctly', () => {
    const { container: smContainer } = render(<Modal {...defaultProps} maxWidth="sm" />);
    expect(smContainer.querySelector('.max-w-md')).toBeInTheDocument();

    const { container: lgContainer } = render(<Modal {...defaultProps} maxWidth="lg" />);
    expect(lgContainer.querySelector('.max-w-xl')).toBeInTheDocument();
  });

  it('applies size prop (alias for maxWidth)', () => {
    const { container } = render(<Modal {...defaultProps} size="xl" />);
    expect(container.querySelector('.max-w-2xl')).toBeInTheDocument();
  });

  it('has role="dialog" for accessibility', () => {
    render(<Modal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('has aria-labelledby pointing to title', () => {
    render(<Modal {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    const titleId = dialog.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    
    const titleElement = document.getElementById(titleId!);
    expect(titleElement).toHaveTextContent('Test Modal');
  });

  it('has aria-describedby when description provided', () => {
    render(<Modal {...defaultProps} description="Description text" />);
    const dialog = screen.getByRole('dialog');
    const descId = dialog.getAttribute('aria-describedby');
    expect(descId).toBeTruthy();
    
    const descElement = document.getElementById(descId!);
    expect(descElement).toHaveTextContent('Description text');
  });

  it('focuses the dialog close button on open', async () => {
    render(
      <Modal {...defaultProps}>
        <input type="text" placeholder="First input" />
        <button>Second button</button>
      </Modal>
    );

    await waitFor(() => {
      const closeButton = screen.getByRole('button', { name: 'Tutup Dialog' });
      expect(document.activeElement).toBe(closeButton);
    }, { timeout: 200 });
  });

  it('keeps focus in the input when the parent rerenders while typing', async () => {
    const user = userEvent.setup({ delay: 10 });
    const ModalWithInlineClose = () => {
      const [value, setValue] = useState('');
      return (
        <Modal isOpen onClose={() => {}} title="Typing test">
          <input
            aria-label="Project name"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </Modal>
      );
    };

    render(<ModalWithInlineClose />);
    const input = screen.getByRole('textbox', { name: 'Project name' });
    await user.click(input);
    await user.type(input, 'Project');

    expect(input).toHaveValue('Project');
    expect(document.activeElement).toBe(input);
  });

  it('contains close button with accessible label', () => {
    render(<Modal {...defaultProps} />);
    const closeBtn = screen.getByRole('button', { name: /close|tutup/i });
    expect(closeBtn).toBeInTheDocument();
  });
});
