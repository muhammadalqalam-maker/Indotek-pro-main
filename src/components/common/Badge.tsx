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
    success: 'bg-[#E5F4EB] text-[#1C6843] border-[#CDE9D7]',
    warning: 'bg-[#FFF3D8] text-[#9E6B05] border-[#FCE6B1]',
    danger: 'bg-[#FCE9E7] text-[#A82A20] border-[#F8CBC7]',
    info: 'bg-[#E8F0FA] text-[#235D9F] border-[#CEE0F5]',
    neutral: 'bg-[#F1F4F2] text-[#4F5D56] border-[#E2E8E4]',
    primary: 'bg-[#12352B]/10 text-[#12352B] border-[#12352B]/20',
  };

  const dotColors = {
    success: 'bg-[#1C6843]',
    warning: 'bg-[#9E6B05]',
    danger: 'bg-[#A82A20]',
    info: 'bg-[#235D9F]',
    neutral: 'bg-[#69766F]',
    primary: 'bg-[#12352B]',
  };

  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5 font-medium leading-none',
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
