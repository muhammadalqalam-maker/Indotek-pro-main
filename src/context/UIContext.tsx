/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Enterprise UI & Navigation Context
 */

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppSettings, dataService, resolveWorkspaceId, type ActorInfo } from '../services/dataService';
import { useAuth } from './AuthContext';
import { NotificationItem, AuditLogEntry, AuditActionType } from '../types';
import type { AppRole } from '../types/rbac';

export type ScreenId =
  | 'dashboard'
  | 'projects'
  | 'project-detail'
  | 'schedule'
  | 'budget'
  | 'materials'
  | 'procurement'
  | 'field-reports'
  | 'resource-prices'
  | 'ahsp-templates'
  | 'team'
  | 'reports'
  | 'settings';

export function getScreenIdFromPathname(pathname: string): ScreenId {
  if (pathname === '/') return 'dashboard';
  if (pathname.startsWith('/proyek/') || pathname.startsWith('/projects/')) return 'project-detail';
  if (pathname === '/proyek' || pathname.startsWith('/projects')) return 'projects';
  if (pathname.startsWith('/jadwal') || pathname.startsWith('/schedule')) return 'schedule';
  if (pathname.startsWith('/anggaran') || pathname.startsWith('/budget')) return 'budget';
  if (pathname.startsWith('/material') || pathname.startsWith('/materials')) return 'materials';
  if (pathname.startsWith('/pengadaan') || pathname.startsWith('/procurement')) return 'procurement';
  if (pathname.startsWith('/laporan-harian') || pathname.startsWith('/field-report')) return 'field-reports';
  if (pathname.startsWith('/harga-dasar') || pathname.startsWith('/resource-prices')) return 'resource-prices';
  if (pathname.startsWith('/ahsp') || pathname.startsWith('/ahsp-templates')) return 'ahsp-templates';
  if (pathname.startsWith('/tim') || pathname.startsWith('/team')) return 'team';
  if (pathname.startsWith('/laporan') || pathname.startsWith('/reports')) return 'reports';
  if (pathname.startsWith('/pengaturan') || pathname.startsWith('/settings')) return 'settings';
  return 'dashboard';
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'warning' | 'info' | 'danger';
  title?: string;
  message: string;
}

export interface UIContextType {
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
  projectDetailTab: string;
  setProjectDetailTab: (tab: string) => void;
  navigateToProjectDetail: (projectId: string, tab?: string) => void;

  globalSearch: string;
  setGlobalSearch: (q: string) => void;

  sidebarCollapsed: boolean;
  setSidebarCollapsed: (c: boolean | ((prev: boolean) => boolean)) => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (o: boolean) => void;
  notificationsOpen: boolean;
  setNotificationsOpen: (o: boolean) => void;
  isAddProjectModalOpen: boolean;
  setIsAddProjectModalOpen: (open: boolean) => void;

  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;

  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;

  isLoadingData: boolean;
  setIsLoadingData: (loading: boolean) => void;
  loadError: string | null;
  setLoadError: (err: string | null) => void;
  isTabVisible: boolean;

  // Per-domain loading states
  loadingProjects: boolean;
  setLoadingProjects: (loading: boolean) => void;
  loadingBudget: boolean;
  setLoadingBudget: (loading: boolean) => void;
  loadingMaterials: boolean;
  setLoadingMaterials: (loading: boolean) => void;
  loadingTeam: boolean;
  setLoadingTeam: (loading: boolean) => void;
  loadingFieldReports: boolean;
  setLoadingFieldReports: (loading: boolean) => void;
  loadingProcurement: boolean;
  setLoadingProcurement: (loading: boolean) => void;

  pendingActions: Record<string, boolean>;
  setPendingActions: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  isActionPending: (id: string) => boolean;

  notifications: NotificationItem[];
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  unreadNotificationCount: number;

  auditLogs: AuditLogEntry[];
  setAuditLogs: (logs: AuditLogEntry[]) => void;
  recordAuditEvent: (
    action: AuditActionType,
    recordType: AuditLogEntry['recordType'],
    recordId: string,
    details: string,
    projectId?: string,
    projectName?: string,
    extra?: { previousValue?: string; newValue?: string; metadata?: any }
  ) => Promise<void>;

  actorInfo: ActorInfo;
  workspaceId: string;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export const UIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser, userProfile, activeRole, isAdmin } = useAuth();
  const workspaceId = resolveWorkspaceId(userProfile?.workspaceId);
  const location = useLocation();
  const navigate = useNavigate();

  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [projectDetailTab, setProjectDetailTab] = useState<string>('overview');
  const [globalSearch, setGlobalSearch] = useState<string>('');

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [notificationsOpen, setNotificationsOpen] = useState<boolean>(false);
  const [isAddProjectModalOpen, setIsAddProjectModalOpen] = useState<boolean>(false);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState<Record<string, boolean>>({});

  // Per-domain loading states
  const [loadingProjects, setLoadingProjects] = useState<boolean>(true);
  const [loadingBudget, setLoadingBudget] = useState<boolean>(true);
  const [loadingMaterials, setLoadingMaterials] = useState<boolean>(true);
  const [loadingTeam, setLoadingTeam] = useState<boolean>(true);
  const [loadingFieldReports, setLoadingFieldReports] = useState<boolean>(true);
  const [loadingProcurement, setLoadingProcurement] = useState<boolean>(true);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  const [settings, setSettings] = useState<AppSettings>({
    companyName: '',
    companyAddress: '',
    taxNumberNPWP: '',
    tableDensity: 'comfortable',
    currency: 'IDR (Rp)',
    dateFormat: 'DD/MM/YYYY',
    alertScheduleDeviation: true,
    alertCriticalStock: true,
    alertHighValuePO: true,
    language: 'id',
    lastUpdated: '',
  });

  const actorInfo: ActorInfo = {
    actorName: userProfile?.name || currentUser?.displayName || 'Pengguna',
    actorRole: activeRole || 'Read-only Auditor',
  };

  const isActionPending = (id: string): boolean => Boolean(pendingActions[id]);

  const [isTabVisible, setIsTabVisible] = useState<boolean>(() => {
    return typeof document !== 'undefined' ? document.visibilityState === 'visible' : true;
  });

  const addToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = `toast-${crypto.randomUUID()}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Tab visibility listener
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleVisibilityChange = () => {
      setIsTabVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Load corporate settings once
  useEffect(() => {
    if (!currentUser) return;
    let isMounted = true;
    dataService.getSettings(workspaceId).then((s) => {
      if (isMounted && s) setSettings(s);
    }).catch((error: unknown) => {
      if (!isMounted) return;
      addToast({
        type: 'danger',
        title: 'Gagal Memuat Pengaturan',
        message: error instanceof Error ? error.message : String(error),
      });
    });
    return () => { isMounted = false; };
  }, [currentUser, workspaceId, addToast]);

  // Notifications Realtime Subscription (Global when visible)
  useEffect(() => {
    if (!currentUser || !isTabVisible) return;
    const unsub = dataService.subscribeNotifications(
      (items: NotificationItem[]) => setNotifications(items),
      workspaceId
    );
    return () => { unsub?.(); };
  }, [currentUser, isTabVisible, workspaceId]);

  // Load audit logs on demand for settings
  useEffect(() => {
    const screenId = getScreenIdFromPathname(location.pathname);
    if (!currentUser || screenId !== 'settings') return;
    let isMounted = true;
    dataService.getAuditLogsPaged({ pageSize: 50, wsId: workspaceId }).then((a) => {
      if (isMounted && a) setAuditLogs(a.items);
    }).catch((error: unknown) => {
      if (!isMounted) return;
      addToast({
        type: 'danger',
        title: 'Gagal Memuat Log Audit',
        message: error instanceof Error ? error.message : String(error),
      });
    });
    return () => { isMounted = false; };
  }, [currentUser, location.pathname, workspaceId, addToast]);

  const navigateToProjectDetail = (projectId: string, tab = 'overview') => {
    setSelectedProjectId(projectId);
    setProjectDetailTab(tab);
    navigate(`/proyek/${encodeURIComponent(projectId)}${tab === 'overview' ? '' : `/${encodeURIComponent(tab)}`}`);
  };

  const updateSettings = async (newSettings: Partial<AppSettings>) => {
    if (activeRole !== 'Owner / Director' && !isAdmin) {
      addToast({
        type: 'danger',
        title: 'Akses Ditolak',
        message: 'Hanya Owner / Director yang berwenang mengubah konfigurasi perusahaan.',
      });
      throw new Error('Akses ditolak: Hanya Owner / Director yang dapat mengubah konfigurasi perusahaan.');
    }

    const merged = { ...settings, ...newSettings };
    try {
      await dataService.saveSettings(merged, workspaceId);
      setSettings(merged);
      addToast({
        type: 'success',
        title: 'Pengaturan Disimpan',
        message: `Konfigurasi perusahaan berhasil disimpan ke Supabase.`,
      });
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Gagal Menyimpan Pengaturan',
        message: err?.message || 'Kesalahan saat menyimpan konfigurasi.',
      });
      throw err;
    }
  };

  const markNotificationAsRead = (id: string) => {
    dataService.markNotificationAsRead(id, workspaceId);
  };

  const markAllNotificationsRead = () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length > 0) {
      dataService.markAllNotificationsRead(workspaceId);
    }
  };

  const recordAuditEvent = async (
    action: AuditActionType,
    recordType: AuditLogEntry['recordType'],
    recordId: string,
    details: string,
    projectId?: string,
    projectName?: string,
    extra?: { previousValue?: string; newValue?: string; metadata?: any }
  ) => {
    await dataService.logAuditEvent({
      action,
      recordType,
      recordId,
      details,
      projectId,
      projectName,
      workspaceId,
      previousValue: extra?.previousValue,
      newValue: extra?.newValue,
      metadata: extra?.metadata,
      actor: actorInfo,
    }, workspaceId);
  };

  const unreadNotificationCount = notifications.filter((n) => !n.read).length;

  return (
    <UIContext.Provider
      value={{
        selectedProjectId,
        setSelectedProjectId,
        projectDetailTab,
        setProjectDetailTab,
        navigateToProjectDetail,
        globalSearch,
        setGlobalSearch,
        sidebarCollapsed,
        setSidebarCollapsed,
        mobileMenuOpen,
        setMobileMenuOpen,
        notificationsOpen,
        setNotificationsOpen,
        isAddProjectModalOpen,
        setIsAddProjectModalOpen,
        toasts,
        addToast,
        removeToast,
        settings,
        updateSettings,
        isLoadingData,
        setIsLoadingData,
        loadError,
        setLoadError,
        isTabVisible,
        pendingActions,
        setPendingActions,
        isActionPending,
        notifications,
        markNotificationAsRead,
        markAllNotificationsRead,
        unreadNotificationCount,
        auditLogs,
        setAuditLogs,
        recordAuditEvent,
        actorInfo,
        workspaceId,
        loadingProjects,
        setLoadingProjects,
        loadingBudget,
        setLoadingBudget,
        loadingMaterials,
        setLoadingMaterials,
        loadingTeam,
        setLoadingTeam,
        loadingFieldReports,
        setLoadingFieldReports,
        loadingProcurement,
        setLoadingProcurement,
      }}
    >
      {children}
    </UIContext.Provider>
  );
};

export const useUI = (): UIContextType => {
  const context = useContext(UIContext);
  if (!context) throw new Error('useUI must be used within a UIProvider');
  return context;
};
