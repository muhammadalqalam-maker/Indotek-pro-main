# Panduan Deploy Indotek Pro ke Vercel

Dokumen ini menjelaskan langkah-langkah setup dan deployment aplikasi **Indotek Pro** ke **Vercel** (Fullstack Vite React + Express Serverless Functions).

---

## 1. Arsitektur Deployment di Vercel

- **Frontend**: Vite React SPA yang dibuild ke folder `dist/`.
- **Backend**: Express API yang berjalan sebagai Serverless Functions melalui `api/index.ts`.
- **Database & Auth**: Supabase PostgreSQL (Auth, Row Level Security, RPC & Admin Client).
- **Routing**: Dikelola oleh `vercel.json` dengan rewrite:
  - `/api/*` -> Serverless Function `api/index.ts`
  - `/*` -> `dist/index.html` (SPA routing)

---

## 2. File Konfigurasi yang Telah Disiapkan

1. **`vercel.json`**
   ```json
   {
     "version": 2,
     "buildCommand": "npm run build",
     "outputDirectory": "dist",
     "rewrites": [
       { "source": "/api", "destination": "/api" },
       { "source": "/api/(.*)", "destination": "/api" },
       { "source": "/(.*)", "destination": "/index.html" }
     ],
     "headers": [
       {
         "source": "/(.*)",
         "headers": [
           { "key": "X-Content-Type-Options", "value": "nosniff" },
           { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
           { "key": "X-XSS-Protection", "value": "1; mode=block" }
         ]
       }
     ]
   }
   ```

2. **`api/index.ts`**
   Entry point Serverless Function yang membungkus Express app (`src/server/app.ts`).

3. **`src/server/app.ts`**
   Express router dengan dukungan header normalizer untuk Vercel Serverless environment.

---

## 3. Environment Variables yang Wajib Diisi di Vercel

Buka Dashboard Vercel: **Project Settings** > **Environment Variables**, lalu tambahkan:

| Variable Name | Keterangan | Contoh Nilai |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | URL Supabase project (Client) | `https://xxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Public Anon Key Supabase (Client) | `<your_anon_key>` |
| `SUPABASE_URL` | URL Supabase project (Serverless API) | `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Public Anon Key Supabase (Serverless API) | `<your_anon_key>` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role Key (Serverless API - Rahasia) | `<your_service_role_key>` |
| `NODE_ENV` | Environment mode | `production` |

> **PENTING**: Jangan pernah mengekspos `SUPABASE_SERVICE_ROLE_KEY` ke variabel berawalan `VITE_` karena key ini memiliki hak akses admin penuh di database.

---

## 4. Cara Deploy

### Opsi A: Menggunakan Vercel CLI (Terminal)

1. Jalankan perintah deploy:
   ```bash
   npx vercel
   ```
2. Ikuti instruksi login dan pemilihan project:
   - *Set up and deploy?* -> `Y`
   - *Which scope?* -> Pilih akun Vercel Anda
   - *Link to existing project?* -> `N` (atau `Y` jika sudah dibuat)
   - *Project name?* -> `indotek-pro` (atau nama lain)
   - *In which directory is your code located?* -> `./`
   - *Want to modify settings?* -> `N`
3. Untuk deploy langsung ke **Production**:
   ```bash
   npx vercel --prod
   ```

### Opsi B: Menggunakan GitHub / Git Repository (Rekomendasi CI/CD)

1. Push kode ke repository GitHub/GitLab:
   ```bash
   git add .
   git commit -m "Setup Vercel deployment configuration"
   git push origin main
   ```
2. Buka [https://vercel.com/new](https://vercel.com/new).
3. Pilih repository Anda dan klik **Import**.
4. Di bagian **Build and Output Settings**:
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. Masukkan seluruh **Environment Variables** dari Bagian 3 di atas.
6. Klik **Deploy**.

---

## 5. Konfigurasi Domain & OAuth Supabase (Google Login)

Setelah mendapatkan URL deployment Vercel (misal: `https://indotek-pro.vercel.app`):

1. **Supabase Dashboard**:
   - Buka: **Authentication** > **URL Configuration**
   - **Site URL**: `https://indotek-pro.vercel.app`
   - **Redirect URLs**: Tambahkan `https://indotek-pro.vercel.app/**`
2. **Google Cloud Console** (Jika mengaktifkan Google OAuth):
   - Masuk ke **APIs & Services** > **Credentials** > Client ID Web Application Anda.
   - **Authorized JavaScript origins**:
     - `https://indotek-pro.vercel.app`
     - `https://xxxx.supabase.co`
   - **Authorized redirect URIs**:
     - `https://xxxx.supabase.co/auth/v1/callback`

---

## 6. Verifikasi Setelah Deploy

Setelah deploy selesai, Anda dapat memverifikasi endpoints:
- **Frontend SPA**: Buka `https://<domain-vercel>.vercel.app/`
- **Backend Health Check**: Buka `https://<domain-vercel>.vercel.app/api/health`
- **Database Readiness Probe**: Buka `https://<domain-vercel>.vercel.app/api/health/ready`
