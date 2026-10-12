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
      {label && <span className="text-xs text-[#69766F] mr-2 shrink-0 select-none">{label}:</span>}
      <div className="relative w-full">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="appearance-none w-full h-9 bg-white border border-[#E2E8E4] rounded-lg pl-3 pr-8 text-xs font-medium text-[#202B26] hover:border-[#CBD5CF] focus:outline-none focus:border-[#12352B] focus:ring-1 focus:ring-[#12352B] cursor-pointer transition-colors"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-[#69766F] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    </div>
  );
};
