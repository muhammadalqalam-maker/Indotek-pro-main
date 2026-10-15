import React from 'react';

export const LoadingSkeleton: React.FC<{ rows?: number; count?: number; className?: string }> = ({
  rows,
  count,
  className = '',
}) => {
  const effectiveRows = count ?? rows ?? 5;
  return (
    <div className={`space-y-3 animate-pulse ${className}`}>
      <div className="h-9 bg-success-light rounded-lg w-full" />
      {Array.from({ length: effectiveRows }).map((_, i) => (
        <div key={i} className="flex gap-4 items-center">
          <div className="h-8 bg-canvas-muted rounded w-1/4" />
          <div className="h-8 bg-canvas-muted rounded w-1/3" />
          <div className="h-8 bg-canvas-muted rounded w-1/5" />
          <div className="h-8 bg-canvas-muted rounded w-1/6" />
        </div>
      ))}
    </div>
  );
};

export const ScreenSkeleton: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`space-y-6 animate-pulse p-4 sm:p-6 ${className}`}>
      {/* Header bar skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
        <div className="space-y-2">
          <div className="h-6 bg-success-light rounded w-48" />
          <div className="h-3 bg-canvas-muted rounded w-80" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 bg-success-light rounded w-24" />
          <div className="h-8 bg-success-light rounded w-28" />
        </div>
      </div>

      {/* Metric cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-4 rounded-xl border border-border-subtle bg-white space-y-3">
            <div className="flex justify-between items-center">
              <div className="h-3 bg-canvas-muted rounded w-20" />
              <div className="w-8 h-8 rounded-lg bg-success-light" />
            </div>
            <div className="h-7 bg-success-light rounded w-32" />
            <div className="h-2 bg-canvas-muted rounded w-24" />
          </div>
        ))}
      </div>

      {/* Main content table / cards skeleton */}
      <div className="rounded-xl border border-border-subtle bg-white p-5 space-y-4">
        <div className="flex justify-between items-center pb-3 border-b border-border-subtle">
          <div className="h-5 bg-success-light rounded w-36" />
          <div className="h-8 bg-canvas-muted rounded w-48" />
        </div>
        <LoadingSkeleton rows={5} />
      </div>
    </div>
  );
};
