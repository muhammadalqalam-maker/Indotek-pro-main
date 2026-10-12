import React, { useState, useRef, useEffect } from 'react';
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
import { useApp, ScreenId } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../common/Button';
import { ALL_ROLES, ROLE_DEFINITIONS } from '../../lib/rbac';
import { AppRole } from '../../types/rbac';

export const Topbar: React.FC = () => {
  const {
    currentScreen,
    setCurrentScreen,
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
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const roleMenuRef = useRef<HTMLDivElement>(null);

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

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const getScreenTitle = (screen: ScreenId): { section: string; title: string } => {
    switch (screen) {
      case 'dashboard':
        return { section: 'Ringkasan', title: 'Dashboard Eksekutif' };
      case 'projects':
        return { section: 'Ringkasan', title: 'Portofolio Proyek' };
      case 'project-detail':
        return {
          section: 'Proyek Aktif',
          title: selectedProject ? selectedProject.name : 'Detail Proyek',
        };
      case 'schedule':
        return { section: 'Operasional', title: 'Jadwal & Kurva-S' };
      case 'budget':
        return { section: 'Operasional', title: 'Pengendalian Biaya & RAB' };
      case 'materials':
        return { section: 'Operasional', title: 'Logistik Material & Gudang' };
      case 'procurement':
        return { section: 'Operasional', title: 'Pengadaan & SPP/PO' };
      case 'field-reports':
        return { section: 'Operasional', title: 'Laporan Harian Lapangan' };
      case 'team':
        return { section: 'Manajemen', title: 'Tim Proyek & Hak Akses' };
      case 'reports':
        return { section: 'Manajemen', title: 'Laporan & Ekspor Analitika' };
      case 'settings':
        return { section: 'Sistem', title: 'Pengaturan Workspace' };
      default:
        return { section: 'Workspace', title: 'Indotek Pro' };
    }
  };

  const navInfo = getScreenTitle(currentScreen);

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
    <header className="h-16 bg-white border-b border-[#E2E8E4] px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-20 shrink-0">
      {/* Zone 1: Mobile Toggle & Breadcrumbs */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1 sm:flex-initial">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="md:hidden p-2 -ml-2 rounded-lg text-[#202B26] hover:bg-[#F5F7F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12352B]/40 cursor-pointer"
          aria-label="Buka Navigasi Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-[#69766F] truncate">
          <button
            onClick={() => setCurrentScreen('dashboard')}
            className="hidden sm:inline font-medium hover:text-[#202B26] transition-colors cursor-pointer"
          >
            Indotek Pro
          </button>
          <ChevronRight className="w-3.5 h-3.5 hidden sm:inline text-[#A2B8AE] shrink-0" aria-hidden="true" />
          <span className="text-[#69766F] hidden md:inline truncate">{navInfo.section}</span>
          <ChevronRight className="w-3.5 h-3.5 hidden md:inline text-[#A2B8AE] shrink-0" aria-hidden="true" />
          <span className="font-semibold text-[#202B26] truncate">{navInfo.title}</span>
        </nav>
      </div>

      {/* Zone 2: Global Search */}
      <div ref={searchContainerRef} className="hidden lg:flex items-center max-w-xs xl:max-w-sm w-full mx-4 relative">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-[#69766F] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
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
            className="w-full h-9 bg-[#F5F7F6] border border-[#E2E8E4] rounded-lg pl-9 pr-8 text-xs text-[#202B26] placeholder-[#69766F]/80 focus:outline-none focus:border-[#12352B] focus:bg-white transition-colors"
          />
          {globalSearch && (
            <button
              onClick={() => {
                setGlobalSearch('');
                setIsSearchFocused(false);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#69766F] hover:text-[#202B26] p-0.5 rounded cursor-pointer"
              aria-label="Bersihkan pencarian"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Live Search Results Dropdown */}
        {isSearchFocused && query.length >= 2 && searchResults && (
          <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-[#E2E8E4] rounded-xl shadow-xl overflow-hidden z-30 max-h-96 overflow-y-auto">
            {totalResultsCount === 0 ? (
              <div className="p-4 text-center text-xs text-[#69766F]">
                Tidak ada hasil untuk <span className="font-medium text-[#202B26]">"{globalSearch}"</span>
              </div>
            ) : (
              <div className="divide-y divide-[#E2E8E4]/60 text-xs">
                {searchResults.projects.length > 0 && (
                  <div className="p-2">
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#69766F] flex items-center gap-1.5">
                      <FolderKanban className="w-3 h-3 text-[#285744]" />
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
                        className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[#F5F7F6] flex items-center justify-between group transition-colors cursor-pointer"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-semibold text-[#202B26] group-hover:text-[#12352B] truncate">
                            {p.name}
                          </div>
                          <div className="text-[11px] text-[#69766F] font-mono tabular-nums">
                            {p.code} · {p.client}
                          </div>
                        </div>
                        <span className="text-[11px] text-[#285744] font-medium shrink-0 group-hover:translate-x-0.5 transition-transform">
                          Buka →
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {searchResults.materials.length > 0 && (
                  <div className="p-2">
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#69766F] flex items-center gap-1.5">
                      <Boxes className="w-3 h-3 text-[#285744]" />
                      <span>Material & Stok ({searchResults.materials.length})</span>
                    </div>
                    {searchResults.materials.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setCurrentScreen('materials');
                          setGlobalSearch('');
                          setIsSearchFocused(false);
                        }}
                        className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[#F5F7F6] flex items-center justify-between group transition-colors cursor-pointer"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-semibold text-[#202B26] group-hover:text-[#12352B] truncate">
                            {m.name}
                          </div>
                          <div className="text-[11px] text-[#69766F]">
                            Stok: {m.currentStock} {m.unit} · {m.allocatedProject}
                          </div>
                        </div>
                        <span className="text-[11px] text-[#285744] font-medium shrink-0 group-hover:translate-x-0.5 transition-transform">
                          Gudang →
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {searchResults.pos.length > 0 && (
                  <div className="p-2">
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#69766F] flex items-center gap-1.5">
                      <Truck className="w-3 h-3 text-[#285744]" />
                      <span>Pengadaan & PO ({searchResults.pos.length})</span>
                    </div>
                    {searchResults.pos.map((po) => (
                      <button
                        key={po.id}
                        onClick={() => {
                          setCurrentScreen('procurement');
                          setGlobalSearch('');
                          setIsSearchFocused(false);
                        }}
                        className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-[#F5F7F6] flex items-center justify-between group transition-colors cursor-pointer"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-semibold text-[#202B26] group-hover:text-[#12352B] truncate font-mono">
                            {po.poNumber}
                          </div>
                          <div className="text-[11px] text-[#69766F] truncate">
                            {po.supplierName} · {po.itemDescription}
                          </div>
                        </div>
                        <span className="text-[11px] text-[#285744] font-medium shrink-0 group-hover:translate-x-0.5 transition-transform">
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
        <button
          onClick={() => setNotificationsOpen(!notificationsOpen)}
          className="relative p-2 rounded-lg text-[#202B26] hover:bg-[#F5F7F6] border border-transparent hover:border-[#E2E8E4] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12352B]/40 cursor-pointer"
          aria-label={`Notifikasi Operasional (${unreadNotificationCount} belum dibaca)`}
          title="Notifikasi Operasional"
        >
          <Bell className="w-4 h-4 text-[#202B26]" />
          {unreadNotificationCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#A82A20] rounded-full ring-2 ring-white" />
          )}
        </button>

        {/* Role Display / Mode 'Lihat sebagai' (Hanya Admin atau DEV) */}
        {isAdmin || import.meta.env.DEV ? (
          <div ref={roleMenuRef} className="relative">
            <button
              onClick={() => setIsRoleMenuOpen(!isRoleMenuOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#E2E8E4] bg-[#F5F7F6] hover:bg-[#EAEFEA] hover:border-[#12352B]/30 text-xs font-semibold text-[#12352B] transition-all cursor-pointer shadow-2xs"
              title="Mode Pratinjau Tampilan: Lihat sebagai peran lain (Hanya Admin / Dev)"
            >
              <Shield className="w-3.5 h-3.5 text-[#285744]" />
              <span className="hidden sm:inline font-mono text-[11px] font-bold text-[#12352B] max-w-[130px] truncate">
                {activeRole}
              </span>
              <span className="hidden md:inline text-[9px] px-1.5 py-0.5 bg-[#D6A85C]/25 text-[#735314] rounded font-bold uppercase tracking-wider">
                Pratinjau
              </span>
              <ChevronDown className={`w-3 h-3 text-[#69766F] transition-transform duration-200 ${isRoleMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {isRoleMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-76 bg-white border border-[#E2E8E4] rounded-xl shadow-xl overflow-hidden z-30 divide-y divide-[#E2E8E4]/60">
                <div className="p-3 bg-[#FAFBFB]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#12352B]">
                      Mode Pratinjau: Lihat Sebagai
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-[#D6A85C]/25 text-[#735314] rounded font-bold uppercase">
                      Admin / Dev
                    </span>
                  </div>
                  <div className="text-[11px] text-[#4F5D56] mt-1 leading-snug">
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
                        className={`w-full text-left px-3 py-2 text-xs flex items-start justify-between gap-2 hover:bg-[#F5F7F6] transition-colors cursor-pointer ${
                          isSelected ? 'bg-[#E5F4EB]/60 text-[#12352B] font-semibold' : 'text-[#202B26]'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate">{role}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-[#1C6843] shrink-0" />}
                          </div>
                          <div className="text-[10px] text-[#69766F] truncate mt-0.5 font-normal">
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
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#E2E8E4] bg-[#F5F7F6] text-xs font-semibold text-[#12352B]">
            <Shield className="w-3.5 h-3.5 text-[#285744]" />
            <span className="hidden sm:inline font-mono text-[11px] font-bold text-[#12352B] max-w-[130px] truncate">
              {userProfile?.role || activeRole}
            </span>
          </div>
        )}

        <div className="h-5 w-px bg-[#E2E8E4] hidden sm:block" />

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
            className="flex items-center gap-1.5 p-1 pl-2 pr-2.5 rounded-lg border border-[#E2E8E4] bg-white hover:bg-[#F5F7F6] text-xs font-medium text-[#202B26] transition-colors cursor-pointer"
            title="Profil Pengguna & Sesi"
          >
            <div className="w-6 h-6 rounded-full bg-[#12352B] text-[#D6A85C] font-semibold text-[10px] flex items-center justify-center shrink-0">
              {currentUser.displayName ? currentUser.displayName.slice(0, 2).toUpperCase() : 'BS'}
            </div>
            <span className="hidden xl:inline text-xs truncate max-w-[100px]">
              {userProfile?.name?.split(' ')[0] || currentUser.displayName?.split(' ')[0] || 'User'}
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#1C6843]" title="Terkoneksi Firebase" />
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
          className="sm:hidden p-2 rounded-lg bg-[#12352B] text-white hover:bg-[#285744] transition-colors cursor-pointer"
          aria-label="Tambah Proyek Baru"
          title="Tambah Proyek"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
