#!/bin/bash
# Menjalankan semua migrasi + skenario uji di Postgres lokal (butuh: postgresql terpasang, dijalankan sebagai root)
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
su postgres -c "psql -q -c 'drop database if exists indotek_test' -c 'create database indotek_test'" 2>&1 | grep -v NOTICE || true
for f in "$ROOT/test/00_supabase_stub.sql" "$ROOT"/supabase/migrations/*.sql; do
  echo "apply $(basename "$f")"
  su postgres -c "psql -q -v ON_ERROR_STOP=1 -d indotek_test -f '$f'" 2>&1 | grep -iv "wal_level\|HINT\|NOTICE" || true
done
su postgres -c "psql -q -d indotek_test -f '$ROOT/test/01_behavior.sql'" 2>&1
