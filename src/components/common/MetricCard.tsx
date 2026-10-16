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
      className={`flex h-full min-w-0 flex-col bg-white rounded-xl border border-border-subtle p-4.5 sm:p-5 shadow-2xs transition-all ${
        onClick
          ? 'cursor-pointer hover:border-primary/40 hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
          : ''
      } ${className}`}
    >
      <div className="mb-2 flex w-full min-w-0 items-start justify-between gap-3">
        <span className="min-w-0 flex-1 text-xs font-medium leading-snug text-text-muted tracking-tight">{label}</span>
        {icon && (
          <div className="w-8 h-8 rounded-lg bg-canvas text-primary-light flex items-center justify-center shrink-0 border border-border-subtle/60">
            {icon}
          </div>
        )}
        {badge && !icon && <div>{badge}</div>}
      </div>

      <div className="flex w-full min-w-0 items-baseline gap-2">
        <span className="max-w-full truncate text-xl sm:text-2xl font-bold tracking-tight text-text-primary tabular-nums">
          {value}
        </span>
      </div>

      {(subtitle || trend) && (
        <div className="mt-2.5 flex w-full min-w-0 flex-wrap items-start gap-x-2 gap-y-1 text-xs leading-relaxed text-text-muted">
          {trend && (
            <span
              className={`font-semibold tabular-nums ${
                trend.isNeutral
                  ? 'text-text-muted'
                  : trend.isPositive
                  ? 'text-success'
                  : 'text-danger'
              }`}
            >
              {trend.value}
            </span>
          )}
          {trend?.label && <span className="text-text-muted">{trend.label}</span>}
          {subtitle && !trend && <span className="text-text-muted">{subtitle}</span>}
        </div>
      )}
    </div>
  );
};
