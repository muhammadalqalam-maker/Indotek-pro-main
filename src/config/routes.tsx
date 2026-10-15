import { lazy, ComponentType, LazyExoticComponent } from 'react';
import type { AppModule, AppAction } from '../types/rbac';

// Lazy loaded screen components
const DashboardScreen = lazy(() => import('../components/screens/DashboardScreen').then(m => ({ default: m.DashboardScreen })));
const ProjectsScreen = lazy(() => import('../components/screens/ProjectsScreen').then(m => ({ default: m.ProjectsScreen })));
const ProjectDetailScreen = lazy(() => import('../components/screens/ProjectDetailScreen').then(m => ({ default: m.ProjectDetailScreen })));
const ScheduleScreen = lazy(() => import('../components/screens/ScheduleScreen').then(m => ({ default: m.ScheduleScreen })));
const BudgetScreen = lazy(() => import('../components/screens/BudgetScreen').then(m => ({ default: m.BudgetScreen })));
const MaterialsScreen = lazy(() => import('../components/screens/MaterialsScreen').then(m => ({ default: m.MaterialsScreen })));
const ProcurementScreen = lazy(() => import('../components/screens/ProcurementScreen').then(m => ({ default: m.ProcurementScreen })));
const FieldReportsScreen = lazy(() => import('../components/screens/FieldReportsScreen').then(m => ({ default: m.FieldReportsScreen })));
const ResourcePricesScreen = lazy(() => import('../components/screens/ResourcePricesScreen').then(m => ({ default: m.ResourcePricesScreen })));
const AHSPTemplatesScreen = lazy(() => import('../components/screens/AHSPTemplatesScreen').then(m => ({ default: m.AHSPTemplatesScreen })));
const TeamScreen = lazy(() => import('../components/screens/TeamScreen').then(m => ({ default: m.TeamScreen })));
const ReportsScreen = lazy(() => import('../components/screens/ReportsScreen').then(m => ({ default: m.ReportsScreen })));
const SettingsScreen = lazy(() => import('../components/screens/SettingsScreen').then(m => ({ default: m.SettingsScreen })));
const AcceptInvitationScreen = lazy(() => import('../components/screens/AcceptInvitationScreen').then(m => ({ default: m.AcceptInvitationScreen })));
export const NotFoundScreen = lazy(() => import('../components/screens/NotFoundScreen').then(m => ({ default: m.NotFoundScreen })));

export interface RouteConfig {
  path: string;
  component: LazyExoticComponent<ComponentType<any>>;
  section: string;
  title: string;
  requireAuth?: boolean;
  rbac?: {
    module: AppModule;
    action: AppAction;
  };
}

export const ROUTES: RouteConfig[] = [
  {
    path: '/',
    component: DashboardScreen,
    section: 'Ringkasan',
    title: 'Dashboard Eksekutif',
    requireAuth: true,
    rbac: {
      module: 'dashboard',
      action: 'view',
    },
  },
  {
    path: '/proyek',
    component: ProjectsScreen,
    section: 'Ringkasan',
    title: 'Portofolio Proyek',
    requireAuth: true,
    rbac: {
      module: 'projects',
      action: 'view',
    },
  },
  {
    path: '/proyek/:id/:tab?',
    component: ProjectDetailScreen,
    section: 'Proyek',
    title: 'Detail Proyek',
    requireAuth: true,
    rbac: {
      module: 'projects',
      action: 'view',
    },
  },
  {
    path: '/jadwal',
    component: ScheduleScreen,
    section: 'Operasional Lapangan',
    title: 'Jadwal & Progres',
    requireAuth: true,
    rbac: {
      module: 'schedule',
      action: 'view',
    },
  },
  {
    path: '/anggaran',
    component: BudgetScreen,
    section: 'Operasional Lapangan',
    title: 'Anggaran & RAB',
    requireAuth: true,
    rbac: {
      module: 'budget',
      action: 'view',
    },
  },
  {
    path: '/harga-dasar',
    component: ResourcePricesScreen,
    section: 'Operasional Lapangan',
    title: 'Katalog Harga Dasar',
    requireAuth: true,
    rbac: {
      module: 'resource_prices',
      action: 'view',
    },
  },
  {
    path: '/ahsp',
    component: AHSPTemplatesScreen,
    section: 'Operasional Lapangan',
    title: 'Analisis AHSP PUPR',
    requireAuth: true,
    rbac: {
      module: 'ahsp_templates',
      action: 'view',
    },
  },
  {
    path: '/material',
    component: MaterialsScreen,
    section: 'Operasional Lapangan',
    title: 'Stok Material',
    requireAuth: true,
    rbac: {
      module: 'materials',
      action: 'view',
    },
  },
  {
    path: '/pengadaan',
    component: ProcurementScreen,
    section: 'Operasional Lapangan',
    title: 'Daftar PO & Vendor',
    requireAuth: true,
    rbac: {
      module: 'procurement',
      action: 'view',
    },
  },
  {
    path: '/laporan-harian',
    component: FieldReportsScreen,
    section: 'Operasional Lapangan',
    title: 'Laporan Harian Lapangan',
    requireAuth: true,
    rbac: {
      module: 'field_reports',
      action: 'view',
    },
  },
  {
    path: '/tim',
    component: TeamScreen,
    section: 'Sistem',
    title: 'Tim & Akses',
    requireAuth: true,
    rbac: {
      module: 'team',
      action: 'view',
    },
  },
  {
    path: '/laporan',
    component: ReportsScreen,
    section: 'Sistem',
    title: 'Laporan Konsolidasi',
    requireAuth: true,
    rbac: {
      module: 'reports',
      action: 'view',
    },
  },
  {
    path: '/pengaturan',
    component: SettingsScreen,
    section: 'Sistem',
    title: 'Pengaturan Workspace',
    requireAuth: true,
    rbac: {
      module: 'settings',
      action: 'view',
    },
  },
  {
    path: '/terima-undangan',
    component: AcceptInvitationScreen,
    section: 'Autentikasi',
    title: 'Terima Undangan',
    requireAuth: false,
  },
];

// Helper to find route config by path
export function getRouteConfig(pathname: string): RouteConfig | undefined {
  return ROUTES.find((route) => {
    if (route.path.includes(':')) {
      // Match dynamic routes
      const pattern = route.path.replace(/:[^/]+\?/g, '([^/]+)?').replace(/:[^/]+/g, '([^/]+)');
      const regex = new RegExp(`^${pattern}$`);
      return regex.test(pathname);
    }
    return route.path === pathname;
  });
}
