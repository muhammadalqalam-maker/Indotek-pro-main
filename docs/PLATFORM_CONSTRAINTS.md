# INDOTEK PRO — ATURAN & BATASAN PLATFORM GLOBAL

Dokumen ini mendokumentasikan batasan arsitektur, kepatuhan platform, dan tata kelola operasional yang **wajib dipatuhi** oleh semua pengembang dan automated tools di repositori Indotek Pro.

---

## 1. Identitas & Stack Aplikasi
- **Aplikasi**: Indotek Pro — Enterprise Construction Management SaaS.
- **Stack Inti**: React 19 + Vite + Express (`server.ts`) + Firebase Admin SDK + Google Cloud Firestore.
- **Integritas Fitur**: Jangan mengubah alur kerja atau fitur bisnis (RAB/WBS, monitoring S-Curve EVM, alur pengadaan PO bertingkat, mutasi stok, pelaporan harian, audit WORM) kecuali secara eksplisit diminta oleh pengguna.

---

## 2. Satu-Satunya Sumber Kebenaran Security Rules (`firestore.rules`)
- File `firestore.rules` di root repositori adalah **SATU-SATUNYA sumber kebenaran (single source of truth)** untuk aturan keamanan Firestore.
- **Dilarang keras** mengedit rules secara langsung melalui Firebase Console karena perubahan tersebut akan tertimpa saat deployment berikutnya.
- Setiap modifikasi rules wajib mengikuti siklus baku:
  1. Ubah file `firestore.rules`.
  2. Jalankan test suite emulator rules (`npx tsx firestore.rules.test.ts`).
  3. Terapkan rules melalui mekanisme integrasi platform AI Studio (`deploy_firebase`).
- **Dilarang** menyunting file `firebase-blueprint.json` secara manual.

---

## 3. Prosedur Deployment Cloud Run
- Deployment aplikasi dilakukan **HANYA melalui mekanisme Share > Publish ke Cloud Run**.
- **Dilarang** menambahkan langkah `firebase deploy hosting`.
- Server Express (`server.ts`):
  - Wajib membaca port dari environment variable `PORT` (fallback `3000`).
  - Wajib melayani file build statis dari direktori `dist/` saat `NODE_ENV=production`.
  - Mengintegrasikan Vite middleware hanya pada mode development.

---

## 4. Efisiensi Kuota Bersama Firestore (AI Shared Quota)
- Firestore menggunakan kuota bersama (shared quota) pada project AI Studio:
  - **50.000 read** per hari
  - **40.000 write** per hari
  - **50.000 realtime update** per hari
  - Kuota ini dibagi ke seluruh database di dalam project.
- **Disiplin Akses Data**:
  - Setiap perubahan kode tidak boleh menambah jumlah realtime listener (`onSnapshot`) atau pembacaan berulang tanpa justifikasi tertulis.
  - Prioritaskan pagination, batas limit query, indexing komposit, dan transactional state machine backend.

---

## 5. Konfigurasi Terpusat & Anti-Hardcoding
- **Dilarang keras** melakukan hardcode terhadap:
  - Project ID
  - Database ID / Named Firestore Database ID
  - Alamat email pengguna
  - API Keys atau secrets lainnya
- **Satu Sumber Konfigurasi**:
  - Seluruh konfigurasi project wajib dibaca dari file `firebase-applet-config.json` di root repository atau via environment variables / Secrets.
  - Komponen server menggunakan helper terpadu `loadFirebaseConfig()` dari `src/server/firebaseAdmin.ts`.
  - Jika `projectId` atau `databaseId` tidak ditemukan, inisialisasi wajib gagal dengan pesan error yang jelas dan deskriptif.

---

## 6. Integritas Database & Wilayah Cloud
- **Dilarang** membuat project Firebase/GCP baru atau database Firestore baru.
- **Dilarang** mengubah lokasi (region) database Firestore yang telah diprovisi.
- Seluruh skrip administrasi, migrasi, dan seed wajib menargetkan instance database yang aktif sesuai `firebase-applet-config.json`.

---

## 7. Standar Verifikasi & Manajemen Paket
- **Package Manager**: Standar repositori menggunakan **npm** (`packageManager: npm` di `package.json`). File `bun.lock` tidak digunakan.
- **Siklus Kerja Bertahap**:
  1. Tampilkan daftar file yang akan dan telah diubah.
  2. Jalankan verifikasi statis (`npm run lint` / `tsc --noEmit`).
  3. Jalankan automated test suite yang relevan (`npm test`).
  4. Berikan ringkasan hasil verifikasi dan analisis risiko tersisa sebelum penyelesaian tugas.
