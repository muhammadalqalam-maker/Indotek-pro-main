import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useIsMobile } from '../../hooks/useMediaQuery';

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
  const isMobile = useIsMobile();

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

      // Focus trap within the dialog
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

  // Mobile: BottomSheet, Desktop: Centered Modal
  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-50 overflow-hidden"
        role="presentation"
      >
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-text-primary/40 backdrop-blur-sm transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />

        {/* BottomSheet */}
        <div className="fixed inset-x-0 bottom-0 z-10 flex flex-col max-h-[85vh] pb-[env(safe-area-inset-bottom)]">
          <div
            ref={dialogRef}
            tabIndex={-1}
            className="bg-white rounded-t-2xl border border-b-0 border-border-subtle shadow-2xl overflow-hidden flex flex-col focus:outline-none overscroll-contain"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-header-title"
            aria-describedby={description ? 'modal-header-desc' : undefined}
          >
            {/* Drag Handle */}
            <div className="pt-2 pb-1 flex justify-center shrink-0">
              <div className="w-10 h-1 bg-border-light rounded-full" aria-hidden="true" />
            </div>

            {/* Header */}
            <div className="px-4 py-3 border-b border-border-subtle flex items-start justify-between gap-3 shrink-0">
              <div className="flex-1 min-w-0">
                <h3 id="modal-header-title" className="text-sm font-semibold text-text-primary tracking-tight">
                  {title}
                </h3>
                {description && (
                  <p id="modal-header-desc" className="text-xs text-text-muted mt-0.5 leading-relaxed">
                    {description}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-canvas rounded-lg transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-primary"
                aria-label="Tutup Dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-4 py-4 overflow-y-auto space-y-4 flex-1 overscroll-contain">
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div className="px-4 py-3 bg-neutral-bg border-t border-border-subtle flex items-center justify-end gap-2 shrink-0">
                {footer}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Desktop: Centered Modal
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      role="presentation"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-text-primary/40 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`relative w-full ${maxWidthClasses[resolvedMaxWidth] || maxWidthClasses.md} bg-white rounded-xl border border-border-subtle shadow-xl overflow-hidden z-10 flex flex-col max-h-[90vh] focus:outline-none`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-header-title"
        aria-describedby={description ? 'modal-header-desc' : undefined}
      >
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-border-subtle flex items-start justify-between gap-4">
          <div>
            <h3 id="modal-header-title" className="text-base font-semibold text-[#202B26] tracking-tight">
              {title}
            </h3>
            {description && (
              <p id="modal-header-desc" className="text-xs text-text-muted mt-0.5 leading-relaxed">
                {description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary hover:bg-canvas p-1.5 rounded-lg transition-colors -mr-1 focus:outline-none focus:ring-2 focus:ring-primary"
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
          <div className="px-6 py-3.5 bg-neutral-bg border-t border-border-subtle flex items-center justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
