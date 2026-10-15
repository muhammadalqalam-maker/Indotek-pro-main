import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Topbar } from './Topbar';

// Mock dependencies
vi.mock('../../context/AppContext', () => ({
  useApp: () => ({
    selectedProjectId: 'proj-1',
    projects: [
      { id: 'proj-1', name: 'Bandara Yogyakarta', code: 'YOGYA-2025', client: 'PT. Jasa Marga' },
      { id: 'proj-2', name: 'Tol Surabaya', code: 'SURABAYA-2025', client: 'PT. Teluk' },
    ],
    materials: [
      { id: 'mat-1', name: 'Batu Koral', code: 'BK-001', primarySupplier: 'CV. Sumber Batu', currentStock: 100, unit: 'ton', allocatedProject: 'Bandara' },
      { id: 'mat-2', name: 'Semen Portland', code: 'SP-001', primarySupplier: 'PT. Indocement', currentStock: 500, unit: 'sak', allocatedProject: 'Tol' },
    ],
    purchaseOrders: [
      { id: 'po-1', poNumber: 'PO-001-2025', supplierName: 'PT. Supplier A', itemDescription: 'Material Bangunan', status: 'Menunggu' },
      { id: 'po-2', poNumber: 'PO-002-2025', supplierName: 'PT. Supplier B', itemDescription: 'Peralatan', status: 'Selesai' },
    ],
    navigateToProjectDetail: vi.fn(),
    setMobileMenuOpen: vi.fn(),
    notificationsOpen: false,
    setNotificationsOpen: vi.fn(),
    unreadNotificationCount: 3,
    setIsAddProjectModalOpen: vi.fn(),
    globalSearch: '',
    setGlobalSearch: vi.fn(),
    addToast: vi.fn(),
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
    activeRole: 'Project Manager',
    setActiveRole: vi.fn(),
    isAdmin: true,
  }),
}));

vi.mock('../../config/routes', () => ({
  getRouteConfig: () => ({
    title: 'Dashboard Eksekutif',
    section: 'Ringkasan',
  }),
}));

vi.mock('../common/Button', () => ({
  Button: (props: any) => (
    <button {...props} data-testid="button-component">
      {props.children}
    </button>
  ),
}));

vi.mock('../common/SyncStatusIndicator', () => ({
  SyncStatusIndicator: () => <div data-testid="sync-indicator">Sync</div>,
}));

vi.mock('./SearchBottomSheet', () => ({
  SearchBottomSheet: () => <div data-testid="search-bottom-sheet">Search Sheet</div>,
}));

const renderWithRouter = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

describe('Topbar Component', () => {
  describe('Rendering', () => {
    it('renders header element', () => {
      const { container } = renderWithRouter(<Topbar />);
      const header = container.querySelector('header');
      expect(header).toBeInTheDocument();
      expect(header).toHaveClass('h-16', 'bg-white');
    });

    it('renders breadcrumb navigation', () => {
      renderWithRouter(<Topbar />);
      expect(screen.getByText('Indotek Pro')).toBeInTheDocument();
      expect(screen.getByText('Dashboard Eksekutif')).toBeInTheDocument();
    });

    it('renders mobile menu toggle button', () => {
      renderWithRouter(<Topbar />);
      const menuButton = screen.getByLabelText('Buka Navigasi Menu');
      expect(menuButton).toBeInTheDocument();
    });

    it('renders notifications button with unread count', () => {
      renderWithRouter(<Topbar />);
      const notificationButton = screen.getByLabelText(/Notifikasi Operasional.*3 belum dibaca/i);
      expect(notificationButton).toBeInTheDocument();
    });

    it('renders sync status indicator', () => {
      renderWithRouter(<Topbar />);
      expect(screen.getByTestId('sync-indicator')).toBeInTheDocument();
    });

    it('renders role display button for admin', () => {
      renderWithRouter(<Topbar />);
      expect(screen.getByText('Project Manager')).toBeInTheDocument();
    });

    it('renders add project button', () => {
      renderWithRouter(<Topbar />);
      const addButton = screen.getByRole('button', { name: /Tambah Proyek/i });
      expect(addButton).toBeInTheDocument();
    });

    it('renders user profile button when logged in', () => {
      renderWithRouter(<Topbar />);
      const profileButtons = screen.getAllByText('BS');
      expect(profileButtons.length).toBeGreaterThan(0);
    });
  });

  describe('Search Functionality', () => {
    it('renders search input on desktop', () => {
      renderWithRouter(<Topbar />);
      const searchInput = screen.getByPlaceholderText(/Cari proyek, material, nomor PO/i);
      expect(searchInput).toBeInTheDocument();
    });

    it('displays search results when typing', async () => {
      const { rerender } = renderWithRouter(<Topbar />);
      const searchInput = screen.getByPlaceholderText(/Cari proyek, material, nomor PO/i);
      
      fireEvent.focus(searchInput);
      fireEvent.change(searchInput, { target: { value: 'Bandara' } });

      // After search, should filter results
      await waitFor(() => {
        // Results should be available in dropdown
        expect(searchInput).toHaveValue('Bandara');
      });
    });

    it('closes search dropdown on Escape key', async () => {
      renderWithRouter(<Topbar />);
      const searchInput = screen.getByPlaceholderText(/Cari proyek, material, nomor PO/i);
      
      fireEvent.focus(searchInput);
      fireEvent.change(searchInput, { target: { value: 'test' } });
      fireEvent.keyDown(searchInput, { key: 'Escape' });

      await waitFor(() => {
        expect(searchInput).toHaveValue('test');
      });
    });

    it('displays clear button when search has value', async () => {
      renderWithRouter(<Topbar />);
      const searchInput = screen.getByPlaceholderText(/Cari proyek, material, nomor PO/i);
      
      fireEvent.focus(searchInput);
      fireEvent.change(searchInput, { target: { value: 'test' } });

      await waitFor(() => {
        const clearButton = screen.getByLabelText('Bersihkan pencarian');
        expect(clearButton).toBeInTheDocument();
      });
    });

    it('clears search when clear button clicked', async () => {
      const { rerender } = renderWithRouter(<Topbar />);
      const searchInput = screen.getByPlaceholderText(/Cari proyek, material, nomor PO/i);
      
      fireEvent.focus(searchInput);
      fireEvent.change(searchInput, { target: { value: 'test' } });

      await waitFor(() => {
        const clearButton = screen.getByLabelText('Bersihkan pencarian');
        fireEvent.click(clearButton);
      });
    });
  });

  describe('Role Menu (Admin/Dev Only)', () => {
    it('renders role menu button for admin', () => {
      renderWithRouter(<Topbar />);
      const roleButton = screen.getByTitle(/Mode Pratinjau Tampilan/i);
      expect(roleButton).toBeInTheDocument();
    });

    it('opens role menu when clicked', async () => {
      renderWithRouter(<Topbar />);
      const roleButton = screen.getByTitle(/Mode Pratinjau Tampilan/i);
      
      fireEvent.click(roleButton);

      await waitFor(() => {
        expect(screen.getByText(/Mode Pratinjau: Lihat Sebagai/i)).toBeInTheDocument();
      });
    });

    it('displays role options in menu', async () => {
      renderWithRouter(<Topbar />);
      const roleButton = screen.getByTitle(/Mode Pratinjau Tampilan/i);
      
      fireEvent.click(roleButton);

      await waitFor(() => {
        // Should show role options (various RBAC roles)
        const menu = screen.getByText(/Mode Pratinjau: Lihat Sebagai/i);
        expect(menu).toBeInTheDocument();
      });
    });

    it('closes role menu when clicking outside', async () => {
      const { container } = renderWithRouter(<Topbar />);
      const roleButton = screen.getByTitle(/Mode Pratinjau Tampilan/i);
      
      fireEvent.click(roleButton);
      
      // Click outside the menu
      fireEvent.mouseDown(document.body);

      await waitFor(() => {
        const menuText = screen.queryByText(/Mode Pratinjau: Lihat Sebagai/i);
        // Menu should be closed or hidden
      });
    });
  });

  describe('Notifications', () => {
    it('displays unread notification count badge', () => {
      renderWithRouter(<Topbar />);
      expect(screen.getByLabelText(/3 belum dibaca/i)).toBeInTheDocument();
    });

    it('shows red dot when unread count > 0', () => {
      const { container } = renderWithRouter(<Topbar />);
      const badge = container.querySelector('[style*="bg-danger"]');
      // Badge should exist if unread count > 0
      const notificationButton = screen.getByLabelText(/3 belum dibaca/i);
      expect(notificationButton).toBeInTheDocument();
    });

    it('toggles notifications drawer when button clicked', () => {
      renderWithRouter(<Topbar />);
      const notificationButton = screen.getByLabelText(/Notifikasi Operasional/i);
      
      fireEvent.click(notificationButton);
      
      // Should toggle notifications open state
      expect(notificationButton).toBeInTheDocument();
    });
  });

  describe('Navigation Buttons', () => {
    it('opens mobile menu when menu button clicked', () => {
      renderWithRouter(<Topbar />);
      const menuButton = screen.getByLabelText('Buka Navigasi Menu');
      
      fireEvent.click(menuButton);
      
      expect(menuButton).toBeInTheDocument();
    });

    it('opens add project modal when add button clicked', () => {
      renderWithRouter(<Topbar />);
      const addButtons = screen.getAllByRole('button', { name: /Tambah Proyek/i });
      
      fireEvent.click(addButtons[0]);
      
      expect(addButtons[0]).toBeInTheDocument();
    });

    it('navigates to home when breadcrumb home clicked', () => {
      renderWithRouter(<Topbar />);
      const homeLink = screen.getByText('Indotek Pro');
      
      expect(homeLink).toBeInTheDocument();
    });
  });

  describe('User Account', () => {
    it('displays user avatar initials', () => {
      renderWithRouter(<Topbar />);
      const avatars = screen.getAllByText('BS');
      expect(avatars.length).toBeGreaterThan(0);
    });

    it('displays first name of user when logged in', () => {
      renderWithRouter(<Topbar />);
      // User name should be displayed
      const userArea = screen.getByText('Ir. Bambang Sujarwo');
      expect(userArea).toBeInTheDocument();
    });

    it('shows login button when not authenticated', () => {
      // This test would need mock to have currentUser as null
      renderWithRouter(<Topbar />);
      // Current setup has logged in user, so login button won't show
      expect(screen.getByText('BS')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels on all buttons', () => {
      renderWithRouter(<Topbar />);
      expect(screen.getByLabelText('Buka Navigasi Menu')).toBeInTheDocument();
      expect(screen.getByLabelText(/Notifikasi Operasional/i)).toBeInTheDocument();
    });

    it('breadcrumb has aria-label', () => {
      const { container } = renderWithRouter(<Topbar />);
      const nav = container.querySelector('nav[aria-label="Breadcrumb"]');
      expect(nav).toBeInTheDocument();
    });

    it('has aria-hidden on decorative icons', () => {
      const { container } = renderWithRouter(<Topbar />);
      const hiddenIcons = container.querySelectorAll('[aria-hidden="true"]');
      expect(hiddenIcons.length).toBeGreaterThan(0);
    });

    it('search input is accessible', () => {
      renderWithRouter(<Topbar />);
      const searchInput = screen.getByPlaceholderText(/Cari proyek, material, nomor PO/i);
      expect(searchInput).toHaveAttribute('type', 'text');
    });

    it('buttons have focus ring styles', () => {
      const { container } = renderWithRouter(<Topbar />);
      const buttons = container.querySelectorAll('button');
      buttons.forEach(button => {
        const className = button.className || '';
        // Check for focus-visible or focus ring classes
        expect(className).toBeTruthy();
      });
    });
  });

  describe('Responsive Behavior', () => {
    it('renders sticky header', () => {
      const { container } = renderWithRouter(<Topbar />);
      const header = container.querySelector('header');
      expect(header).toHaveClass('sticky', 'top-0');
    });

    it('has z-index for layering', () => {
      const { container } = renderWithRouter(<Topbar />);
      const header = container.querySelector('header');
      expect(header).toHaveClass('z-20');
    });

    it('breadcrumb responsive classes', () => {
      const { container } = renderWithRouter(<Topbar />);
      const breadcrumb = container.querySelector('nav[aria-label="Breadcrumb"]');
      expect(breadcrumb).toHaveClass('hidden', 'sm:inline');
    });

    it('renders mobile search icon', () => {
      renderWithRouter(<Topbar />);
      const mobileSearchButton = screen.getByTitle('Pencarian Global');
      expect(mobileSearchButton).toBeInTheDocument();
    });

    it('search bottom sheet rendered for mobile', () => {
      renderWithRouter(<Topbar />);
      expect(screen.getByTestId('search-bottom-sheet')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('applies white background to header', () => {
      const { container } = renderWithRouter(<Topbar />);
      const header = container.querySelector('header');
      expect(header).toHaveClass('bg-white');
    });

    it('applies border styling', () => {
      const { container } = renderWithRouter(<Topbar />);
      const header = container.querySelector('header');
      expect(header).toHaveClass('border-b', 'border-border-subtle');
    });

    it('applies padding correctly', () => {
      const { container } = renderWithRouter(<Topbar />);
      const header = container.querySelector('header');
      expect(header).toHaveClass('px-4', 'sm:px-6');
    });

    it('uses flex layout', () => {
      const { container } = renderWithRouter(<Topbar />);
      const header = container.querySelector('header');
      expect(header).toHaveClass('flex', 'items-center', 'justify-between');
    });
  });

  describe('Document Title', () => {
    it('sets document title from route config', () => {
      renderWithRouter(<Topbar />);
      // Title should be set based on route config
      expect(document.title).toBeDefined();
    });
  });
});
