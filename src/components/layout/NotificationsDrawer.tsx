import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, CheckCheck, AlertTriangle, AlertCircle, Info, CheckCircle2, Shield, FolderKanban } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { Button } from '../common/Button';

export const NotificationsDrawer: React.FC = () => {
  const navigate = useNavigate();
  const {
    notificationsOpen,
    setNotificationsOpen,
    notifications,
    markNotificationAsRead,
    markAllNotificationsRead,
  } = useApp();

  const { activeRole, canAccessProject } = useAuth();
  const { addToast } = useUI();
  const [filterTab, setFilterTab] = useState<'all' | 'approvals' | 'alerts'>('all');
  const drawerRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // Focus trap and body scroll lock
  useEffect(() => {
    if (!notificationsOpen) return;

    // Store previously focused element
    previousActiveElementRef.current = document.activeElement as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setNotificationsOpen(false);
        return;
      }

      // Focus trap within drawer
      if (e.key === 'Tab' && drawerRef.current) {
        const focusableElements = drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    // Focus first focusable element
    const timer = setTimeout(() => {
      if (drawerRef.current) {
        const firstFocusable = drawerRef.current.querySelector<HTMLElement>(
          'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (firstFocusable) {
          firstFocusable.focus();
        }
      }
    }, 50);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus();
      }
    };
  }, [notificationsOpen, setNotificationsOpen]);

  // Filter notifications relevant to current user role and authorized projects
  const authorizedNotifications = useMemo(() => {
    return notifications.filter((notif) => {
      // 1. Role Authorization check
      if (notif.targetRoles && notif.targetRoles.length > 0) {
        const isRoleTargeted =
          activeRole === 'Owner / Director' ||
          notif.targetRoles.includes(activeRole);
        if (!isRoleTargeted) return false;
      }

      // 2. Project Authorization check
      if (notif.projectId && !canAccessProject(notif.projectId)) {
        return false;
      }

      // 3. Tab filter
      if (filterTab === 'approvals') {
        return notif.type === 'alert' || notif.title.toLowerCase().includes('persetujuan') || notif.title.toLowerCase().includes('menunggu');
      }
      if (filterTab === 'alerts') {
        return notif.type === 'warning' || notif.title.toLowerCase().includes('kritis') || notif.title.toLowerCase().includes('deviasi');
      }

      return true;
    });
  }, [notifications, activeRole, canAccessProject, filterTab]);

  if (!notificationsOpen) return null;

  const handleNotificationClick = (notif: typeof notifications[0]) => {
    markNotificationAsRead(notif.id);
    if (notif.targetScreen) {
      const targetRoutes: Record<string, string> = {
        procurement: '/pengadaan',
        materials: '/material',
        budget: '/anggaran',
        field_reports: '/laporan-harian',
        schedule: '/jadwal',
        proyek: '/proyek',
        pengadaan: '/pengadaan',
        material: '/material',
        anggaran: '/anggaran',
        'laporan-harian': '/laporan-harian',
        jadwal: '/jadwal',
      };
      const targetPath = targetRoutes[notif.targetScreen];
      if (!targetPath) {
        addToast({
          type: 'warning',
          title: 'Tujuan Notifikasi Tidak Dikenal',
          message: `Halaman "${notif.targetScreen}" belum tersedia.`,
        });
        return;
      }
      navigate(targetPath);
      setNotificationsOpen(false);
    }
  };

  const unreadCount = authorizedNotifications.filter((n) => !n.read).length;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-text-primary/30 backdrop-blur-[1px] transition-opacity"
        onClick={() => setNotificationsOpen(false)}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white border-l border-border-subtle shadow-2xl flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-border-subtle flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <h3 className="text-sm font-semibold text-text-primary">Pemberitahuan Sistem</h3>
                <span className="px-1.5 py-0.2 rounded text-xs font-mono bg-success-light text-primary font-bold">
                  {activeRole}
                </span>
              </div>
              <p className="text-xs text-text-muted">
                Notifikasi difilter berdasarkan peran & izin proyek aktif
              </p>
            </div>
            <button
              onClick={() => setNotificationsOpen(false)}
              className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-canvas cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Filter Tabs */}
          <div className="px-4 py-2 bg-neutral-bg border-b border-border-subtle flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFilterTab('all')}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                  filterTab === 'all' ? 'bg-primary text-white' : 'text-text-muted hover:bg-success-light'
                }`}
              >
                Semua ({authorizedNotifications.length})
              </button>
              <button
                onClick={() => setFilterTab('approvals')}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                  filterTab === 'approvals' ? 'bg-primary text-white' : 'text-text-muted hover:bg-success-light'
                }`}
              >
                Approval
              </button>
              <button
                onClick={() => setFilterTab('alerts')}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                  filterTab === 'alerts' ? 'bg-primary text-white' : 'text-text-muted hover:bg-success-light'
                }`}
              >
                Peringatan
              </button>
            </div>

            <button
              onClick={markAllNotificationsRead}
              className="text-primary-light hover:text-primary font-medium flex items-center gap-1 hover:underline text-xs cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Tandai dibaca</span>
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-border-subtle/60">
            {authorizedNotifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-text-muted">
                <Info className="w-8 h-8 mx-auto text-border-light mb-2" />
                <p className="font-semibold text-text-primary">Tidak Ada Notifikasi</p>
                <p className="text-xs mt-1">
                  Tidak ada pemberitahuan yang memerlukan tindakan untuk peran <span className="font-semibold">{activeRole}</span> saat ini.
                </p>
              </div>
            ) : (
              authorizedNotifications.map((notif) => {
                const icons = {
                  warning: <AlertTriangle className="w-4 h-4 text-warning shrink-0" />,
                  alert: <AlertCircle className="w-4 h-4 text-danger shrink-0" />,
                  info: <Info className="w-4 h-4 text-info shrink-0" />,
                  success: <CheckCircle2 className="w-4 h-4 text-success shrink-0" />,
                };

                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`p-4 transition-colors cursor-pointer hover:bg-canvas ${
                      !notif.read ? 'bg-success-light' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{icons[notif.type]}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className={`text-xs font-semibold ${!notif.read ? 'text-primary' : 'text-text-primary'}`}>
                            {notif.title}
                          </span>
                          {!notif.read && (
                            <span className="w-2 h-2 rounded-full bg-warning shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-text-muted leading-relaxed mb-2">{notif.message}</p>
                        <div className="flex items-center justify-between text-xs text-text-muted/70">
                          <span>{notif.timestamp}</span>
                          {notif.targetScreen && (
                            <span className="text-primary-light font-medium hover:underline">Buka menu →</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="p-3 bg-neutral-bg border-t border-border-subtle flex items-center justify-between text-xs text-text-muted">
            <span>Peran: <strong className="text-text-primary">{activeRole}</strong></span>
            <span>{unreadCount} belum dibaca</span>
          </div>
        </div>
      </div>
    </div>
  );
};
