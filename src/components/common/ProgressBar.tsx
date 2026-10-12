import React from 'react';

interface ProgressBarProps {
  value: number; // actual % (0-100)
  planned?: number; // planned % (0-100)
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'success' | 'warning' | 'danger';
  showLabel?: boolean;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  planned,
  size = 'md',
  variant = 'primary',
  showLabel = false,
  className = '',
}) => {
  const clampedValue = Math.min(100, Math.max(0, value));
  const clampedPlanned = planned !== undefined ? Math.min(100, Math.max(0, planned)) : undefined;

  const heightClasses = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-3',
  };

  const fillColors = {
    primary: 'bg-[#12352B]',
    success: 'bg-[#1C6843]',
    warning: 'bg-[#D6A85C]',
    danger: 'bg-[#A82A20]',
  };

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className="flex justify-between items-center text-xs mb-1 tabular-nums">
          <span className="text-[#69766F] font-medium">Realisasi: {clampedValue.toFixed(1)}%</span>
          {clampedPlanned !== undefined && (
            <span className="text-[#69766F]">Rencana: {clampedPlanned.toFixed(1)}%</span>
          )}
        </div>
      )}
      <div className={`relative w-full bg-[#E2E8E4] rounded-full overflow-hidden ${heightClasses[size]}`}>
        <div
          className={`h-full rounded-full transition-all duration-300 ${fillColors[variant]}`}
          style={{ width: `${clampedValue}%` }}
        />
        {clampedPlanned !== undefined && (
          <div
            className="absolute top-0 bottom-0 w-1 bg-[#202B26] z-10 opacity-70"
            style={{ left: `calc(${clampedPlanned}% - 2px)` }}
            title={`Target Rencana: ${clampedPlanned}%`}
          />
        )}
      </div>
    </div>
  );
};
