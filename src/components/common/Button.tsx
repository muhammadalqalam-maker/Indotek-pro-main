import React from 'react';
import { Loader2 } from 'lucide-react';

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
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12352B]/40 focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shrink-0 rounded-lg select-none';

  const sizeClasses = {
    xs: 'text-[11px] px-2 py-1 gap-1 h-7 rounded-md',
    sm: 'text-xs px-2.5 py-1.5 gap-1.5 h-8',
    md: 'text-sm px-3.5 py-2 gap-2 h-9',
    lg: 'text-sm px-4 py-2.5 gap-2.5 h-10',
  };

  const variantClasses = {
    primary:
      'bg-[#12352B] text-white hover:bg-[#285744] active:bg-[#0c241d] shadow-xs',
    secondary:
      'bg-white text-[#202B26] border border-[#E2E8E4] hover:bg-[#F5F7F6] hover:border-[#CBD5CF] active:bg-[#EAEFEA] shadow-2xs',
    accent:
      'bg-[#D6A85C] text-[#12352B] font-semibold hover:bg-[#c4984d] active:bg-[#b2873f]',
    ghost:
      'text-[#202B26] hover:bg-[#EAEFEA] hover:text-[#12352B]',
    danger:
      'bg-[#A82A20] text-white hover:bg-[#8e231a] active:bg-[#721c15]',
  };

  return (
    <button
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : (
        leftIcon && <span className="shrink-0">{leftIcon}</span>
      )}
      <span>{children}</span>
      {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
    </button>
  );
};
