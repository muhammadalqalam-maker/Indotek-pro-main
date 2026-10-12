import React from 'react';
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
  ExternalLink
} from 'lucide-react';
import { useApp, ScreenId } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';

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

export const Sidebar: React.FC<{ isMobileDrawer?: boolean; onCloseMobile?: () => void }> = ({
  isMobileDrawer = false,
  onCloseMobile,
}) => {
  const {
    currentScreen,
    setCurrentScreen,
    sidebarCollapsed,
    setSidebarCollapsed,
    unreadNotificationCount,
    purchaseOrders,
  } = useApp();

  const { currentUser, userProfile, setIsLoginModalOpen } = useAuth();

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

  const handleNavClick = (screenId: ScreenId) => {
    setCurrentScreen(screenId);
    if (isMobileDrawer && onCloseMobile) {
      onCloseMobile();
    }
  };

  const isCollapsed = !isMobileDrawer && sidebarCollapsed;

  return (
    <aside
      className={`h-full flex flex-col bg-[#12352B] text-white border-r border-[#1a4437] transition-all duration-300 select-none z-30 ${
        isMobileDrawer ? 'w-72' : isCollapsed ? 'w-18' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-[#1b4335] shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 rounded-lg bg-[#285744] border border-[#3b755e] flex items-center justify-center shrink-0 shadow-xs">
            <HardHat className="w-5 h-5 text-[#D6A85C]" />
          </div>

          {(!isCollapsed || isMobileDrawer) && (
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 leading-none">
                <span className="font-bold text-sm tracking-wide text-white">INDOTEK</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#D6A85C] text-[#12352B] tracking-wider uppercase">
                  PRO
                </span>
              </div>
              <span className="text-[10px] text-[#A2B8AE] tracking-tight truncate mt-1">
                PT Indotek Bangun Nusantara
              </span>
            </div>
          )}
        </div>

        {isMobileDrawer ? (
          <button
            onClick={onCloseMobile}
            className="p-1.5 rounded-lg text-[#A2B8AE] hover:text-white hover:bg-[#1a4437]"
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
            {(!isCollapsed || isMobileDrawer) && (
              <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#79998B]">
                {section.title}
              </div>
            )}
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = currentScreen === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  title={isCollapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors group relative ${
                    isActive
                      ? 'bg-[#285744] text-white shadow-xs font-semibold'
                      : 'text-[#D3E2DB] hover:bg-[#194235] hover:text-white'
                  } ${isCollapsed && !isMobileDrawer ? 'justify-center px-0' : ''}`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive ? 'text-[#D6A85C]' : 'text-[#A2B8AE] group-hover:text-white'
                    }`}
                  />

                  {(!isCollapsed || isMobileDrawer) && (
                    <span className="truncate flex-1 text-left">{item.label}</span>
                  )}

                  {(!isCollapsed || isMobileDrawer) && item.badge !== undefined && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#D6A85C] text-[#12352B] font-mono font-bold tabular-nums">
                      {item.badge}
                    </span>
                  )}

                  {/* Active bar */}
                  {isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#D6A85C] rounded-r" />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer / Account section */}
      <div className="p-3 border-t border-[#1b4335] shrink-0 bg-[#0d271f]/60">
        <div className="flex items-center justify-between gap-2">
          <div
            onClick={() => setIsLoginModalOpen(true)}
            className="flex items-center gap-2.5 min-w-0 cursor-pointer group flex-1"
            title={currentUser ? 'Kelola Akun & Hak Akses' : 'Masuk Akun'}
          >
            <div className="w-8 h-8 rounded-full bg-[#285744] border border-[#D6A85C]/40 text-[#D6A85C] font-semibold text-xs flex items-center justify-center shrink-0 group-hover:border-[#D6A85C] transition-colors">
              {currentUser?.displayName
                ? currentUser.displayName.slice(0, 2).toUpperCase()
                : 'BS'}
            </div>
            {(!isCollapsed || isMobileDrawer) && (
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium text-white truncate group-hover:text-[#D6A85C] transition-colors">
                  {userProfile?.name || currentUser?.displayName || 'Ir. Bambang Sujarwo'}
                </span>
                <span className="text-[10px] text-[#A2B8AE] truncate">
                  {userProfile?.role || (currentUser ? 'Project Director' : 'Klik untuk Masuk')}
                </span>
              </div>
            )}
          </div>

          {!isMobileDrawer && (
            <button
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              className="p-1 rounded text-[#A2B8AE] hover:text-white hover:bg-[#1a4437] transition-colors cursor-pointer"
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
