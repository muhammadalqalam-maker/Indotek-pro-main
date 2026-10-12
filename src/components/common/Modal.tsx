import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth,
  size,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Store previously focused element to restore on close
    previousActiveElementRef.current = document.activeElement as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // Basic focus trap within the dialog
      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    // Focus the dialog or the close button
    const timer = setTimeout(() => {
      if (dialogRef.current) {
        const firstFocusable = dialogRef.current.querySelector<HTMLElement>(
          'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (firstFocusable) {
          firstFocusable.focus();
        } else {
          dialogRef.current.focus();
        }
      }
    }, 50);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-xl',
    xl: 'max-w-2xl',
    '2xl': 'max-w-3xl',
  };

  const resolvedMaxWidth = (size as 'sm' | 'md' | 'lg' | 'xl' | '2xl') || maxWidth || 'md';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      role="presentation"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#202B26]/40 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`relative w-full ${maxWidthClasses[resolvedMaxWidth] || maxWidthClasses.md} bg-white rounded-xl border border-[#E2E8E4] shadow-xl overflow-hidden z-10 flex flex-col max-h-[90vh] focus:outline-none`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-header-title"
        aria-describedby={description ? 'modal-header-desc' : undefined}
      >
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-[#E2E8E4] flex items-start justify-between gap-4">
          <div>
            <h3 id="modal-header-title" className="text-base font-semibold text-[#202B26] tracking-tight">
              {title}
            </h3>
            {description && (
              <p id="modal-header-desc" className="text-xs text-[#69766F] mt-0.5 leading-relaxed">
                {description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-[#69766F] hover:text-[#202B26] hover:bg-[#F5F7F6] p-1.5 rounded-lg transition-colors -mr-1 focus:outline-none focus:ring-2 focus:ring-[#12352B]"
            aria-label="Tutup Dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto space-y-4 flex-1">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-3.5 bg-[#F9FBFA] border-t border-[#E2E8E4] flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
