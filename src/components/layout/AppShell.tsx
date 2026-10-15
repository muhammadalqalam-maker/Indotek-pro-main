import React from 'react';
import { useApp } from '../../context/AppContext';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { NotificationsDrawer } from './NotificationsDrawer';
import { QuickProjectModal } from './QuickProjectModal';
import { ToastContainer } from '../common/Toast';
import { LoginModal } from '../auth/LoginModal';
import { ScrollToTop } from '../common/ScrollToTop';
import { BottomNavigation } from './BottomNavigation';

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { mobileMenuOpen, setMobileMenuOpen } = useApp();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-canvas text-text-primary">
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex shrink-0 h-full">
        <Sidebar />
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-text-primary/40 backdrop-blur-[2px]"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative flex-1 max-w-xs w-full">
            <Sidebar isMobileDrawer onCloseMobile={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">

        <ScrollToTop />
        <Topbar />

        <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 pb-16 lg:pb-6 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Slide-out Panels & Overlays */}
      <NotificationsDrawer />
      <QuickProjectModal />
      <LoginModal />
      <ToastContainer />
      <BottomNavigation />
    </div>
  );
};
