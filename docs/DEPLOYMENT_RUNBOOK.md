# INDOTEK PRO — PRODUCTION DEPLOYMENT RUNBOOK & OPERATIONAL GUIDE

## 1. Production Architecture Overview
Indotek Pro adalah aplikasi Enterprise Construction Management SaaS untuk pengendalian kontrak multi-proyek, monitoring progres fisik & S-Curve EVM, kontrol anggaran (RAB/WBS), logistik material/gudang, alur persetujuan pengadaan (PO), dan audit kepatuhan WORM.

- **Frontend**: React 19 + TypeScript + Tailwind CSS (Vite SPA)
- **Backend**: Express `server.ts` (melayani API alur transaksi aman `/api/workflows`, endpoint kesehatan `/api/health` & `/api/health/ready`, serta static bundle `dist/` saat production)
- **Database & Auth**: Google Cloud Firestore (Named Database) + Firebase Authentication & Admin SDK
- **Keamanan Runtime**: HTTP Security Headers (CSP, X-Content-Type-Options, Referrer-Policy, XSS Protection) dan in-memory Rate Limiting pada `/api/workflows`
- **Keamanan Data**: Firestore Security Rules (`firestore.rules` sebagai satu-satunya sumber kebenaran)
- **Target Deployment Tunggal**: Google Cloud Run via AI Studio (**Share > Publish**)

---

## 2. Environment Configuration & Kredensial

### Sumber Konfigurasi Tunggal
Konfigurasi proyek dikelola secara terpusat melalui file `firebase-applet-config.json` di root repository. Nilai environment variables di bawah dapat digunakan sebagai override pada lingkungan container:

| Variable | Deskripsi | Sumber / Pengelola |
| :--- | :--- | :--- |
| `PORT` | Port server HTTP (wajib didukung oleh runtime Express) | Runtime Cloud Run (default: 3000 / 8080) |
| `NODE_ENV` | Mode runtime (`production` atau `development`) | Environment container Cloud Run |
| `GEMINI_API_KEY` | Server-side Gemini API key untuk fitur AI terintegrasi | Secret Manager / AI Studio Environment |
| `FIREBASE_PROJECT_ID` | GCP Project ID hosting Firestore | `firebase-applet-config.json` (`projectId`) |
| `FIRESTORE_DATABASE_ID` | Custom Firestore Named Database ID | `firebase-applet-config.json` (`firestoreDatabaseId`) |

### Kredensial Bebas Secret File (Application Default Credentials / ADC)
- **Zero Key File in Repository**: Repository ini tidak boleh dan tidak menyimpan file service account key JSON (`serviceAccountKey.json`, dll).
- **Cloud Run Application Default Credentials (ADC)**:
  Backend Express (`server.ts` dan `src/server/firebaseAdmin.ts`) menggunakan `initializeApp({ projectId })` yang secara otomatis mengonsumsi kredensial bawaan lingkungan eksekusi Cloud Run via metadata server internal Google Cloud (`http://metadata.google.internal`).
- **Pemeriksaan Akses Service Account Runtime Pasca-Publish**:
  Setelah service di-publish ke Cloud Run:
  1. Identifikasi service account runtime yang terpasang pada service Cloud Run:
     ```bash
     gcloud run services describe <SERVICE_NAME> \
       --region=<REGION> \
       --format='value(spec.template.spec.serviceAccountName)'
     ```
     *(Default service account biasanya berupa `<PROJECT_NUMBER>-compute@developer.gserviceaccount.com` atau custom Cloud Run runtime service account).*
  2. Periksa apakah service account tersebut memiliki role IAM yang cukup untuk mengakses Firestore:
     ```bash
     gcloud projects get-iam-policy <PROJECT_ID> \
       --flatten="bindings[].members" \
       --format="table(bindings.role)" \
       --filter="bindings.members:<SERVICE_ACCOUNT_EMAIL>"
     ```
     *Role yang dibutuhkan*: `roles/datastore.user` (Cloud Datastore User) atau Firebase Admin SDK Service Agent.
  3. Validasi instan melalui endpoint readiness probe: panggil `GET https://<CLOUD_RUN_URL>/api/health/ready`. Jika respons mengembalikan HTTP 200 dengan `{"status":"ready","database":"connected"}`, maka ADC runtime terbukti berhasil membaca Firestore.

---

## 3. Alur Deployment Tunggal: Share > Publish ke Cloud Run

> **ATURAN MUTLAK PLATFORM**:
> 1. Aplikasi ini di-deploy **HANYA melalui menu Share > Publish ke Cloud Run**.
> 2. **Dilarang keras** menggunakan Firebase Hosting atau menjalankan perintah `firebase deploy --only hosting`. Seluruh static bundle dilayani langsung oleh Express `server.ts` dari folder `dist/` saat `NODE_ENV=production`.
> 3. Server Express otomatis membaca `PORT` dari env, melakukan binding ke `0.0.0.0`, melayani rute API `/api/*` terlebih dahulu, lalu meneruskan request lainnya ke SPA fallback `dist/index.html`.
> 4. `package.json` menyertakan skrip `"prestart": "npm run build"` sehingga setiap eksekusi `npm start` selalu mendahuluinya dengan build aset produksi, dan paket `tsx` terdaftar di runtime dependencies.

### Langkah 1: Verifikasi Pra-Rilis Lokal / CI
Sebelum melakukan publish, pastikan seluruh gate kualitas lulus:
```bash
# 1. Typecheck & linting
npm run lint

# 2. Rangkaian uji otomatis (unit, rules emulator simulation, & backend workflows)
npm test

# 3. Pengujian build produksi frontend
npm run build
```

### Langkah 2: Deployment Security Rules
File `firestore.rules` di root direktori adalah satu-satunya sumber kebenaran aturan keamanan Firestore.
Setiap perubahan rules diterapkan langsung ke proyek Firebase menggunakan integrasi resmi platform AI Studio (`DeployRules`). Jangan pernah mengubah rules manual di Firebase Console karena akan tertimpa pada rilis berikutnya.

### Langkah 3: Publish ke Cloud Run
1. Klik tombol **Share** di pojok kanan atas AI Studio.
2. Pilih opsi **Publish** ke Cloud Run.
3. AI Studio memicu pembuatan container image, mengompilasi aplikasi, dan meluncurkan revisi baru pada Cloud Run.

---

## 4. Checklist Pasca-Publish (Wajib Dilakukan)

Setelah proses publish di AI Studio selesai, lakukan verifikasi operasional dengan checklist berikut:

- [ ] **1. Verifikasi Liveness & Readiness Endpoint**:
  - Panggil `GET https://<APP_URL>/api/health`: pastikan status HTTP 200 dengan payload `{"status":"ok", ...}`.
  - Panggil `GET https://<APP_URL>/api/health/ready`: pastikan status HTTP 200 dengan payload `{"status":"ready","database":"connected"}`. Jika mengembalikan HTTP 503, periksa izin IAM service account runtime terhadap database Firestore.
  - *Catatan*: Frontend tidak melakukan polling otomatis terhadap endpoint health untuk menghemat kuota operasional.

- [ ] **2. Uji Satu Alur Transaksi Nyata (Workflow Engine End-to-End)**:
  - Buka aplikasi di browser melalui URL Cloud Run yang baru di-publish.
  - Login dengan akun pengguna aktif yang terdaftar di workspace.
  - Lakukan satu transaksi nyata pada sistem, misalnya:
    * Membuat draft Purchase Order baru pada modul Pengadaan, atau
    * Mencatat mutasi stok masuk material pada modul Gudang/Logistik.
  - Pastikan transaksi berhasil tersimpan, nomor dokumen otomatis terbentuk secara sekuensial, dan entri tercatat pada `/audit_logs`.

- [ ] **3. Periksa Log Runtime Cloud Run**:
  - Buka Google Cloud Console > **Cloud Run** > pilih service aplikasi Indotek Pro.
  - Masuk ke tab **Logs** (atau Cloud Logging Explorer).
  - Pastikan log inisialisasi server mencetak:
    `[Indotek Pro] Trusted Server active on port <PORT> (mode: production)`
  - Pastikan tidak ada pesan error terkait:
    * `Failed to start server`
    * Kredensial ADC (`Could not load the default credentials`)
    * Unhandled promise rejections atau middleware routing errors.

- [ ] **4. Monitoring Batas Starter Tier (Quota Awareness)**:
  - Lingkungan AI Studio / Cloud Run Starter Tier memiliki batasan **maksimal 2 active services** per project.
  - Pastikan tidak ada service zombie/tidak terpakai yang masih aktif. Hapus service lama jika mendekati batas kuota.
  - Pastikan service dikonfigurasi dengan autoscaling min-instances=0 (scale-to-zero) untuk menghindari konsumsi kuota yang tidak perlu saat idle.

---

## 5. Prosedur Rollback

Jika terjadi masalah kritis pasca-publish:
1. Buka Google Cloud Console > Cloud Run > pilih service Indotek Pro.
2. Masuk ke tab **Revisions**.
3. Pilih revisi produksi yang stabil sebelumnya.
4. Klik **Manage Traffic**, lalu alihkan traffic 100% ke revisi tersebut.
5. Jika rollback melibatkan `firestore.rules`:
   ```bash
   git revert <COMMIT_HASH> --no-edit
   ```
   Lalu deploy ulang rules melalui integrasi platform AI Studio.

---

## 6. Backup & Disaster Recovery (DR)

> ⚠️ **PERSYARATAN BILLING / BLAZE PLAN**:
> Operasi pencadangan otomatis (`firestore backups schedules`) dan ekspor Firestore (`firestore export`) ke Google Cloud Storage **memerlukan Google Cloud Billing aktif (Firebase Blaze Plan)** serta izin Cloud Storage bucket.
> Proyek yang masih berada pada kuota gratis (Spark Plan) tidak dapat menjalankan operasi ekspor managed ini.

### Variabel Konfigurasi Backup
Eksekusi perintah berikut menggunakan variabel lingkungan dari `firebase-applet-config.json` tanpa hardcoding:

```bash
# Baca konfigurasi dinamis dari firebase-applet-config.json
export PROJECT_ID=$(node -p "require('./firebase-applet-config.json').projectId")
export DATABASE_ID=$(node -p "require('./firebase-applet-config.json').firestoreDatabaseId || '(default)'")
export BACKUP_BUCKET="gs://${PROJECT_ID}-firestore-backups"
```

### Firestore Automated Scheduled Backups (Wajib Blaze Plan)
Untuk mengaktifkan jadwal pencadangan otomatis Google Cloud Firestore (retensi 30 hari):
```bash
gcloud firestore backups schedules create \
    --project="${PROJECT_ID}" \
    --database="${DATABASE_ID}" \
    --retention=30d \
    --recurrence=daily
```

### Ekspor Data Manual ke Google Cloud Storage (Wajib Blaze Plan)
Untuk mengekspor seluruh koleksi database ke GCS bucket:
```bash
# Pastikan bucket Cloud Storage telah dibuat terlebih dahulu:
gcloud storage buckets create "${BACKUP_BUCKET}" --project="${PROJECT_ID}" --location=asia-southeast1

# Jalankan proses ekspor Firestore
gcloud firestore export "${BACKUP_BUCKET}/$(date +%Y%m%d_%H%M%S)" \
    --project="${PROJECT_ID}" \
    --database="${DATABASE_ID}"
```

### Alternatif Backup Non-Blaze (Level Aplikasi / In-Memory JSON Export)
Untuk lingkungan pengembangan atau akun Spark tanpa Blaze Plan, backup data koleksi dapat diekspor melalui script utilitas Node.js lokal menggunakan Firebase Admin SDK dengan otentikasi ADC atau script kueri koleksi JSON.

---

## 7. Operasional Keamanan & Tata Kelola
- **Append-only WORM Logs**: Koleksi `/audit_logs` menerapkan aturan mutlak `allow update, delete: if false;` di `firestore.rules`. Dokumen audit tidak dapat diubah atau dihapus oleh siapapun.
- **Pemisahan Wewenang (Segregation of Duties)**: Pengadaan/Logistik dapat membuat draft Purchase Order dan revisi anggaran, tetapi persetujuan resmi (approval) mewajibkan peran Project Manager atau Owner/Director.
- **Rate Limiting**: Endpoint `/api/workflows` dibatasi maksimal 120 permintaan per menit per IP untuk melindungi integritas transaksi database.
