import React from 'react';
import { useIsMobile } from '../../hooks/useMediaQuery';

interface ResponsiveTableProps<T> {
  data: T[];
  renderTable: () => React.ReactNode;
  renderCard: (item: T) => React.ReactNode;
  cardGridCols?: string;
}

export const ResponsiveTable = React.forwardRef<
  HTMLDivElement,
  ResponsiveTableProps<any>
>(({ data, renderTable, renderCard, cardGridCols = 'grid-cols-1' }, ref) => {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div ref={ref} className={`grid ${cardGridCols} gap-4`}>
        {data.map((item, idx) => (
          <div key={idx}>{renderCard(item)}</div>
        ))}
      </div>
    );
  }

  return (
    <div ref={ref} className="overflow-x-auto">
      {renderTable()}
    </div>
  );
});

ResponsiveTable.displayName = 'ResponsiveTable';
