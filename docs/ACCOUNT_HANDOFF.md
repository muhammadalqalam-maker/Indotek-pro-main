# INDOTEK PRO — PANDUAN PERPINDAHAN AKUN & REMIX (ACCOUNT HANDOFF RUNBOOK)

Dokumen ini memuat standar operasional baku pemisahan akun, tata kelola repositori, alur sinkronisasi GitHub dua arah, dan checklist lengkap saat melakukan remix ke akun Google / AI Studio baru.

---

## 1. Prinsip Pemisahan Akun: Satu Akun Produksi, Akun Lain Hanya Kode

Untuk menjaga integritas data dan keamanan operasional perusahaan:
1. **Satu Akun Produksi (Single Production Authority)**:
   - Hanya **satu akun Google / AI Studio** yang terhubung langsung ke proyek Google Cloud Platform (GCP) dan Firebase produksi aktif.
   - Akun produksi ini adalah pemilik resource Cloud Run (`ais-pre-...`), database Firestore aktif, Firebase Authentication, dan Secret Manager.
2. **Akun Pengembang / Kontributor (Code-Only Accounts)**:
   - Akun pengembang, kontributor, atau akun sekunder **TIDAK memiliki akses langsung** ke database produksi atau GCP IAM produksi.
   - Pengembangan dilakukan pada instance lokal atau branch terpisah menggunakan **Firebase Local Emulator Suite** (0 konsumsi kuota produksi).
   - Akses akun lain murni sebatas membaca dan mengubah source code di GitHub melalui Pull Request.

---

## 2. Alur Sinkronisasi GitHub Dua Arah & Resolusi Konflik

Repositori kode disinkronkan secara kontinu antara AI Studio dan repositori Git sentral di GitHub.

```
+---------------------------+        Push / PR         +----------------------------+
| AI Studio Build Instance  |  -------------------->   |   GitHub Central Repo      |
| (Lingkungan Pengembangan) |  <--------------------   | (Review & Merge ke main)   |
+---------------------------+        Pull / Fetch      +----------------------------+
```

### A. Alur Kerja Standar (Dua Arah)
1. **Sebelum mulai bekerja di AI Studio**:
   - Selalu lakukan sinkronisasi branch terbaru dari GitHub:
     ```bash
     git fetch origin
     git status
     ```
2. **Commit sebelum perubahan besar**:
   - Buat atomic commit dengan pesan deskriptif sebelum memodifikasi arsitektur atau security rules:
     ```bash
     git add .
     git commit -m "feat(module): deskripsi perubahan atomik"
     ```
3. **Mengirim perubahan (Push)**:
   - Buat feature branch dan push ke remote:
     ```bash
     git checkout -b feature/nama-fitur
     git push origin feature/nama-fitur
     ```
   - Buka Pull Request (PR) ke branch `main`. GitHub Actions CI (`.github/workflows/ci.yml`) akan menjalankan uji otomatis (lint, build, dan test).

### B. Strategi Penyelesaian Konflik (Merge Conflict Resolution)
Jika terjadi konflik antara perubahan di AI Studio dan remote GitHub:
1. **Ambil branch remote**:
   ```bash
   git fetch origin
   git merge origin/main
   ```
2. **Periksa file yang bentrok**:
   ```bash
   git status --short
   ```
3. **Aturan Prioritas Integritas**:
   - **`firestore.rules`**: Selalu pertahankan aturan yang paling ketat (paling aman). Pastikan aturan Segregation of Duties (SoD), validasi email terverifikasi, dan WORM audit logs tidak terhapus.
   - **`firebase-applet-config.json`**: Gunakan konfigurasi project target dari environment yang bersangkutan.
   - **`src/` dan komponen UI**: Selesaikan konflik manual, simpan, lalu verifikasi build:
     ```bash
     npm run lint
     npm test
     ```
4. **Selesaikan merge**:
   ```bash
   git add <file-konflik>
   git commit -m "fix(merge): resolve conflict with remote main"
   ```

---

## 3. Catatan Penting Mengenai Remix di AI Studio

> ⚠️ **PERHATIAN KHUSUS TENTANG DATA & USER AUTH SAAT REMIX**:
> 
> Saat sebuah aplikasi di-*remix* atau disalin ke akun AI Studio / Google yang baru:
> 1. **Data Firestore TIDAK ikut terbawa**: Database baru pada remix berstatus kosong (kosong dari koleksi proyek, material, PO, dll).
> 2. **Akun Pengguna Firebase Auth TIDAK ikut terbawa**: Daftar pengguna (user records) dari akun lama tidak ditransfer ke Firebase Auth baru.
> 3. **Custom Claims (Hak Akses Token) TIDAK ikut terbawa**: Semua custom claims (seperti `{ admin: true, role: 'Owner / Director' }`) harus di-bootstrap ulang pada akun baru.
> 
> **Kesimpulan**: Setelah remix, aplikasi berada dalam kondisi bersih (clean state) dan wajib melalui tahapan inisialisasi pada checklist di bawah ini.

---

## 4. Checklist Saat Remix / Setup Akun Baru (Step-by-Step)

Gunakan checklist urutan baku ini saat melakukan remix atau memindahkan codebase ke akun baru:

- [ ] **Langkah 1: Setup Environment Secrets**
  - Buka AI Studio / Cloud Run Environment Settings.
  - Tambahkan secrets yang diperlukan:
    * `GEMINI_API_KEY`: API key server-side untuk modul asisten analitik.
    * Pastikan tidak ada service account JSON atau credentials statis yang dicantumkan di kode repositori.

- [ ] **Langkah 2: Periksa Integrasi Firebase di AI Studio**
  - Masuk ke menu **Settings > Integrations > Firebase**.
  - Konfirmasi project GCP yang aktif:
    * Pastikan **Project ID**, **Cloud Region** (misal `asia-southeast1`), dan **Firestore Database ID** terdeteksi dengan benar.

- [ ] **Langkah 3: Sesuaikan `firebase-applet-config.json`**
  - Pastikan file `firebase-applet-config.json` di root repository mencerminkan konfigurasi project remix baru:
    * `projectId`: GCP Project ID akun baru.
    * `firestoreDatabaseId`: ID Named Firestore Database dari akun baru (atau `(default)` jika menggunakan database bawaan).
    * `apiKey`, `appId`, `authDomain`: Nilai web client app yang baru.

- [ ] **Langkah 4: Terapkan Firestore Security Rules**
  - Terapkan aturan keamanan `firestore.rules` ke database baru menggunakan tool integrasi resmi (`deploy_firebase`).
  - *Catatan*: `firestore.rules` adalah satu-satunya sumber kebenaran aturan keamanan.

- [ ] **Langkah 5: Jalankan Skrip Bootstrap Owner Pertama**
  - Buat akun administrator & owner pertama pada Firebase Auth dan database:
    ```bash
    npx tsx scripts/bootstrap-owner.ts <EMAIL_OWNER> "<PASSWORD_MIN_12_CHAR>" "<NAMA_LENGKAP>"
    ```
  - Skrip ini secara otomatis:
    1. Membuat akun di Firebase Authentication dengan status `emailVerified: true`.
    2. Menetapkan custom user claims `{ admin: true, role: 'Owner / Director', workspaceId: 'indotek-jkt' }`.
    3. Mendaftarkan dokumen profil ke koleksi `/admins`, `/team_members`, dan `/workspaces/indotek-jkt/members`.

- [ ] **Langkah 6: Seed Data Awal (Opsional untuk Lingkungan Non-Produksi)**
  - Untuk lingkungan staging/demo:
    ```bash
    # Mengisi data dasar tanpa menyentuh kuota produksi live
    npm run seed:emulator
    ```
  - Untuk inisialisasi workspace produksi pertama:
    ```bash
    npx tsx scripts/seed-staging.ts
    ```

- [ ] **Langkah 7: Publikasi Aplikasi (Publish)**
  - Buka menu **Share > Publish ke Cloud Run**.
  - Biarkan proses build container selesai hingga URL produksi terbentuk.

- [ ] **Langkah 8: Verifikasi Kesiapan Server (`/api/health/ready`)**
  - Panggil endpoint readiness probe:
    ```bash
    curl -i https://<URL_PRODUKSI>/api/health/ready
    ```
  - Pastikan mengembalikan HTTP `200 OK`:
    ```json
    {
      "status": "ready",
      "database": "connected",
      "projectId": "...",
      "timestamp": "..."
    }
    ```
  - Jika mengembalikan HTTP `503 Service Unavailable`, periksa izin IAM service account Cloud Run (`roles/datastore.user`) terhadap database Firestore.
