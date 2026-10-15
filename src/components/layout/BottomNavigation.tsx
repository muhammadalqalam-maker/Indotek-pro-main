import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home,
  ClipboardList,
  Package,
  FileText,
  Users,
} from 'lucide-react';

interface NavItem {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', icon: Home, label: 'Beranda' },
  { to: '/proyek', icon: ClipboardList, label: 'Proyek' },
  { to: '/material', icon: Package, label: 'Material' },
  { to: '/pengadaan', icon: FileText, label: 'Pengadaan' },
  { to: '/tim', icon: Users, label: 'Tim' },
];

/**
 * Bottom navigation for mobile/tablet (< lg breakpoint)
 * Fixed at bottom with icon-only tabs and 44px tap targets
 * Hidden on desktop (≥1024px)
 */
export const BottomNavigation: React.FC = () => {
  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-border-subtle z-30"
      style={{ paddingBottom: 'var(--safe-area-inset-bottom)' }}
      role="navigation"
      aria-label="Navigasi utama"
    >
      <div className="flex items-stretch justify-around">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 px-2 py-2 text-xs transition-colors relative min-h-[44px] flex-1 ${
                  isActive
                    ? 'text-primary'
                    : 'text-tertiary hover:text-primary'
                }`
              }
              title={item.label}
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={`w-5 h-5 ${
                      isActive ? 'stroke-[2.5]' : 'stroke-2'
                    }`}
                  />
                  <span className="truncate max-w-full">{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};
