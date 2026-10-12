import React from 'react';
import { Search, X } from 'lucide-react';

interface SearchInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  onClear?: () => void;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Cari...',
  className = '',
  onClear,
}) => {
  return (
    <div className={`relative flex items-center ${className}`}>
      <Search className="w-4 h-4 text-[#69766F] absolute left-3 pointer-events-none shrink-0" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={placeholder}
        placeholder={placeholder}
        className="w-full h-9 pl-9 pr-8 text-xs bg-white border border-[#E2E8E4] rounded-lg text-[#202B26] placeholder-[#69766F]/70 focus:outline-none focus:border-[#12352B] focus:ring-1 focus:ring-[#12352B] transition-colors"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange('');
            if (onClear) onClear();
          }}
          className="absolute right-2.5 text-[#69766F] hover:text-[#202B26] p-0.5 rounded transition-colors"
          aria-label="Hapus pencarian"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
