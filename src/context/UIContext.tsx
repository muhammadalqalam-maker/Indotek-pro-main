/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Enterprise UI & Navigation Context
 */

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { AppSettings, firestoreService, DEFAULT_WORKSPACE_ID } from '../services/firestoreService';
import { testConnection, isQuotaExhaustedError } from '../lib/firebase';
import { useAuth } from './AuthContext';
import { NotificationItem, AuditLogEntry, AuditActionType } from '../types';

export type ScreenId =
  | 'dashboard'
  | 'projects'
  | 'project-detail'
  | 'schedule'
  | 'budget'
  | 'materials'
  | 'procurement'
  | 'field-reports'
  | 'team'
  | 'reports'
  | 'settings';

export interface ToastMessage {
  id: string;
  type: 'success' | 'warning' | 'info' | 'danger';
  title?: string;
  message: string;
}

export interface UIContextType {
  currentScreen: ScreenId;
  setCurrentScreen: (screen: ScreenId) => void;
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
  isQuotaExhausted: boolean;
  isTabVisible: boolean;
  isFirestoreSyncing: boolean;
  setIsFirestoreSyncing: (syncing: boolean) => void;

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

  actorInfo: {
    uid: string;
    name: string;
    role: any;
    email: string;
  };
  workspaceId: string;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export const UIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser, userProfile, activeRole, isAdmin } = useAuth();
  const workspaceId = userProfile?.workspaceId || DEFAULT_WORKSPACE_ID;

  const [currentScreen, setCurrentScreen] = useState<ScreenId>('dashboard');
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
  const [isFirestoreSyncing, setIsFirestoreSyncing] = useState<boolean>(false);
  const [pendingActions, setPendingActions] = useState<Record<string, boolean>>({});

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  const [settings, setSettings] = useState<AppSettings>({
    companyName: 'PT Indotek Bangun Nusantara',
    companyAddress: 'Gedung Graha Surveyor Indonesia Lt. 14, Jl. Gatot Subroto Kav. 56, Jakarta Selatan 12950',
    taxNumberNPWP: '01.345.678.9-012.000',
    tableDensity: 'comfortable',
    currency: 'IDR (Rp)',
    dateFormat: 'DD/MM/YYYY',
    alertScheduleDeviation: true,
    alertCriticalStock: true,
    alertHighValuePO: true,
    language: 'id',
  });

  const actorInfo = {
    uid: currentUser?.uid || 'user',
    name: userProfile?.name || currentUser?.displayName || 'Pengguna',
    role: activeRole,
    email: currentUser?.email || '',
  };

  const isActionPending = (id: string): boolean => Boolean(pendingActions[id]);

  const [isTabVisible, setIsTabVisible] = useState<boolean>(() => {
    return typeof document !== 'undefined' ? document.visibilityState === 'visible' : true;
  });
  const [isQuotaExhausted, setIsQuotaExhausted] = useState<boolean>(false);

  useEffect(() => {
    testConnection();
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

  // Quota exhausted listener
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleQuota = () => {
      setIsQuotaExhausted(true);
    };
    window.addEventListener('firestore:quota-exhausted', handleQuota);
    return () => {
      window.removeEventListener('firestore:quota-exhausted', handleQuota);
    };
  }, []);

  // Load corporate settings once
  useEffect(() => {
    if (!currentUser) return;
    let isMounted = true;
    firestoreService.getSettings(false, workspaceId).then((s) => {
      if (isMounted && s) setSettings(s);
    }).catch((err) => {
      console.warn('Settings load notice:', err);
    });
    return () => { isMounted = false; };
  }, [currentUser, workspaceId]);

  // Notifications Realtime Subscription (Global when visible)
  useEffect(() => {
    if (!currentUser || !isTabVisible) return;
    const unsub = firestoreService.subscribeNotifications(
      (items) => setNotifications(items),
      (err) => console.warn('Notifications sync notice:', err),
      workspaceId
    );
    return () => { unsub?.(); };
  }, [currentUser, isTabVisible, workspaceId]);

  // Load audit logs on demand for settings
  useEffect(() => {
    if (!currentUser || currentScreen !== 'settings') return;
    let isMounted = true;
    firestoreService.getAuditLogsPaginated(50, undefined, workspaceId).then((a) => {
      if (isMounted && a) setAuditLogs(a.items);
    }).catch(console.warn);
    return () => { isMounted = false; };
  }, [currentUser, currentScreen, workspaceId]);

  const addToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const navigateToProjectDetail = (projectId: string, tab = 'overview') => {
    setSelectedProjectId(projectId);
    setProjectDetailTab(tab);
    setCurrentScreen('project-detail');
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
      await firestoreService.saveSettings(merged, actorInfo, workspaceId);
      setSettings(merged);
      addToast({
        type: 'success',
        title: 'Pengaturan Disimpan',
        message: `Konfigurasi perusahaan berhasil disimpan ke Firestore workspaces/${workspaceId}/settings.`,
      });
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Gagal Menyimpan Pengaturan',
        message: err?.message || 'Kesalahan aturan keamanan Firestore saat menyimpan konfigurasi.',
      });
      throw err;
    }
  };

  const markNotificationAsRead = (id: string) => {
    firestoreService.markNotificationAsRead(id, workspaceId);
  };

  const markAllNotificationsRead = () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length > 0) {
      firestoreService.markAllNotificationsRead(unreadIds, workspaceId);
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
    await firestoreService.logAuditEvent({
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
        currentScreen,
        setCurrentScreen,
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
        isQuotaExhausted,
        isTabVisible,
        isFirestoreSyncing,
        setIsFirestoreSyncing,
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
