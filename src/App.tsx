/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import { UIProvider } from './context/UIContext';
import { AppShell } from './components/layout/AppShell';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ScreenSkeleton } from './components/common/LoadingSkeleton';
import { HardHat } from 'lucide-react';
import { ROUTES, type RouteConfig, NotFoundScreen } from './config/routes';

const LoginScreen = lazy(() => import('./components/screens/LoginScreen').then(m => ({ default: m.LoginScreen })));
const OnboardingWizard = lazy(() => import('./components/screens/OnboardingWizard').then(m => ({ default: m.OnboardingWizard })));

// Protected route wrapper with RBAC check
const ProtectedRoute: React.FC<{ route: RouteConfig }> = ({ route }) => {
  const { hasRolePermission } = useAuth();
  const Component = route.component;

  // Check RBAC permission if defined
  if (route.rbac && !hasRolePermission(route.rbac.module, route.rbac.action)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#FEE9E9] flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-[#C7362E]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-[#202B26] mb-2">Akses Terbatas</h2>
        <p className="text-sm text-[#69766F] max-w-md">
          Role Anda tidak memiliki izin untuk mengakses halaman ini. Hubungi administrator workspace untuk upgrade akses.
        </p>
      </div>
    );
  }

  return (
    <ErrorBoundary screenName={route.title}>
      <Component />
    </ErrorBoundary>
  );
};

const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {ROUTES.map((route) => (
        <Route
          key={route.path}
          path={route.path}
          element={<ProtectedRoute route={route} />}
        />
      ))}
      {/* 404 fallback */}
      <Route path="*" element={<NotFoundScreen />} />
    </Routes>
  );
};

const AuthenticatedApp: React.FC = () => {
  const { currentUser, userProfile, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#F5F7F6] text-[#202B26]">
        <div className="w-12 h-12 rounded-2xl bg-[#12352B] flex items-center justify-center mb-4 shadow-sm animate-pulse">
          <HardHat className="w-6 h-6 text-[#D6A85C]" />
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm tracking-wider text-[#12352B]">INDOTEK</span>
          <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-[#D6A85C] text-[#12352B] uppercase">
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

  // User logged in but has no workspace membership → show onboarding wizard
  const hasNoWorkspace = !userProfile || !userProfile.workspaceId || userProfile.workspaceId === 'indotek-jkt';
  if (hasNoWorkspace) {
    return (
      <ErrorBoundary screenName="Onboarding">
        <Suspense fallback={
          <div className="h-screen w-screen flex items-center justify-center bg-[#0D2318]">
            <div className="w-10 h-10 border-2 border-[#D6A85C] border-t-transparent rounded-full animate-spin" />
          </div>
        }>
          <OnboardingWizard
            userEmail={currentUser.email || ''}
            onComplete={() => window.location.reload()}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <AppProvider>
      <AppShell>
        <Suspense fallback={<ScreenSkeleton />}>
          <AppRoutes />
        </Suspense>
      </AppShell>
    </AppProvider>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <UIProvider>
          <AuthenticatedApp />
        </UIProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
