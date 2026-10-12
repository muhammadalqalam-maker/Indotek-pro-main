import React from 'react';
import { useApp } from '../../context/AppContext';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { NotificationsDrawer } from './NotificationsDrawer';
import { QuickProjectModal } from './QuickProjectModal';
import { ToastContainer } from '../common/Toast';
import { LoginModal } from '../auth/LoginModal';

import { AlertTriangle, Database } from 'lucide-react';

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { mobileMenuOpen, setMobileMenuOpen, isQuotaExhausted } = useApp();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F5F7F6] text-[#202B26]">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex shrink-0 h-full">
        <Sidebar />
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-[#202B26]/40 backdrop-blur-[2px]"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative flex-1 max-w-xs w-full">
            <Sidebar isMobileDrawer onCloseMobile={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Requirement 7: Quota Exhausted Banner */}
        {isQuotaExhausted && (
          <div className="bg-amber-500/15 border-b border-amber-600/30 text-amber-950 px-4 py-2.5 flex items-center justify-between text-xs sm:text-sm font-medium shrink-0 shadow-xs animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>Kuota harian habis, reset sekitar tengah malam waktu Pasifik</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-amber-800 bg-amber-500/20 px-2 py-0.5 rounded font-mono">
              <Database className="w-3 h-3" />
              <span>Mode Baca-dari-Cache Aktif</span>
            </div>
          </div>
        )}

        <Topbar />

        <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Slide-out Panels & Overlays */}
      <NotificationsDrawer />
      <QuickProjectModal />
      <LoginModal />
      <ToastContainer />
    </div>
  );
};
