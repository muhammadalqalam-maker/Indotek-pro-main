import React from 'react';

interface DataCardMetadata {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}

interface DataCardProps {
  title: string;
  subtitle?: string;
  metadata: DataCardMetadata[];
  actions?: React.ReactNode;
  onClick?: () => void;
}

export const DataCard: React.FC<DataCardProps> = ({
  title,
  subtitle,
  metadata,
  actions,
  onClick,
}) => {
  return (
    <div
      className={`bg-surface rounded-xl border border-border-subtle shadow-2xs p-4 space-y-3 ${
        onClick ? 'cursor-pointer hover:border-primary/40 hover:shadow-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40' : ''
      }`}
      onClick={onClick}
    >
      <div className="space-y-1">
        <h3 className="font-semibold text-base text-text-primary">
          {title}
        </h3>
        {subtitle && (
          <p className="text-sm text-text-secondary">
            {subtitle}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {metadata.map((item, idx) => (
          <div key={idx} className={item.highlight ? 'col-span-2' : ''}>
            <div className="text-xs text-text-muted mb-0.5">
              {item.label}
            </div>
            <div className={`text-sm font-medium ${
              item.highlight
                ? 'text-success'
                : 'text-text-primary'
            }`}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {actions && (
        <div className="pt-2 border-t border-border-subtle">
          {actions}
        </div>
      )}
    </div>
  );
};
