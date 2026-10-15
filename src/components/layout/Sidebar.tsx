import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderKanban,
  CalendarClock,
  Coins,
  Boxes,
  Truck,
  FileCheck2,
  Users2,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  HardHat,
  X,
  ExternalLink,
  Calculator,
  Tag,
} from 'lucide-react';
import { useApp, ScreenId } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useIsTablet } from '../../hooks/useMediaQuery';

interface NavItem {
  id: ScreenId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

// Map ScreenId to route path
const SCREEN_TO_PATH: Record<ScreenId, string> = {
  dashboard: '/',
  projects: '/proyek',
  'project-detail': '/proyek', // Not in sidebar navigation
  schedule: '/jadwal',
  budget: '/anggaran',
  'resource-prices': '/harga-dasar',
  'ahsp-templates': '/ahsp',
  materials: '/material',
  procurement: '/pengadaan',
  'field-reports': '/laporan-harian',
  team: '/tim',
  reports: '/laporan',
  settings: '/pengaturan',
};

export const Sidebar: React.FC<{ isMobileDrawer?: boolean; onCloseMobile?: () => void }> = ({
  isMobileDrawer = false,
  onCloseMobile,
}) => {
  const {
    sidebarCollapsed,
    setSidebarCollapsed,
    unreadNotificationCount,
    purchaseOrders,
  } = useApp();

  const { currentUser, userProfile, setIsLoginModalOpen } = useAuth();
  const { settings } = useUI();
  const isTablet = useIsTablet();

  const pendingPOCount = purchaseOrders.filter((p) => p.status === 'Menunggu').length;

  const sections: NavSection[] = [
    {
      title: 'Ringkasan',
      items: [
        { id: 'dashboard', label: 'Dashboard Eksekutif', icon: LayoutDashboard },
        { id: 'projects', label: 'Portofolio Proyek', icon: FolderKanban },
      ],
    },
    {
      title: 'Operasional Lapangan',
      items: [
        { id: 'schedule', label: 'Jadwal & Progres', icon: CalendarClock },
        { id: 'budget', label: 'Anggaran & RAB', icon: Coins },
        { id: 'resource-prices', label: 'Katalog Harga Dasar', icon: Tag },
        { id: 'ahsp-templates', label: 'Analisis AHSP PUPR', icon: Calculator },
        { id: 'materials', label: 'Logistik Material', icon: Boxes },
        {
          id: 'procurement',
          label: 'Pengadaan & SPP',
          icon: Truck,
          badge: pendingPOCount > 0 ? pendingPOCount : undefined,
        },
        { id: 'field-reports', label: 'Laporan Harian', icon: FileCheck2 },
      ],
    },
    {
      title: 'Manajemen & Sistem',
      items: [
        { id: 'team', label: 'Tim & Hak Akses', icon: Users2 },
        { id: 'reports', label: 'Laporan & Ekspor', icon: BarChart3 },
        { id: 'settings', label: 'Pengaturan Workspace', icon: Settings },
      ],
    },
  ];

  const isCollapsed = !isMobileDrawer && sidebarCollapsed;
  const isTabletIconMode = isTablet && !isCollapsed;

  return (
    <aside
      className={`h-full flex flex-col bg-primary text-white border-r border-primary/90 transition-all duration-300 select-none z-30 ${
        isMobileDrawer ? 'w-72' : isTabletIconMode ? 'w-18' : isCollapsed ? 'w-18' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-primary/90 shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 rounded-lg bg-primary-light border border-primary-light/80 flex items-center justify-center shrink-0 shadow-xs">
            <HardHat className="w-5 h-5 text-warning" />
          </div>

          {(!isCollapsed || isMobileDrawer) && !isTabletIconMode && (
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 leading-none">
                <span className="font-bold text-sm tracking-wide text-white">INDOTEK</span>
                <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-warning text-primary tracking-wider uppercase">
                  PRO
                </span>
              </div>
              <span className="text-xs text-text-muted/70 tracking-tight truncate mt-1">
                {settings.companyName || 'Indotek Pro'}
              </span>
            </div>
          )}
        </div>

        {isMobileDrawer ? (
          <button
            onClick={onCloseMobile}
            className="p-1.5 rounded-lg text-text-muted/70 hover:text-white hover:bg-primary/90"
            aria-label="Tutup Menu"
          >
            <X className="w-5 h-5" />
          </button>
        ) : null}
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
        {sections.map((section, idx) => (
          <div key={idx} className="space-y-1">
            {(!isCollapsed || isMobileDrawer) && !isTabletIconMode && (
              <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-text-muted/60">
                {section.title}
              </div>
            )}
            {section.items.map((item) => {
              const Icon = item.icon;
              const path = SCREEN_TO_PATH[item.id];
              return (
                <NavLink
                  key={item.id}
                  to={path}
                  onClick={() => {
                    if (isMobileDrawer && onCloseMobile) {
                      onCloseMobile();
                    }
                  }}
                  title={isCollapsed || isTabletIconMode ? item.label : undefined}
                  className={({ isActive }) =>
                    `w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors group relative ${
                      isActive
                        ? 'bg-primary-light text-white shadow-xs font-semibold'
                        : 'text-border-light hover:bg-primary/90 hover:text-white'
                    } ${(isCollapsed && !isMobileDrawer) || isTabletIconMode ? 'justify-center px-0' : ''}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-colors ${
                          isActive ? 'text-warning' : 'text-text-muted/70 group-hover:text-white'
                        }`}
                      />

                      {(!isCollapsed || isMobileDrawer) && !isTabletIconMode && (
                        <span className="truncate flex-1 text-left">{item.label}</span>
                      )}

                      {(!isCollapsed || isMobileDrawer) && !isTabletIconMode && item.badge !== undefined && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-warning text-primary font-mono font-bold tabular-nums">
                          {item.badge}
                        </span>
                      )}

                      {/* Active bar */}
                      {isActive && (
                        <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-warning rounded-r" />
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer / Account section */}
      <div className="p-3 border-t border-primary/90 shrink-0 bg-primary/50">
        <div className="flex items-center justify-between gap-2">
          <div
            onClick={() => setIsLoginModalOpen(true)}
            className="flex items-center gap-2.5 min-w-0 cursor-pointer group flex-1"
            title={currentUser ? 'Kelola Akun & Hak Akses' : 'Masuk Akun'}
          >
            <div className="w-8 h-8 rounded-full bg-primary-light border border-warning/40 text-warning font-semibold text-xs flex items-center justify-center shrink-0 group-hover:border-warning transition-colors">
              {currentUser?.displayName
                ? currentUser.displayName.slice(0, 2).toUpperCase()
                : 'BS'}
            </div>
            {(!isCollapsed || isMobileDrawer) && !isTabletIconMode && (
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium text-white truncate group-hover:text-warning transition-colors">
                  {userProfile?.name || currentUser?.displayName || 'Ir. Bambang Sujarwo'}
                </span>
                <span className="text-xs text-text-muted/70 truncate">
                  {userProfile?.role || (currentUser ? 'Project Director' : 'Klik untuk Masuk')}
                </span>
              </div>
            )}
          </div>

          {!isMobileDrawer && (
            <button
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              className="p-1 rounded text-text-muted/70 hover:text-white hover:bg-primary/90 transition-colors cursor-pointer"
              title={isCollapsed ? 'Perluas Sidebar' : 'Ciutkan Sidebar'}
            >
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronLeft className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
