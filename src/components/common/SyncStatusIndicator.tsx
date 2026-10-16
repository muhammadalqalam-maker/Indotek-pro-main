/**
 * SyncStatusIndicator.tsx
 * Indikator status sinkronisasi PWA / Offline Queue.
 * Menampilkan status Online, Offline, Menyinkronkan, atau Konflik data.
 * Memungkinkan sinkronisasi manual dan inspeksi perbedaan konflik data server.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  X,
  FileText,
  ChevronRight,
} from 'lucide-react';
import {
  getOfflineQueue,
  markOfflinePhotoUploaded,
  processOfflineSync,
  OfflineFieldReportItem,
  removeOfflineReport,
} from '../../utils/offlineQueue';
import { useApp } from '../../context/AppContext';
import { useUI } from '../../context/UIContext';
import { supabaseDataService } from '../../services/supabaseDataService';
import type { FieldReport } from '../../types';

const isWeatherCondition = (value: string): value is FieldReport['weatherMorning'] =>
  ['Cerah', 'Berawan', 'Hujan Ringan', 'Hujan Deras'].includes(value);

export const SyncStatusIndicator: React.FC = () => {
  const { addFieldReport, projects } = useApp();
  const { addToast } = useUI();

  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [queue, setQueue] = useState<OfflineFieldReportItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedConflict, setSelectedConflict] = useState<OfflineFieldReportItem | null>(null);
  const queueErrorShown = useRef(false);

  const refreshQueue = async () => {
    try {
      const items = await getOfflineQueue();
      setQueue(items);
      queueErrorShown.current = false;
    } catch (err) {
      if (!queueErrorShown.current) {
        queueErrorShown.current = true;
        addToast({
          type: 'danger',
          title: 'Antrean Offline Tidak Tersedia',
          message: err instanceof Error ? err.message : 'Tidak dapat membaca antrean laporan offline.',
        });
      }
    }
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      addToast({
        type: 'info',
        title: 'Koneksi Pulih',
        message: 'Perangkat terhubung kembali ke jaringan. Memulai sinkronisasi otomatis...',
      });
      triggerSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
      addToast({
        type: 'warning',
        title: 'Mode Offline',
        message: 'Koneksi terputus. Data laporan harian akan disimpan di antrean lokal perangkat.',
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    refreshQueue();
    const interval = setInterval(refreshQueue, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const triggerSync = async () => {
    if (!navigator.onLine || isSyncing) return;
    setIsSyncing(true);

    try {
      const res = await processOfflineSync(async (item) => {
        try {
          if (!isWeatherCondition(item.weatherMorning) || !isWeatherCondition(item.weatherAfternoon)) {
            throw new Error('Data cuaca laporan offline tidak valid; periksa laporan sebelum mencoba sinkronisasi lagi.');
          }

          // Kirim laporan ke context/server
          const reportId = await addFieldReport({
            projectId: item.projectId,
            projectName: item.projectName,
            date: item.reportDate,
            weatherMorning: item.weatherMorning,
            weatherAfternoon: item.weatherAfternoon,
            workingHours: item.workingHours,
            siteSupervisor: item.siteSupervisor,
            workforce: item.workforce,
            completedWorks: item.completedWorks,
            materialsUsed: item.materialsUsed,
            equipmentUsed: item.equipmentUsed,
            blockers: item.blockers,
            photos: [],
          }, item.idempotencyKey);

          for (const photo of item.photos) {
            if (item.uploadedPhotoIds?.includes(photo.id)) continue;
            await supabaseDataService.uploadAttachment({
              workspaceId: item.workspaceId,
              recordType: 'field_report',
              recordId: reportId,
              fileBlob: photo.blob,
              fileName: photo.fileName,
              mimeType: photo.mimeType,
              sizeBytes: photo.sizeBytes,
              caption: photo.caption,
            });
            await markOfflinePhotoUploaded(item.localId, photo.id);
          }

          return { success: true };
        } catch (err: any) {
          // Jika server menolak karena konflik, kembalikan objek konflik
          if (err.message?.includes('conflict') || err.message?.includes('409') || err.message?.includes('duplikat')) {
            return {
              success: false,
              conflict: {
                serverMessage: err.message,
                syncedAt: new Date().toISOString(),
              },
            };
          }
          throw err;
        }
      });

      await refreshQueue();

      if (res.succeeded > 0) {
        addToast({
          type: 'success',
          title: 'Sinkronisasi Selesai',
          message: `${res.succeeded} laporan harian offline berhasil disinkronkan ke server.`,
        });
      }
      if (res.failed > 0) {
        addToast({
          type: 'danger',
          title: 'Sinkronisasi Belum Selesai',
          message: `${res.failed} laporan gagal disinkronkan. Data tetap disimpan di antrean untuk dicoba kembali.`,
        });
      }
    } catch (err: any) {
      console.error('Error saat sinkronisasi:', err);
      addToast({
        type: 'danger',
        title: 'Gagal Menyinkronkan Laporan',
        message: err?.message || 'Terjadi kesalahan saat memproses antrean offline.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const pendingCount = queue.filter((q) => q.status === 'pending').length;
  const conflictItems = queue.filter((q) => q.status === 'conflict');

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Status Pill */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
            !isOnline
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              : conflictItems.length > 0
              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30 cursor-pointer'
              : pendingCount > 0
              ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
          }`}
          onClick={() => {
            if (conflictItems.length > 0) setSelectedConflict(conflictItems[0]);
          }}
          title={
            !isOnline
              ? 'Mode Offline: Perangkat tidak tersambung internet'
              : conflictItems.length > 0
              ? 'Klik untuk melihat konflik data server'
              : 'Status Koneksi Normal'
          }
        >
          {!isOnline ? (
            <>
              <WifiOff className="w-3.5 h-3.5" />
              <span>Offline {pendingCount > 0 && `(${pendingCount} Draft)`}</span>
            </>
          ) : conflictItems.length > 0 ? (
            <>
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{conflictItems.length} Konflik Data</span>
            </>
          ) : isSyncing ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Menyinkronkan...</span>
            </>
          ) : pendingCount > 0 ? (
            <>
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{pendingCount} Menunggu Sinkron</span>
            </>
          ) : (
            <>
              <Wifi className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Online</span>
            </>
          )}
        </div>

        {/* Manual Sync Button if there are pending items & online */}
        {isOnline && (pendingCount > 0 || conflictItems.length > 0) && (
          <button
            type="button"
            onClick={triggerSync}
            disabled={isSyncing}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center p-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs transition disabled:opacity-50"
            title="Sinkronkan antrean sekarang"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* Modal Resolusi Konflik (Server Menang) */}
      {selectedConflict && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setSelectedConflict(null)}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/80">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                <h3 className="text-sm font-bold text-slate-100">Resolusi Konflik: Server Menang</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedConflict(null)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4 text-xs">
              <p className="text-slate-300 leading-relaxed">
                Data laporan harian tanggal{' '}
                <strong className="text-indigo-400 font-semibold">{selectedConflict.reportDate}</strong> pada proyek{' '}
                <strong className="text-white font-semibold">{selectedConflict.projectName}</strong> telah diperbarui
                lebih dahulu di server.
              </p>

              <div className="grid grid-cols-2 gap-3 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                <div>
                  <span className="font-semibold text-rose-400 block mb-1">Versi Lokal (Draft Offline)</span>
                  <p className="text-slate-400">Pengawas: {selectedConflict.siteSupervisor}</p>
                  <p className="text-slate-400">Jam Kerja: {selectedConflict.workingHours} Jam</p>
                  <p className="text-slate-400">Pekerjaan: {selectedConflict.completedWorks.join(', ')}</p>
                </div>
                <div>
                  <span className="font-semibold text-emerald-400 block mb-1">Status Server</span>
                  <p className="text-slate-400">
                    {selectedConflict.serverConflictData?.serverMessage || 'Versi server telah tercatat permanen.'}
                  </p>
                  <span className="text-xs text-slate-500 mt-2 block">
                    Kebijakan: Data server dipertahankan untuk integritas audit.
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={async () => {
                    await removeOfflineReport(selectedConflict.localId);
                    setSelectedConflict(null);
                    await refreshQueue();
                    addToast({
                      type: 'info',
                      title: 'Draft Lokal Dihapus',
                      message: 'Konflik diselesaikan dengan menerima versi server.',
                    });
                  }}
                  className="min-h-[44px] px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium transition"
                >
                  Terima Versi Server (Hapus Draft Lokal)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
export default SyncStatusIndicator;
