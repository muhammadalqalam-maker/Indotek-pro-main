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
      className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs p-4 space-y-3 ${
        onClick ? 'cursor-pointer hover:border-success dark:hover:border-success transition-colors' : ''
      }`}
      onClick={onClick}
    >
      <div className="space-y-1">
        <h3 className="font-semibold text-base text-slate-900 dark:text-slate-100">
          {title}
        </h3>
        {subtitle && (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {subtitle}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {metadata.map((item, idx) => (
          <div key={idx} className={item.highlight ? 'col-span-2' : ''}>
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              {item.label}
            </div>
            <div className={`text-sm font-medium ${
              item.highlight
                ? 'text-success dark:text-success'
                : 'text-slate-900 dark:text-slate-100'
            }`}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {actions && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
          {actions}
        </div>
      )}
    </div>
  );
};
