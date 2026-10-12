import React, { useState, useMemo } from 'react';
import { X, CheckCheck, AlertTriangle, AlertCircle, Info, CheckCircle2, Shield, FolderKanban } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../common/Button';

export const NotificationsDrawer: React.FC = () => {
  const {
    notificationsOpen,
    setNotificationsOpen,
    notifications,
    markNotificationAsRead,
    markAllNotificationsRead,
    setCurrentScreen,
  } = useApp();

  const { activeRole, canAccessProject } = useAuth();
  const [filterTab, setFilterTab] = useState<'all' | 'approvals' | 'alerts'>('all');

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
      setCurrentScreen(notif.targetScreen as any);
      setNotificationsOpen(false);
    }
  };

  const unreadCount = authorizedNotifications.filter((n) => !n.read).length;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#202B26]/30 backdrop-blur-[1px] transition-opacity"
        onClick={() => setNotificationsOpen(false)}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white border-l border-[#E2E8E4] shadow-2xl flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-[#E2E8E4] flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <h3 className="text-sm font-semibold text-[#202B26]">Pemberitahuan Sistem</h3>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-[#EAEFEA] text-[#12352B] font-bold">
                  {activeRole}
                </span>
              </div>
              <p className="text-[11px] text-[#69766F]">
                Notifikasi difilter berdasarkan peran & izin proyek aktif
              </p>
            </div>
            <button
              onClick={() => setNotificationsOpen(false)}
              className="p-1 rounded text-[#69766F] hover:text-[#202B26] hover:bg-[#F5F7F6] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Filter Tabs */}
          <div className="px-4 py-2 bg-[#FAFBFB] border-b border-[#E2E8E4] flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFilterTab('all')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                  filterTab === 'all' ? 'bg-[#12352B] text-white' : 'text-[#69766F] hover:bg-[#EAEFEA]'
                }`}
              >
                Semua ({authorizedNotifications.length})
              </button>
              <button
                onClick={() => setFilterTab('approvals')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                  filterTab === 'approvals' ? 'bg-[#12352B] text-white' : 'text-[#69766F] hover:bg-[#EAEFEA]'
                }`}
              >
                Approval
              </button>
              <button
                onClick={() => setFilterTab('alerts')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                  filterTab === 'alerts' ? 'bg-[#12352B] text-white' : 'text-[#69766F] hover:bg-[#EAEFEA]'
                }`}
              >
                Peringatan
              </button>
            </div>

            <button
              onClick={markAllNotificationsRead}
              className="text-[#285744] hover:text-[#12352B] font-medium flex items-center gap-1 hover:underline text-[11px] cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Tandai dibaca</span>
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#E2E8E4]/60">
            {authorizedNotifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#69766F]">
                <Info className="w-8 h-8 mx-auto text-[#CBD5CF] mb-2" />
                <p className="font-semibold text-[#202B26]">Tidak Ada Notifikasi</p>
                <p className="text-[11px] mt-1">
                  Tidak ada pemberitahuan yang memerlukan tindakan untuk peran <span className="font-semibold">{activeRole}</span> saat ini.
                </p>
              </div>
            ) : (
              authorizedNotifications.map((notif) => {
                const icons = {
                  warning: <AlertTriangle className="w-4 h-4 text-[#9E6B05] shrink-0" />,
                  alert: <AlertCircle className="w-4 h-4 text-[#A82A20] shrink-0" />,
                  info: <Info className="w-4 h-4 text-[#235D9F] shrink-0" />,
                  success: <CheckCircle2 className="w-4 h-4 text-[#1C6843] shrink-0" />,
                };

                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`p-4 transition-colors cursor-pointer hover:bg-[#F5F7F6] ${
                      !notif.read ? 'bg-[#F4F8F5]' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{icons[notif.type]}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className={`text-xs font-semibold ${!notif.read ? 'text-[#12352B]' : 'text-[#202B26]'}`}>
                            {notif.title}
                          </span>
                          {!notif.read && (
                            <span className="w-2 h-2 rounded-full bg-[#D6A85C] shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-[#69766F] leading-relaxed mb-2">{notif.message}</p>
                        <div className="flex items-center justify-between text-[10px] text-[#A2B8AE]">
                          <span>{notif.timestamp}</span>
                          {notif.targetScreen && (
                            <span className="text-[#285744] font-medium hover:underline">Buka menu →</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="p-3 bg-[#F9FBFA] border-t border-[#E2E8E4] flex items-center justify-between text-[11px] text-[#69766F]">
            <span>Peran: <strong className="text-[#202B26]">{activeRole}</strong></span>
            <span>{unreadCount} belum dibaca</span>
          </div>
        </div>
      </div>
    </div>
  );
};
