import React from 'react';
import { ChevronDown } from 'lucide-react';

interface FilterOption {
  value: string;
  label: string;
}

interface FilterDropdownProps {
  label?: string;
  value: string;
  options: FilterOption[];
  onChange: (val: string) => void;
  className?: string;
}

export const FilterDropdown: React.FC<FilterDropdownProps> = ({
  label,
  value,
  options,
  onChange,
  className = '',
}) => {
  return (
    <div className={`relative inline-flex items-center ${className}`}>
      {label && <span className="text-xs text-text-muted mr-2 shrink-0 select-none">{label}:</span>}
      <div className="relative w-full">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="appearance-none w-full h-9 bg-white border border-border-subtle rounded-lg pl-3 pr-8 text-xs font-medium text-text-primary hover:border-border-light focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer transition-colors"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-text-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    </div>
  );
};
