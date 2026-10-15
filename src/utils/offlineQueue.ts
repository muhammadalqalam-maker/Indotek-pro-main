/**
 * offlineQueue.ts
 * Antrean offline berbasis IndexedDB untuk Laporan Harian (Field Reports) dan foto dokumentasi.
 * Fitur:
 * - Penyimpanan lokal draft laporan saat tanpa koneksi internet (mode pesawat/lapangan blank-spot).
 * - Penyimpanan blob foto terkompresi.
 * - Idempotency key persisten untuk mencegah duplikasi pengiriman saat koneksi kembali.
 * - Sinkronisasi otomatis saat event 'online' terpicu.
 * - Resolusi konflik sederhana: Server menang jika sudah ada data terbaru, dan menampilkan perbedaan.
 */

export interface OfflinePhotoItem {
  id: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  caption: string;
}

export interface OfflineFieldReportItem {
  localId: string;
  idempotencyKey: string;
  workspaceId: string;
  projectId: string;
  projectName: string;
  reportDate: string;
  weatherMorning: string;
  weatherAfternoon: string;
  workingHours: number;
  siteSupervisor: string;
  workforce: Array<{ role: string; count: number }>;
  completedWorks: string[];
  materialsUsed: Array<{ name: string; quantity: string }>;
  equipmentUsed: Array<{ name: string; hours: number }>;
  blockers?: string;
  photos: OfflinePhotoItem[];
  createdAt: string;
  status: 'pending' | 'syncing' | 'synced' | 'conflict';
  error?: string;
  serverConflictData?: any;
}

const DB_NAME = 'indotek_offline_db';
const DB_VERSION = 1;
const STORE_REPORTS = 'field_reports_queue';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB tidak didukung pada lingkungan ini'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_REPORTS)) {
        const store = db.createObjectStore(STORE_REPORTS, { keyPath: 'localId' });
        store.createIndex('idempotencyKey', 'idempotencyKey', { unique: true });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

/**
 * Menyimpan draft laporan harian beserta foto ke antrean offline IndexedDB
 */
export async function enqueueOfflineFieldReport(
  item: Omit<OfflineFieldReportItem, 'localId' | 'idempotencyKey' | 'createdAt' | 'status'>
): Promise<OfflineFieldReportItem> {
  const db = await openDatabase();
  const localId = `draft-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const idempotencyKey = `idemp-fr-${localId}`;

  const record: OfflineFieldReportItem = {
    ...item,
    localId,
    idempotencyKey,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REPORTS, 'readwrite');
    const store = tx.objectStore(STORE_REPORTS);
    const req = store.add(record);

    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Membaca seluruh item dalam antrean offline
 */
export async function getOfflineQueue(): Promise<OfflineFieldReportItem[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REPORTS, 'readonly');
    const store = tx.objectStore(STORE_REPORTS);
    const req = store.getAll();

    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Menghapus laporan dari antrean setelah sukses disinkronkan ke server
 */
export async function removeOfflineReport(localId: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REPORTS, 'readwrite');
    const store = tx.objectStore(STORE_REPORTS);
    const req = store.delete(localId);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Memperbarui status item dalam antrean (misal menjadi 'conflict' atau 'error')
 */
export async function updateOfflineReportStatus(
  localId: string,
  status: OfflineFieldReportItem['status'],
  error?: string,
  serverConflictData?: any
): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REPORTS, 'readwrite');
    const store = tx.objectStore(STORE_REPORTS);
    const getReq = store.get(localId);

    getReq.onsuccess = () => {
      const item: OfflineFieldReportItem = getReq.result;
      if (!item) return resolve();
      item.status = status;
      if (error) item.error = error;
      if (serverConflictData) item.serverConflictData = serverConflictData;

      const putReq = store.put(item);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Proses sinkronisasi antrean offline ke server saat online
 */
export async function processOfflineSync(
  syncCallback: (item: OfflineFieldReportItem) => Promise<{ success: boolean; conflict?: any }>
): Promise<{ processed: number; succeeded: number; failed: number; conflicts: number }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { processed: 0, succeeded: 0, failed: 0, conflicts: 0 };
  }

  const queue = await getOfflineQueue();
  const pendingItems = queue.filter((q) => q.status === 'pending' || q.status === 'conflict');

  let succeeded = 0;
  let failed = 0;
  let conflicts = 0;

  for (const item of pendingItems) {
    try {
      await updateOfflineReportStatus(item.localId, 'syncing');
      const result = await syncCallback(item);

      if (result.success) {
        await removeOfflineReport(item.localId);
        succeeded++;
      } else if (result.conflict) {
        await updateOfflineReportStatus(item.localId, 'conflict', 'Konflik data server terdeteksi', result.conflict);
        conflicts++;
      } else {
        await updateOfflineReportStatus(item.localId, 'pending', 'Gagal memproses pengiriman');
        failed++;
      }
    } catch (err: any) {
      await updateOfflineReportStatus(item.localId, 'pending', err.message);
      failed++;
    }
  }

  return { processed: pendingItems.length, succeeded, failed, conflicts };
}
