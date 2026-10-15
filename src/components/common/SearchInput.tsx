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
      <Search className="w-4 h-4 text-text-muted absolute left-3 pointer-events-none shrink-0" />
      <input
        type="text"
        inputMode="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Search"
        placeholder={placeholder}
        className="w-full min-h-[44px] md:h-9 pl-9 pr-10 py-2 md:py-0 text-xs bg-white border border-border-subtle rounded-lg text-text-primary placeholder-text-muted/70 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange('');
            if (onClear) onClear();
          }}
          className="absolute right-2.5 text-text-muted hover:text-text-primary p-1.5 md:p-0.5 rounded transition-colors min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center"
          aria-label="Hapus pencarian"
        >
          <X className="w-4 h-4 md:w-3.5 md:h-3.5" />
        </button>
      )}
    </div>
  );
};
