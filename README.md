# Indotek Pro — Paket Migrasi Supabase

Proyek ini menggunakan Supabase sebagai backend tunggal (Postgres + RLS + RPC). Migrasi disimpan di `/supabase/migrations/`.

## Menjalankan Migrasi

```bash
# Gabungkan semua migrasi
npx tsx scripts/combine-migrations.ts

# Jalankan di Supabase lokal (opsional)
supabase db reset
```

Bootstrap Owner pertama (SQL Editor):
```sql
select private.bootstrap_workspace('indotek-jkt','Indotek','email@anda.com');
```

## Environment Variables

Salin `.env.example` ke `.env` dan isi nilai yang sesuai. **Jangan pernah commit file `.env` ke repository.**

Pre-commit hook di `.githooks/pre-commit` melakukan scan otomatis untuk mencegah commit credential/secret.

### Supabase Configuration

| Variable | Keterangan |
|----------|------------|
| `VITE_SUPABASE_URL` | URL Supabase project (client-side) |
| `VITE_SUPABASE_ANON_KEY` | Anon key Supabase (client-side, public) |
| `SUPABASE_URL` | URL Supabase project (server-side) |
| `SUPABASE_ANON_KEY` | Anon key Supabase (server-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key dengan full privileges (server-side, **rahasia**) |

### Server Configuration

| Variable | Keterangan | Default |
|----------|------------|---------|
| `PORT` | Port untuk Express server | `3000` |
| `NODE_ENV` | Environment mode | `development` |

### Upstash Redis (Distributed Rate Limiting)

| Variable | Keterangan |
|----------|------------|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Token autentikasi Upstash Redis (**rahasia**) |

**Catatan:** Jika tidak diset, rate limiter akan di-skip (fail-open). Untuk production, wajib diset.

### Email Service (Resend)

| Variable | Keterangan |
|----------|------------|
| `RESEND_API_KEY` | API key Resend untuk pengiriman email (**rahasia**) |

### Application Settings

| Variable | Keterangan |
|----------|------------|
| `APP_URL` | Base URL aplikasi untuk link undangan dan notifikasi |

## Security Hardening

### Content Security Policy (CSP)

Dikonfigurasi di [`server.ts`](server.ts) dan [`vercel.json`](vercel.json):
- Menghapus `unsafe-eval` untuk mencegah arbitrary code execution
- Mengizinkan koneksi Supabase; development juga mengizinkan WebSocket lokal untuk Vite HMR
- Menjalankan `frame-ancestors 'none'` untuk mencegah clickjacking

### Permissions-Policy

Mengizinkan akses browser features untuk field reports (foto + GPS):
- `camera=(self)` — izin akses kamera untuk foto laporan
- `geolocation=(self)` — izin akses GPS untuk lokasi laporan

### IP Detection & Rate Limiting

- Menggunakan `CF-Connecting-IP` (header authoritative dari Cloudflare/Vercel)
- Fallback tervalidasi ke `X-Forwarded-For` (hanya IP pertama)
- Fallback ke socket address untuk koneksi langsung
- Rate limiting berbasis Upstash Redis untuk distributed, serverless environment (Vercel Functions)

### HTTP Security Headers (Helmet)

- `Strict-Transport-Security` (HSTS): enforce HTTPS selama 1 tahun
- `X-Frame-Options: DENY` — prevent clickjacking
- `X-Content-Type-Options: nosniff` — prevent MIME type sniffing
- `Referrer-Policy: strict-origin-when-cross-origin` — kontrol referrer leakage

### Pre-commit Secret Scanning

`.githooks/pre-commit` menggunakan Gitleaks untuk scan otomatis:
- Deteksi pola JWT token
- Deteksi Supabase API keys
- Deteksi UPSTASH credentials
- Deteksi `.env` files dalam staged changes

Atur hook dengan:
```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit
```

## Workflow Transaksional

Semua alur transaksional telah diporting ke fungsi RPC atomik PostgreSQL/Supabase:
- Purchase Order
- Mutasi Stok
- Kas Kecil
- Revisi Anggaran
- Opname Stok
- Laporan Harian (dengan foto + GPS)
- Milestone Sign-off

Klien tidak boleh menulis langsung ke kolom:
- Kolom uang (hanya via RPC)
- Status workflow (hanya via RPC)
- Nilai turunan (dihitung di DB)

Lihat `/supabase/migrations/` untuk detail schema dan RLS policies.

## Validasi

```bash
npm run lint
npm test
npm run test:sql
```

`npm run test:sql` menjalankan pemeriksaan kontrak/QA berbasis skrip. Pengujian migrasi terhadap PostgreSQL lokal tersedia melalui `test/run.sh` dan memerlukan PostgreSQL lokal.
