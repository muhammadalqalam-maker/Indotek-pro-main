# Indotek Pro — Paket Migrasi Supabase

Isi:
- supabase/migrations/*.sql  -> 4 migrasi berurutan (schema, RLS+grant+storage, workflow RPC, pemeliharaan)
- test/run.sh                -> uji di Postgres lokal (stub Supabase) : 19 skenario RLS / SoD / stok / idempotensi / budget / adjustment / field report / milestone
- test/00_supabase_stub.sql, test/01_behavior.sql

Pakai ke Supabase:  salin folder supabase/migrations ke repo, lalu `npx supabase link --project-ref <REF>` dan `npx supabase db push`.
Bootstrap Owner pertama (SQL Editor):  select private.bootstrap_workspace('indotek-jkt','Indotek','email@anda.com');
Semua alur transaksional (Purchase Order, Mutasi Stok, Kas Kecil, Revisi Anggaran, Opname Stok, Laporan Harian, Milestone Sign-off) telah diporting penuh ke fungsi RPC atomik PostgreSQL/Supabase.

