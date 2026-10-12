/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider, useApp } from './context/AppContext';
import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ScreenSkeleton } from './components/common/LoadingSkeleton';
import { HardHat } from 'lucide-react';

const LoginScreen = lazy(() => import('./components/screens/LoginScreen').then(m => ({ default: m.LoginScreen })));
const DashboardScreen = lazy(() => import('./components/screens/DashboardScreen').then(m => ({ default: m.DashboardScreen })));
const ProjectsScreen = lazy(() => import('./components/screens/ProjectsScreen').then(m => ({ default: m.ProjectsScreen })));
const ProjectDetailScreen = lazy(() => import('./components/screens/ProjectDetailScreen').then(m => ({ default: m.ProjectDetailScreen })));
const ScheduleScreen = lazy(() => import('./components/screens/ScheduleScreen').then(m => ({ default: m.ScheduleScreen })));
const BudgetScreen = lazy(() => import('./components/screens/BudgetScreen').then(m => ({ default: m.BudgetScreen })));
const MaterialsScreen = lazy(() => import('./components/screens/MaterialsScreen').then(m => ({ default: m.MaterialsScreen })));
const ProcurementScreen = lazy(() => import('./components/screens/ProcurementScreen').then(m => ({ default: m.ProcurementScreen })));
const FieldReportsScreen = lazy(() => import('./components/screens/FieldReportsScreen').then(m => ({ default: m.FieldReportsScreen })));
const TeamScreen = lazy(() => import('./components/screens/TeamScreen').then(m => ({ default: m.TeamScreen })));
const ReportsScreen = lazy(() => import('./components/screens/ReportsScreen').then(m => ({ default: m.ReportsScreen })));
const SettingsScreen = lazy(() => import('./components/screens/SettingsScreen').then(m => ({ default: m.SettingsScreen })));

const MainScreenRouter: React.FC = () => {
  const { currentScreen } = useApp();

  const renderActiveScreen = () => {
    switch (currentScreen) {
      case 'dashboard':
        return (
          <ErrorBoundary screenName="Dashboard Eksekutif">
            <DashboardScreen />
          </ErrorBoundary>
        );
      case 'projects':
        return (
          <ErrorBoundary screenName="Portofolio Proyek">
            <ProjectsScreen />
          </ErrorBoundary>
        );
      case 'project-detail':
        return (
          <ErrorBoundary screenName="Detail Proyek">
            <ProjectDetailScreen />
          </ErrorBoundary>
        );
      case 'schedule':
        return (
          <ErrorBoundary screenName="Jadwal & Kurva-S">
            <ScheduleScreen />
          </ErrorBoundary>
        );
      case 'budget':
        return (
          <ErrorBoundary screenName="RAB & Pengendalian Biaya">
            <BudgetScreen />
          </ErrorBoundary>
        );
      case 'materials':
        return (
          <ErrorBoundary screenName="Logistik & Material">
            <MaterialsScreen />
          </ErrorBoundary>
        );
      case 'procurement':
        return (
          <ErrorBoundary screenName="Pengadaan & PO">
            <ProcurementScreen />
          </ErrorBoundary>
        );
      case 'field-reports':
        return (
          <ErrorBoundary screenName="Laporan Harian Lapangan">
            <FieldReportsScreen />
          </ErrorBoundary>
        );
      case 'team':
        return (
          <ErrorBoundary screenName="Manajemen Tim & RBAC">
            <TeamScreen />
          </ErrorBoundary>
        );
      case 'reports':
        return (
          <ErrorBoundary screenName="Laporan Eksekutif">
            <ReportsScreen />
          </ErrorBoundary>
        );
      case 'settings':
        return (
          <ErrorBoundary screenName="Pengaturan & Audit">
            <SettingsScreen />
          </ErrorBoundary>
        );
      default:
        return (
          <ErrorBoundary screenName="Dashboard Eksekutif">
            <DashboardScreen />
          </ErrorBoundary>
        );
    }
  };

  return (
    <Suspense fallback={<ScreenSkeleton />}>
      {renderActiveScreen()}
    </Suspense>
  );
};

const AuthenticatedApp: React.FC = () => {
  const { currentUser, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#F5F7F6] text-[#202B26]">
        <div className="w-12 h-12 rounded-2xl bg-[#12352B] flex items-center justify-center mb-4 shadow-sm animate-pulse">
          <HardHat className="w-6 h-6 text-[#D6A85C]" />
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm tracking-wider text-[#12352B]">INDOTEK</span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#D6A85C] text-[#12352B] uppercase">
            PRO
          </span>
        </div>
        <p className="text-xs text-[#69766F] mt-2 font-mono">Memuat sesi otorisasi enterprise...</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <ErrorBoundary screenName="Login Akun">
        <Suspense fallback={
          <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#F5F7F6] text-[#202B26]">
            <div className="w-10 h-10 border-2 border-[#12352B] border-t-transparent rounded-full animate-spin mb-3" />
            <span className="text-xs text-[#69766F] font-mono">Memuat portal login...</span>
          </div>
        }>
          <LoginScreen />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <AppProvider>
      <AppShell>
        <MainScreenRouter />
      </AppShell>
    </AppProvider>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}
