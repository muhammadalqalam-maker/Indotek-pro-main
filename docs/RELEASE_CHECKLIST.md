# INDOTEK PRO — RELEASE CHECKLIST & DEPLOYMENT PROTOCOL

Checklist ini adalah panduan wajib setiap kali merilis versi baru ke lingkungan produksi Cloud Run melalui AI Studio. Semua tahap harus dilalui secara berurutan untuk menjamin zero downtime, zero data corruption, dan perlindungan kuota.

---

## Tahap 1: Pra-Rilis & Kontrol Kode (Pre-Flight)

- [ ] **1. Git Clean & Commit Sebelum Perubahan Besar**:
  - Pastikan working tree bersih dan tidak ada file perubahan yang menggantung:
    ```bash
    git status
    ```
  - Buat atomic commit sebelum memulai refaktor atau penambahan modul kritis:
    ```bash
    git add .
    git commit -m "chore(pre-release): prepare release vX.Y.Z"
    ```
- [ ] **2. Tinjau Security Rules (`firestore.rules`)**:
  - Periksa apakah ada relaksasi aturan keamanan yang tidak disengaja.
  - Pastikan aturan wajib tetap kokoh:
    * Append-only WORM pada `/audit_logs` (`allow update, delete: if false;`).
    * Segregation of Duties: Pembuat Purchase Order tidak dapat menyetujui (approve) PO-nya sendiri.
    * Root admin mewajibkan `token.email_verified == true`.
    * Koleksi `/admins` tidak dapat ditulisi sembarang pengguna.
    * Akses multi-tenant terisolasi per `workspaceId`.

---

## Tahap 2: Rangkaian Pengujian Lokal & Simulasi (Quality Gate)

- [ ] **3. Static Typecheck & Linting**:
  - Eksekusi compiler check:
    ```bash
    npm run lint
    ```
  - Pastikan 0 TypeScript diagnostic errors (`tsc --noEmit`).

- [ ] **4. Jalankan Full Automated Test Suite**:
  - Eksekusi test suite komprehensif:
    ```bash
    npm test
    ```
  - Pastikan seluruh suite lulus 100%:
    * Functional QA (RBAC, calculations, S-Curve EVM math).
    * Universal Rules Test Harness.
    * Backend Workflow Engine, State Machine, Segregation of Duties, dan Concurrency Tests.

- [ ] **5. Jalankan Rules Test & Emulator Check**:
  - Jalankan script emulator rules:
    ```bash
    npm run test:rules:emulator
    ```
  - Verifikasi bahwa emulator rules (atau simulasi in-memory) lulus seluruh 9 test case keamanan.

---

## Tahap 3: Pemeriksaan Kuota Firestore Harian

- [ ] **6. Audit Konsumsi Kuota Hari Ini**:
  - Buka Google Cloud Console > **Firestore** > **Usage**.
  - Periksa metrik operasional harian:
    * **Reads**: Batas harian 50.000 (Pastikan sisa kuota aman, minimal > 10.000 tersisa sebelum rilis).
    * **Writes**: Batas harian 40.000.
    * **Deletes**: Batas harian 20.000.
  - Jika kuota hari ini mendekati 90%, tunda deploy yang memicu migrasi data besar ke awal siklus hari berikutnya (00:00 UTC / 07:00 WIB).

---

## Tahap 4: Penerapan Rules & Publikasi Aplikasi (Publish)

- [ ] **7. Sinkronisasi Security Rules ke Firebase**:
  - Terapkan file `firestore.rules` melalui platform tool AI Studio (`deploy_firebase`).
  - Pastikan rules berhasil ter-deploy tanpa syntax error.

- [ ] **8. Publikasi ke Cloud Run**:
  - Di AI Studio, klik **Share > Publish ke Cloud Run**.
  - Tunggu hingga proses container build selesai dan Cloud Run memperbarui routing traffic ke revisi baru.

---

## Tahap 5: Smoke Test & Verifikasi Pasca-Publish

- [ ] **9. Verifikasi Readiness Endpoint**:
  - Panggil endpoint `/api/health/ready`:
    ```bash
    curl -i https://<PROD_URL>/api/health/ready
    ```
  - Pastikan mengembalikan HTTP `200 OK` dengan payload:
    ```json
    { "status": "ready", "database": "connected" }
    ```

- [ ] **10. Verifikasi Liveness Endpoint**:
  - Panggil endpoint `/api/health`:
    ```bash
    curl -i https://<PROD_URL>/api/health
    ```
  - Pastikan mengembalikan HTTP `200 OK`.

- [ ] **11. Smoke Test Transaksional Nyata**:
  - Buka URL produksi di browser (mode Incognito disarankan untuk menguji fresh login).
  - Login dengan akun pengujian atau akun operasional resmi.
  - Lakukan 1 transaksi riil berbobot ringan:
    * Buka salah satu proyek di modul Proyek.
    * Tambah 1 catatan mutasi material atau draft Purchase Order.
    * Pastikan status transaksi terupdate seketika dan tercatat di `/audit_logs`.
    * Pastikan nomor dokumen terbentuk sekuensial (contoh: `PO-2026-IND-0146`).

- [ ] **12. Monitoring Log Cloud Run**:
  - Buka Cloud Logging Explorer untuk service Cloud Run.
  - Konfirmasi tidak ada `UnhandledPromiseRejection` atau error kredensial database ADC.
