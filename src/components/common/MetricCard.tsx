import React from 'react';

interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: string;
    isPositive?: boolean;
    isNeutral?: boolean;
    label?: string;
  };
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  subtitle,
  trend,
  icon,
  badge,
  onClick,
  className = '',
}) => {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
      className={`bg-white rounded-xl border border-[#E2E8E4] p-4.5 sm:p-5 shadow-2xs transition-all ${
        onClick
          ? 'cursor-pointer hover:border-[#12352B]/40 hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12352B]/40'
          : ''
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <span className="text-xs font-medium text-[#69766F] tracking-tight">{label}</span>
        {icon && (
          <div className="w-8 h-8 rounded-lg bg-[#F5F7F6] text-[#285744] flex items-center justify-center shrink-0 border border-[#E2E8E4]/60">
            {icon}
          </div>
        )}
        {badge && !icon && <div>{badge}</div>}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-xl sm:text-2xl font-bold tracking-tight text-[#202B26] tabular-nums truncate">
          {value}
        </span>
      </div>

      {(subtitle || trend) && (
        <div className="mt-2.5 flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-[#69766F]">
          {trend && (
            <span
              className={`font-semibold tabular-nums ${
                trend.isNeutral
                  ? 'text-[#69766F]'
                  : trend.isPositive
                  ? 'text-[#1C6843]'
                  : 'text-[#A82A20]'
              }`}
            >
              {trend.value}
            </span>
          )}
          {trend?.label && <span className="text-[#69766F]">{trend.label}</span>}
          {subtitle && !trend && <span className="text-[#69766F]">{subtitle}</span>}
        </div>
      )}
    </div>
  );
};
