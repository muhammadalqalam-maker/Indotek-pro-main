/**
 * tests/offline-sync.test.ts
 * Uji Antrean Offline IndexedDB, Idempotency Key, dan Sinkronisasi Laporan + 3 Foto.
 */

// Mock in-memory IndexedDB untuk runtime Node.js
class MockIDBStore {
  data = new Map<string, any>();

  add(val: any) {
    this.data.set(val.localId, val);
    const req: any = { result: val.localId, onsuccess: null, onerror: null };
    setTimeout(() => req.onsuccess && req.onsuccess(), 0);
    return req;
  }
  get(key: string) {
    const val = this.data.get(key);
    const req: any = { result: val, onsuccess: null, onerror: null };
    setTimeout(() => req.onsuccess && req.onsuccess(), 0);
    return req;
  }
  getAll() {
    const arr = Array.from(this.data.values());
    const req: any = { result: arr, onsuccess: null, onerror: null };
    setTimeout(() => req.onsuccess && req.onsuccess(), 0);
    return req;
  }
  put(val: any) {
    this.data.set(val.localId, val);
    const req: any = { onsuccess: null, onerror: null };
    setTimeout(() => req.onsuccess && req.onsuccess(), 0);
    return req;
  }
  delete(key: string) {
    this.data.delete(key);
    const req: any = { onsuccess: null, onerror: null };
    setTimeout(() => req.onsuccess && req.onsuccess(), 0);
    return req;
  }
  createIndex() {}
}

const mockStore = new MockIDBStore();

const mockDB: any = {
  objectStoreNames: { contains: () => true },
  transaction: () => ({
    objectStore: () => mockStore,
  }),
};

(global as any).window = {
  indexedDB: {
    open: () => {
      const req: any = { result: mockDB, onsuccess: null, onerror: null, onupgradeneeded: null };
      setTimeout(() => req.onsuccess && req.onsuccess(), 0);
      return req;
    },
  },
};

Object.defineProperty(globalThis.navigator, 'onLine', {
  value: false,
  configurable: true,
  writable: true,
});

import {
  enqueueOfflineFieldReport,
  getOfflineQueue,
  processOfflineSync,
  removeOfflineReport,
} from '../src/utils/offlineQueue';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`✅ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${msg}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n--- [TEST SUITE: OFFLINE PWA QUEUE & AUTO-SYNC 3 FOTO] ---\n');

  console.log('[1] Pembuatan Laporan Harian + 3 Foto dalam Mode Pesawat (Offline)');
  (global as any).navigator.onLine = false;

  const mockBlob = Buffer.from('mock-compressed-jpeg-data');
  const photos = [
    { id: '1', blob: mockBlob as any, fileName: 'cor-zona-a.jpg', mimeType: 'image/jpeg', sizeBytes: 154200, caption: 'Pengecoran Kolom K1 Lantai 2' },
    { id: '2', blob: mockBlob as any, fileName: 'rebar-inspection.jpg', mimeType: 'image/jpeg', sizeBytes: 210400, caption: 'Inspeksi Pembesian Balok B2' },
    { id: '3', blob: mockBlob as any, fileName: 'safety-briefing.jpg', mimeType: 'image/jpeg', sizeBytes: 180300, caption: 'Toolbox Meeting K3 Pagi' },
  ];

  const queuedItem = await enqueueOfflineFieldReport({
    workspaceId: '550e8400-e29b-41d4-a716-446655440000',
    projectId: 'proj-001',
    projectName: 'Pembangunan RSUD Pratama',
    reportDate: '2026-10-13',
    weatherMorning: 'Cerah',
    weatherAfternoon: 'Hujan Ringan',
    workingHours: 8,
    siteSupervisor: 'Budi Santoso, ST',
    workforce: [{ role: 'Tukang Batu', count: 12 }, { role: 'Pekerja', count: 8 }],
    completedWorks: ['Pengecoran kolom K1', 'Pemasangan bekisting lantai 2'],
    materialsUsed: [{ name: 'Semen Gresik', quantity: '150 sak' }],
    equipmentUsed: [{ name: 'Concrete Mixer', hours: 6 }],
    blockers: 'Hujan rintik sore jam 16:30',
    photos,
  });

  assert(queuedItem.localId.startsWith('draft-'), 'LocalId draft unik berhasil dibuat');
  assert(queuedItem.idempotencyKey.startsWith('idemp-fr-'), 'Idempotency key otomatis dibuat untuk mencegah duplikasi');
  assert(queuedItem.status === 'pending', 'Status antrean awal adalah pending');
  assert(queuedItem.photos.length === 3, 'Persis 3 foto tersimpan di antrean offline');

  console.log('\n[2] Pemeriksaan Antrean Offline Saat Tidak Ada Internet');
  const queueBeforeOnline = await getOfflineQueue();
  assert(queueBeforeOnline.length === 1, 'Antrean offline memiliki 1 item tersimpan');
  assert(queueBeforeOnline[0].photos[0].caption === 'Pengecoran Kolom K1 Lantai 2', 'Metadata foto 1 tersimpan utuh');
  assert(queueBeforeOnline[0].photos[2].caption === 'Toolbox Meeting K3 Pagi', 'Metadata foto 3 tersimpan utuh');

  // Mencoba sync saat masih offline harus 0 diproses
  const syncWhileOffline = await processOfflineSync(async () => ({ success: true }));
  assert(syncWhileOffline.processed === 0, 'Sinkronisasi tidak dijalankan saat navigator.onLine bernilai false');

  console.log('\n[3] Simulasi Pulih Online (Event Online & Auto-Sync)');
  (global as any).navigator.onLine = true; // Kembali online!

  let receivedPayload: any = null;
  const syncResult = await processOfflineSync(async (item) => {
    receivedPayload = item;
    return { success: true };
  });

  assert(syncResult.processed === 1, '1 item pending berhasil diproses saat online');
  assert(syncResult.succeeded === 1, '1 item berhasil disinkronkan ke server');
  assert(receivedPayload !== null, 'Callback menerima payload laporan yang utuh');
  assert(receivedPayload.idempotencyKey === queuedItem.idempotencyKey, 'Idempotency key yang sama dikirimkan ke server');
  assert(receivedPayload.photos.length === 3, 'Ketiga foto berhasil dikirimkan');

  const queueAfterSync = await getOfflineQueue();
  assert(queueAfterSync.length === 0, 'Antrean offline bersih setelah sinkronisasi berhasil');

  console.log('\n[4] Pengujian Resolusi Konflik (Server Menang)');
  // Masukkan draft yang sengaja mengalami konflik di server
  const conflictDraft = await enqueueOfflineFieldReport({
    workspaceId: '550e8400-e29b-41d4-a716-446655440000',
    projectId: 'proj-001',
    projectName: 'Pembangunan RSUD Pratama',
    reportDate: '2026-10-13',
    weatherMorning: 'Cerah',
    weatherAfternoon: 'Cerah',
    workingHours: 8,
    siteSupervisor: 'Budi Santoso, ST',
    workforce: [],
    completedWorks: ['Pekerjaan lama'],
    materialsUsed: [],
    equipmentUsed: [],
    photos: [],
  });

  const conflictSyncResult = await processOfflineSync(async () => {
    // Server merespons bahwa versi server lebih baru / konflik
    return {
      success: false,
      conflict: {
        serverMessage: 'Versi server telah disahkan oleh PM terlebih dahulu.',
      },
    };
  });

  assert(conflictSyncResult.conflicts === 1, 'Konflik server terdeteksi dengan tepat');
  const queueWithConflict = await getOfflineQueue();
  assert(queueWithConflict[0].status === 'conflict', 'Item ditandai berstatus conflict');
  assert(queueWithConflict[0].serverConflictData.serverMessage.includes('disahkan oleh PM'), 'Detail konflik server disimpan untuk diperiksa pengguna');

  console.log('==========================================');
  console.log(`RINGKASAN OFFLINE SYNC TEST: ${passed} lulus, ${failed} gagal.`);
  console.log('==========================================\n');

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
