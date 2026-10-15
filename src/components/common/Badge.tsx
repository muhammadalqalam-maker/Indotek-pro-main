import React from 'react';

export type BadgeVariant =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'primary';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  className?: string;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  className = '',
  dot = false,
}) => {
  const variantStyles = {
    success: 'bg-success-bg text-success border-success-border',
    warning: 'bg-warning-bg text-warning border-warning-border',
    danger: 'bg-danger-bg text-danger border-danger-border',
    info: 'bg-info-bg text-info border-info-border',
    neutral: 'bg-neutral-bg text-text-secondary border-border-subtle',
    primary: 'bg-primary/10 text-primary border-primary/20',
  };

  const dotColors = {
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
    neutral: 'bg-text-muted',
    primary: 'bg-primary',
  };

  const sizeStyles = {
    sm: 'text-xs px-2 py-0.5 font-medium leading-none',
    md: 'text-xs px-2.5 py-1 font-medium leading-none',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border ${variantStyles[variant]} ${sizeStyles[size]} tracking-tight whitespace-nowrap ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors[variant]}`} />}
      <span>{children}</span>
    </span>
  );
};
