import React from 'react';
import { Loader2 } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { useIsMobile } from '../../hooks/useMediaQuery';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  'aria-label': ariaLabel,
  ...props
}) => {
  const isMobile = useIsMobile();
  
  // Responsive size mapping: smaller size on mobile for default→sm, lg→md
  const responsiveSize = isMobile && size === 'lg' ? 'md' : size;
  
  const baseClasses =
    'inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shrink-0 rounded-lg select-none';

  // 44px minimum tap target on mobile, smaller on desktop
  const sizeClasses = {
    xs: 'text-xs px-3 py-2 gap-1 min-h-[44px] md:min-h-7 md:px-2 md:py-1 rounded-md',
    sm: 'text-xs px-3 py-2.5 gap-1.5 min-h-[44px] md:min-h-8 md:px-2.5 md:py-1.5',
    md: 'text-sm px-4 py-3 gap-2 min-h-[44px] md:min-h-9 md:px-3.5 md:py-2',
    lg: 'text-sm px-5 py-3.5 gap-2.5 min-h-[44px] md:min-h-10 md:px-4 md:py-2.5',
  };

  const variantClasses = {
    primary:
      'bg-primary text-white hover:bg-primary-light active:bg-primary-hover shadow-xs',
    secondary:
      'bg-surface text-text-primary border border-border-subtle hover:bg-neutral-light hover:border-border-light active:bg-neutral-bg shadow-2xs',
    accent:
      'bg-accent-gold text-primary font-semibold hover:bg-accent-gold-dark active:bg-accent-gold-darker',
    ghost:
      'text-text-primary hover:bg-neutral-bg hover:text-primary',
    danger:
      'bg-danger text-white hover:bg-danger-hover active:bg-danger-dark',
  };

  // Icon-only buttons require aria-label
  const isIconOnly = !children && (leftIcon || rightIcon);
  const effectiveAriaLabel = ariaLabel || (isIconOnly ? 'Button' : undefined);

  return (
    <button
      className={twMerge(baseClasses, sizeClasses[responsiveSize], variantClasses[variant], className)}
      disabled={disabled || isLoading}
      aria-label={effectiveAriaLabel}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : (
        leftIcon && <span className="shrink-0">{leftIcon}</span>
      )}
      {children && <span>{children}</span>}
      {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
    </button>
  );
};
