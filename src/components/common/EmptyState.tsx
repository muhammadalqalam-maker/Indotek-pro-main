import React from 'react';
import { FolderSearch } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 sm:p-12 border border-dashed border-[#CBD5CF] rounded-xl bg-[#FAFBFB] ${className}`}
    >
      <div className="w-12 h-12 rounded-xl bg-[#EAEFEA] text-[#285744] flex items-center justify-center mb-4">
        {icon || <FolderSearch className="w-6 h-6" />}
      </div>
      <h4 className="text-sm font-semibold text-[#202B26] mb-1">{title}</h4>
      <p className="text-xs text-[#69766F] max-w-sm mb-5 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <Button variant="secondary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
