import React, { useEffect, useRef } from 'react';
import { X, Search, FolderKanban, Boxes, Truck } from 'lucide-react';

interface SearchBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchResults: {
    projects: Array<{ id: string; name: string; code?: string; client?: string }>;
    materials: Array<{ id: string; name: string; code?: string; currentStock?: number; unit?: string }>;
    pos: Array<{ id: string; name: string; supplierName?: string; itemDescription?: string }>;
  };
  totalResultsCount: number;
  onProjectClick?: (id: string) => void;
  onMaterialClick?: (id: string) => void;
  onPOClick?: (id: string) => void;
}

export const SearchBottomSheet: React.FC<SearchBottomSheetProps> = ({
  isOpen,
  onClose,
  searchValue,
  onSearchChange,
  searchResults,
  totalResultsCount,
  onProjectClick,
  onMaterialClick,
  onPOClick,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    previousActiveElementRef.current = document.activeElement as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    // Focus search input when opened
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 100);

    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
      if (
        previousActiveElementRef.current &&
        typeof previousActiveElementRef.current.focus === 'function'
      ) {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col md:hidden">
      {/* Backdrop */}
      <div
        className="flex-1 bg-text-primary/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Bottom Sheet */}
      <div className="bg-white border-t border-border-subtle rounded-t-2xl shadow-2xl max-h-[85vh] overflow-hidden flex flex-col pb-[env(safe-area-inset-bottom)]">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between gap-3 shrink-0">
          <h2 className="text-base font-semibold text-text-primary">Pencarian Global</h2>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-canvas rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 active:scale-95"
            aria-label="Tutup pencarian"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input */}
        <div className="px-4 py-3 border-b border-border-subtle shrink-0">
          <div className="relative flex items-center">
            <Search className="absolute left-3 w-5 h-5 text-text-muted pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Cari proyek, material, nomor PO..."
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full min-h-[44px] pl-10 pr-4 rounded-lg border border-border-subtle bg-white text-sm text-text-primary placeholder:text-text-muted/70 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1 overscroll-contain">
          {totalResultsCount === 0 && searchValue ? (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <Search className="w-12 h-12 text-text-muted/40 mb-3" />
              <p className="text-sm text-text-muted text-center">
                Tidak ada hasil untuk <span className="font-semibold text-text-primary">"{searchValue}"</span>
              </p>
            </div>
          ) : searchValue ? (
            <div className="space-y-5 p-4">
              {/* Projects */}
              {searchResults.projects.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-3 px-1">
                    <FolderKanban className="w-3.5 h-3.5 text-primary" />
                    <p className="text-xs font-semibold uppercase text-text-muted tracking-wider">
                      Proyek ({searchResults.projects.length})
                    </p>
                  </div>
                  <div className="space-y-2">
                    {searchResults.projects.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          onProjectClick?.(p.id);
                          onClose();
                        }}
                        className="w-full min-h-[44px] px-4 py-3 text-left bg-white hover:bg-canvas active:bg-canvas/70 rounded-lg border border-border-subtle transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
                      >
                        <div className="font-semibold text-sm text-text-primary">
                          {p.name}
                        </div>
                        {(p.code || p.client) && (
                          <div className="text-xs text-text-muted mt-1 font-mono">
                            {p.code && <span>{p.code}</span>}
                            {p.code && p.client && <span> · </span>}
                            {p.client && <span>{p.client}</span>}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Materials */}
              {searchResults.materials.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-3 px-1">
                    <Boxes className="w-3.5 h-3.5 text-primary" />
                    <p className="text-xs font-semibold uppercase text-text-muted tracking-wider">
                      Material & Stok ({searchResults.materials.length})
                    </p>
                  </div>
                  <div className="space-y-2">
                    {searchResults.materials.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          onMaterialClick?.(m.id);
                          onClose();
                        }}
                        className="w-full min-h-[44px] px-4 py-3 text-left bg-white hover:bg-canvas active:bg-canvas/70 rounded-lg border border-border-subtle transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
                      >
                        <div className="font-semibold text-sm text-text-primary">
                          {m.name}
                        </div>
                        {(m.code || (m.currentStock !== undefined && m.unit)) && (
                          <div className="text-xs text-text-muted mt-1">
                            {m.code && <span className="font-mono">{m.code}</span>}
                            {m.code && m.currentStock !== undefined && <span> · </span>}
                            {m.currentStock !== undefined && m.unit && (
                              <span>Stok: {m.currentStock} {m.unit}</span>
                            )}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Purchase Orders */}
              {searchResults.pos.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-3 px-1">
                    <Truck className="w-3.5 h-3.5 text-primary" />
                    <p className="text-xs font-semibold uppercase text-text-muted tracking-wider">
                      Pengadaan & PO ({searchResults.pos.length})
                    </p>
                  </div>
                  <div className="space-y-2">
                    {searchResults.pos.map((po) => (
                      <button
                        key={po.id}
                        onClick={() => {
                          onPOClick?.(po.id);
                          onClose();
                        }}
                        className="w-full min-h-[44px] px-4 py-3 text-left bg-white hover:bg-canvas active:bg-canvas/70 rounded-lg border border-border-subtle transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
                      >
                        <div className="font-semibold text-sm text-text-primary font-mono">
                          {po.name}
                        </div>
                        {(po.supplierName || po.itemDescription) && (
                          <div className="text-xs text-text-muted mt-1 truncate">
                            {po.supplierName && <span>{po.supplierName}</span>}
                            {po.supplierName && po.itemDescription && <span> · </span>}
                            {po.itemDescription && <span>{po.itemDescription}</span>}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <Search className="w-12 h-12 text-text-muted/40 mb-3" />
              <p className="text-sm text-text-muted">Mulai ketik untuk mencari</p>
              <p className="text-xs text-text-muted/70 mt-1">Min. 2 karakter</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
