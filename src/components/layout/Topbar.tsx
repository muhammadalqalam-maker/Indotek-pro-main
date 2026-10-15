import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Menu,
  Bell,
  Plus,
  Search,
  Building2,
  Calendar,
  ChevronRight,
  FolderKanban,
  Boxes,
  Truck,
  X,
  ArrowRight,
  LogIn,
  Shield,
  ChevronDown,
  Check
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { getRouteConfig } from '../../config/routes';
import { Button } from '../common/Button';
import { ALL_ROLES, ROLE_DEFINITIONS } from '../../lib/rbac';
import { AppRole } from '../../types/rbac';
import { SyncStatusIndicator } from '../common/SyncStatusIndicator';
import { SearchBottomSheet } from './SearchBottomSheet';

export const Topbar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const {
    selectedProjectId,
    projects,
    materials,
    purchaseOrders,
    navigateToProjectDetail,
    setMobileMenuOpen,
    notificationsOpen,
    setNotificationsOpen,
    unreadNotificationCount,
    setIsAddProjectModalOpen,
    globalSearch,
    setGlobalSearch,
    addToast,
  } = useApp();

  const { currentUser, userProfile, setIsLoginModalOpen, activeRole, setActiveRole, isAdmin } = useAuth();

  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const roleMenuRef = useRef<HTMLDivElement>(null);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const routeConfig = getRouteConfig(location.pathname);

  // Set document title from route config
  useEffect(() => {
    if (routeConfig?.title) {
      document.title = `${routeConfig.title} - Indotek Pro`;
    }
  }, [routeConfig]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setIsSearchFocused(false);
      }
      if (
        roleMenuRef.current &&
        !roleMenuRef.current.contains(e.target as Node)
      ) {
        setIsRoleMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navInfo = routeConfig
    ? { section: routeConfig.section || 'Workspace', title: routeConfig.title || 'Indotek Pro' }
    : { section: 'Workspace', title: 'Indotek Pro' };

  // Search filtering
  const query = globalSearch.trim().toLowerCase();
  const searchResults = query.length >= 2 ? {
    projects: projects.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.code.toLowerCase().includes(query) ||
        p.client.toLowerCase().includes(query)
    ).slice(0, 3),
    materials: materials.filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        m.code.toLowerCase().includes(query) ||
        m.primarySupplier.toLowerCase().includes(query)
    ).slice(0, 3),
    pos: purchaseOrders.filter(
      (po) =>
        po.poNumber.toLowerCase().includes(query) ||
        po.supplierName.toLowerCase().includes(query) ||
        po.itemDescription.toLowerCase().includes(query)
    ).slice(0, 3),
  } : null;

  const totalResultsCount = searchResults
    ? searchResults.projects.length + searchResults.materials.length + searchResults.pos.length
    : 0;

  return (
    <header className="h-16 bg-white border-b border-border-subtle px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-20 shrink-0">
      {/* Zone 1: Mobile Toggle & Breadcrumbs */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1 sm:flex-initial">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="md:hidden p-2 -ml-2 rounded-lg text-text-primary hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 cursor-pointer"
          aria-label="Buka Navigasi Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-text-muted truncate">
          <button
            onClick={() => navigate('/')}
            className="hidden sm:inline font-medium hover:text-text-primary transition-colors cursor-pointer"
          >
            Indotek Pro
          </button>
          <ChevronRight className="w-3.5 h-3.5 hidden sm:inline text-text-muted/70 shrink-0" aria-hidden="true" />
          <span className="text-text-muted hidden md:inline truncate">{navInfo.section}</span>
          <ChevronRight className="w-3.5 h-3.5 hidden md:inline text-text-muted/70 shrink-0" aria-hidden="true" />
          <span className="font-semibold text-text-primary truncate">{navInfo.title}</span>
        </nav>
      </div>

      {/* Zone 2: Global Search */}
      <div ref={searchContainerRef} className="hidden md:flex items-center max-w-xs xl:max-w-sm w-full mx-4 relative">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={globalSearch}
            onChange={(e) => {
              setGlobalSearch(e.target.value);
              setIsSearchFocused(true);
            }}
            onFocus={() => setIsSearchFocused(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setIsSearchFocused(false);
            }}
            placeholder="Cari proyek, material, nomor PO..."
            className="w-full h-9 bg-canvas border border-border-subtle rounded-lg pl-9 pr-8 text-xs text-text-primary placeholder-text-muted/80 focus:outline-none focus:border-primary focus:bg-white transition-colors"
          />
          {globalSearch && (
            <button
              onClick={() => {
                setGlobalSearch('');
                setIsSearchFocused(false);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-0.5 rounded cursor-pointer"
              aria-label="Bersihkan pencarian"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Live Search Results Dropdown */}
        {isSearchFocused && query.length >= 2 && searchResults && (
          <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-border-subtle rounded-xl shadow-xl overflow-hidden z-30 max-h-96 overflow-y-auto">
            {totalResultsCount === 0 ? (
              <div className="p-4 text-center text-xs text-text-muted">
                Tidak ada hasil untuk <span className="font-medium text-text-primary">"{globalSearch}"</span>
              </div>
            ) : (
              <div className="divide-y divide-border-subtle/60 text-xs">
                {searchResults.projects.length > 0 && (
                  <div className="p-2">
                    <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                      <FolderKanban className="w-3 h-3 text-primary-light" />
                      <span>Proyek ({searchResults.projects.length})</span>
                    </div>
                    {searchResults.projects.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          navigateToProjectDetail(p.id);
                          setGlobalSearch('');
                          setIsSearchFocused(false);
                        }}
                        className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-canvas flex items-center justify-between group transition-colors cursor-pointer"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-semibold text-text-primary group-hover:text-primary truncate">
                            {p.name}
                          </div>
                          <div className="text-xs text-text-muted font-mono tabular-nums">
                            {p.code} · {p.client}
                          </div>
                        </div>
                        <span className="text-xs text-primary-light font-medium shrink-0 group-hover:translate-x-0.5 transition-transform">
                          Buka →
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {searchResults.materials.length > 0 && (
                  <div className="p-2">
                    <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                      <Boxes className="w-3 h-3 text-primary-light" />
                      <span>Material & Stok ({searchResults.materials.length})</span>
                    </div>
                    {searchResults.materials.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          navigate('/material');
                          setGlobalSearch('');
                          setIsSearchFocused(false);
                        }}
                        className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-canvas flex items-center justify-between group transition-colors cursor-pointer"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-semibold text-text-primary group-hover:text-primary truncate">
                            {m.name}
                          </div>
                          <div className="text-xs text-text-muted">
                            Stok: {m.currentStock} {m.unit} · {m.allocatedProject}
                          </div>
                        </div>
                        <span className="text-xs text-primary-light font-medium shrink-0 group-hover:translate-x-0.5 transition-transform">
                          Gudang →
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {searchResults.pos.length > 0 && (
                  <div className="p-2">
                    <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                      <Truck className="w-3 h-3 text-primary-light" />
                      <span>Pengadaan & PO ({searchResults.pos.length})</span>
                    </div>
                    {searchResults.pos.map((po) => (
                      <button
                        key={po.id}
                        onClick={() => {
                          navigate('/pengadaan');
                          setGlobalSearch('');
                          setIsSearchFocused(false);
                        }}
                        className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-canvas flex items-center justify-between group transition-colors cursor-pointer"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-semibold text-text-primary group-hover:text-primary truncate font-mono">
                            {po.poNumber}
                          </div>
                          <div className="text-xs text-text-muted truncate">
                            {po.supplierName} · {po.itemDescription}
                          </div>
                        </div>
                        <span className="text-xs text-primary-light font-medium shrink-0 group-hover:translate-x-0.5 transition-transform">
                          PO →
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Zone 3: Actions & Notifications */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Mobile Search Icon */}
        <button
          onClick={() => setIsMobileSearchOpen(true)}
          className="md:hidden p-2 rounded-lg text-text-primary hover:bg-canvas border border-transparent hover:border-border-subtle transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Cari proyek, material, atau PO"
          title="Pencarian Global"
        >
          <Search className="w-4 h-4" />
        </button>

        <SyncStatusIndicator />
        <button
          onClick={() => setNotificationsOpen(!notificationsOpen)}
          className="relative p-2 rounded-lg text-text-primary hover:bg-canvas border border-transparent hover:border-border-subtle transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 cursor-pointer"
          aria-label={`Notifikasi Operasional (${unreadNotificationCount} belum dibaca)`}
          title="Notifikasi Operasional"
        >
          <Bell className="w-4 h-4 text-text-primary" />
          {unreadNotificationCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger rounded-full ring-2 ring-white" />
          )}
        </button>

        {/* Role Display / Mode 'Lihat sebagai' (Hanya Admin atau DEV) */}
        {isAdmin || import.meta.env.DEV ? (
          <div ref={roleMenuRef} className="relative">
            <button
              onClick={() => setIsRoleMenuOpen(!isRoleMenuOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border-subtle bg-canvas hover:bg-canvas/80 hover:border-primary/30 text-xs font-semibold text-primary transition-all cursor-pointer shadow-2xs"
              title="Mode Pratinjau Tampilan: Lihat sebagai peran lain (Hanya Admin / Dev)"
            >
              <Shield className="w-3.5 h-3.5 text-primary-light" />
              <span className="hidden sm:inline font-mono text-xs font-bold text-primary max-w-[130px] truncate">
                {activeRole}
              </span>
              <span className="hidden md:inline text-xs px-1.5 py-0.5 bg-warning/25 text-text-muted/70 rounded font-bold uppercase tracking-wider">
                Pratinjau
              </span>
              <ChevronDown className={`w-3 h-3 text-text-muted transition-transform duration-200 ${isRoleMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {isRoleMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-76 bg-white border border-border-subtle rounded-xl shadow-xl overflow-hidden z-30 divide-y divide-border-subtle/60">
                <div className="p-3 bg-canvas/60">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary">
                      Mode Pratinjau: Lihat Sebagai
                    </span>
                    <span className="text-xs px-1.5 py-0.5 bg-warning/25 text-text-muted/70 rounded font-bold uppercase">
                      Admin / Dev
                    </span>
                  </div>
                  <div className="text-xs text-text-muted/80 mt-1 leading-snug">
                    Simulasi tampilan antarmuka. Hak penulisan database tetap dibatasi oleh aturan keamanan server.
                  </div>
                </div>
                <div className="py-1 max-h-72 overflow-y-auto">
                  {ALL_ROLES.map((role) => {
                    const roleMeta = ROLE_DEFINITIONS[role];
                    const isSelected = activeRole === role;
                    return (
                      <button
                        key={role}
                        onClick={() => {
                          setActiveRole(role);
                          setIsRoleMenuOpen(false);
                          addToast({
                            type: 'info',
                            title: `Pratinjau: ${role}`,
                            message: `Menampilkan antarmuka sebagai ${roleMeta.displayName}.`,
                          });
                        }}
                        className={`w-full text-left px-3 py-2 text-xs flex items-start justify-between gap-2 hover:bg-canvas transition-colors cursor-pointer ${
                          isSelected ? 'bg-success/10 text-primary font-semibold' : 'text-text-primary'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate">{role}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-success shrink-0" />}
                          </div>
                          <div className="text-xs text-text-muted truncate mt-0.5 font-normal">
                            {roleMeta.department}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border-subtle bg-canvas text-xs font-semibold text-primary">
            <Shield className="w-3.5 h-3.5 text-primary-light" />
            <span className="hidden sm:inline font-mono text-xs font-bold text-primary max-w-[130px] truncate">
              {userProfile?.role || activeRole}
            </span>
          </div>
        )}

        <div className="h-5 w-px bg-border-subtle hidden sm:block" />

        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => setIsAddProjectModalOpen(true)}
          className="hidden sm:inline-flex"
        >
          Tambah Proyek
        </Button>

        {/* Auth / Account Profile Button */}
        {currentUser ? (
          <button
            onClick={() => setIsLoginModalOpen(true)}
            className="flex items-center gap-1.5 p-1 pl-2 pr-2.5 rounded-lg border border-border-subtle bg-white hover:bg-canvas text-xs font-medium text-text-primary transition-colors cursor-pointer"
            title="Profil Pengguna & Sesi"
          >
            <div className="w-6 h-6 rounded-full bg-primary text-warning font-semibold text-xs flex items-center justify-center shrink-0">
              {currentUser.displayName ? currentUser.displayName.slice(0, 2).toUpperCase() : 'BS'}
            </div>
            <span className="hidden xl:inline text-xs truncate max-w-[100px]">
              {userProfile?.name?.split(' ')[0] || currentUser.displayName?.split(' ')[0] || 'User'}
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-success" title="Terkoneksi Firebase" />
          </button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsLoginModalOpen(true)}
            leftIcon={<LogIn className="w-3.5 h-3.5" />}
          >
            Masuk
          </Button>
        )}

        {/* Mobile quick add button */}
        <button
          onClick={() => setIsAddProjectModalOpen(true)}
          className="sm:hidden p-2 rounded-lg bg-primary text-white hover:bg-primary-light transition-colors cursor-pointer"
          aria-label="Tambah Proyek Baru"
          title="Tambah Proyek"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Mobile Search BottomSheet */}
      <SearchBottomSheet
        isOpen={isMobileSearchOpen}
        onClose={() => setIsMobileSearchOpen(false)}
        searchValue={globalSearch}
        onSearchChange={setGlobalSearch}
        searchResults={{
          projects: (searchResults?.projects || []).map(p => ({ id: p.id, name: p.name })),
          materials: (searchResults?.materials || []).map(m => ({ id: m.id, name: m.name })),
          pos: (searchResults?.pos || []).map(po => ({ id: po.id, name: po.poNumber }))
        }}
        totalResultsCount={totalResultsCount}
      />
    </header>
  );
};
