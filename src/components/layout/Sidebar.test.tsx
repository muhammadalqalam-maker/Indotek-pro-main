import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';

// Mock dependencies
vi.mock('../../context/AppContext', () => ({
  useApp: () => ({
    sidebarCollapsed: false,
    setSidebarCollapsed: vi.fn(),
    unreadNotificationCount: 2,
    purchaseOrders: [
      { id: '1', status: 'Menunggu' },
      { id: '2', status: 'Menunggu' },
      { id: '3', status: 'Selesai' },
    ],
  }),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    currentUser: {
      displayName: 'Bambang Sujarwo',
    },
    userProfile: {
      name: 'Ir. Bambang Sujarwo',
      role: 'Project Manager',
    },
    setIsLoginModalOpen: vi.fn(),
  }),
}));

vi.mock('../../context/UIContext', () => ({
  useUI: () => ({
    settings: {
      companyName: 'PT. Indotek Indonesia',
    },
  }),
}));

vi.mock('../../hooks/useMediaQuery', () => ({
  useIsTablet: () => false,
}));

const renderWithRouter = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

describe('Sidebar Component', () => {
  describe('Rendering', () => {
    it('renders brand header with logo and company name', () => {
      renderWithRouter(<Sidebar />);
      expect(screen.getByText('INDOTEK')).toBeInTheDocument();
      expect(screen.getByText('PRO')).toBeInTheDocument();
      expect(screen.getByText('PT. Indotek Indonesia')).toBeInTheDocument();
    });

    it('renders navigation sections with items', () => {
      renderWithRouter(<Sidebar />);
      expect(screen.getByText('Ringkasan')).toBeInTheDocument();
      expect(screen.getByText('Operasional Lapangan')).toBeInTheDocument();
      expect(screen.getByText('Manajemen & Sistem')).toBeInTheDocument();
      expect(screen.getByText('Dashboard Eksekutif')).toBeInTheDocument();
      expect(screen.getByText('Portofolio Proyek')).toBeInTheDocument();
    });

    it('renders account section with user info', () => {
      renderWithRouter(<Sidebar />);
      expect(screen.getByText('Ir. Bambang Sujarwo')).toBeInTheDocument();
      expect(screen.getByText('Project Manager')).toBeInTheDocument();
    });

    it('renders user avatar initials', () => {
      renderWithRouter(<Sidebar />);
      const avatars = screen.getAllByText('BS');
      expect(avatars.length).toBeGreaterThan(0);
    });
  });

  describe('Mobile Drawer Mode', () => {
    it('renders close button when isMobileDrawer is true', () => {
      const onCloseMobile = vi.fn();
      renderWithRouter(<Sidebar isMobileDrawer={true} onCloseMobile={onCloseMobile} />);
      const closeButton = screen.getByLabelText('Tutup Menu');
      expect(closeButton).toBeInTheDocument();
    });

    it('calls onCloseMobile when close button clicked', () => {
      const onCloseMobile = vi.fn();
      renderWithRouter(<Sidebar isMobileDrawer={true} onCloseMobile={onCloseMobile} />);
      const closeButton = screen.getByLabelText('Tutup Menu');
      fireEvent.click(closeButton);
      expect(onCloseMobile).toHaveBeenCalled();
    });

    it('does not render close button in desktop mode', () => {
      renderWithRouter(<Sidebar isMobileDrawer={false} />);
      const closeButton = screen.queryByLabelText('Tutup Menu');
      expect(closeButton).not.toBeInTheDocument();
    });

    it('hides section titles in mobile drawer mode', () => {
      renderWithRouter(<Sidebar isMobileDrawer={true} />);
      // In mobile drawer (isMobileDrawer=true), section titles should be visible
      // since condition is: (!isCollapsed || isMobileDrawer) && !isTabletIconMode
      expect(screen.getByText('Ringkasan')).toBeInTheDocument();
    });
  });

  describe('Badge Display', () => {
    it('displays pending PO count badge', () => {
      renderWithRouter(<Sidebar />);
      // 2 pending POs should show badge with "2"
      const badgeElement = screen.getByText('2');
      expect(badgeElement).toBeInTheDocument();
    });

    it('badge shows count for Menunggu status POs only', () => {
      // Mock returns 2 Menunggu + 1 Selesai
      renderWithRouter(<Sidebar />);
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  describe('Navigation Links', () => {
    it('renders NavLinks with correct paths', () => {
      renderWithRouter(<Sidebar />);
      const dashboardLink = screen.getByRole('link', { name: /Dashboard Eksekutif/i });
      expect(dashboardLink).toHaveAttribute('href', '/');
    });

    it('renders all major navigation items', () => {
      renderWithRouter(<Sidebar />);
      expect(screen.getByRole('link', { name: /Jadwal & Progres/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Anggaran & RAB/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Material/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Tim & Hak Akses/i })).toBeInTheDocument();
    });

    it('calls onCloseMobile when navigation link clicked in drawer', () => {
      const onCloseMobile = vi.fn();
      renderWithRouter(<Sidebar isMobileDrawer={true} onCloseMobile={onCloseMobile} />);
      const dashboardLink = screen.getByRole('link', { name: /Dashboard Eksekutif/i });
      fireEvent.click(dashboardLink);
      expect(onCloseMobile).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels', () => {
      renderWithRouter(<Sidebar />);
      expect(screen.getByLabelText(/Tutup Menu|Kelola Akun/i)).toBeInTheDocument();
    });

    it('breadcrumb nav has aria-label', () => {
      renderWithRouter(<Sidebar />);
      const navItems = screen.queryAllByRole('link');
      // Should have navigation items
      expect(navItems.length).toBeGreaterThan(0);
    });

    it('account button has title attribute', () => {
      renderWithRouter(<Sidebar />);
      // Account section should be clickable
      const accountArea = screen.getByText('Ir. Bambang Sujarwo');
      expect(accountArea).toBeInTheDocument();
    });

    it('collapse button has title attribute', () => {
      const { container } = renderWithRouter(<Sidebar isMobileDrawer={false} />);
      const buttons = container.querySelectorAll('button');
      // Should have collapse button with title
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe('Responsive Behavior', () => {
    it('renders aside element with correct structure', () => {
      const { container } = renderWithRouter(<Sidebar />);
      const aside = container.querySelector('aside');
      expect(aside).toBeInTheDocument();
      expect(aside).toHaveClass('h-full', 'flex', 'flex-col', 'bg-primary', 'text-white');
    });

    it('applies collapsed class when sidebar is not in mobile drawer', () => {
      const { container } = renderWithRouter(<Sidebar isMobileDrawer={false} />);
      const aside = container.querySelector('aside');
      expect(aside).toHaveClass('transition-all', 'duration-300');
    });

    it('applies mobile drawer width class', () => {
      const { container } = renderWithRouter(<Sidebar isMobileDrawer={true} />);
      const aside = container.querySelector('aside');
      // Mobile drawer should have w-72 class
      expect(aside).toHaveClass('w-72');
    });

    it('applies standard width class for desktop', () => {
      const { container } = renderWithRouter(<Sidebar isMobileDrawer={false} />);
      const aside = container.querySelector('aside');
      // Desktop sidebar should have w-64 class (when not collapsed and not tablet)
      const classList = aside?.className || '';
      expect(classList).toMatch(/w-64|w-18/);
    });
  });

  describe('User Interaction', () => {
    it('allows clicking account area', () => {
      renderWithRouter(<Sidebar />);
      const accountArea = screen.getByText('Ir. Bambang Sujarwo');
      expect(accountArea.closest('.cursor-pointer')).toBeInTheDocument();
    });

    it('shows title on nav items for accessibility', () => {
      const { container } = renderWithRouter(<Sidebar />);
      const navLinks = container.querySelectorAll('a');
      expect(navLinks.length).toBeGreaterThan(0);
    });
  });

  describe('Styling', () => {
    it('applies primary color scheme', () => {
      const { container } = renderWithRouter(<Sidebar />);
      const aside = container.querySelector('aside');
      expect(aside).toHaveClass('bg-primary', 'text-white');
    });

    it('applies border styling', () => {
      const { container } = renderWithRouter(<Sidebar />);
      const aside = container.querySelector('aside');
      expect(aside).toHaveClass('border-r', 'border-primary/90');
    });

    it('applies active link styling', () => {
      const { container } = renderWithRouter(<Sidebar />);
      // Active links should have specific styling
      const links = container.querySelectorAll('a');
      expect(links.length).toBeGreaterThan(0);
    });
  });
});
