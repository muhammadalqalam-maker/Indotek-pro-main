-- =============================================================================
-- Indotek Pro — Migrasi Supabase 4/4: PEMELIHARAAN (opsional, aman dijalankan ulang)
-- Membersihkan idempotency_keys kedaluwarsa tiap jam via pg_cron (aktifkan extension pg_cron di Dashboard > Database > Extensions).
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('indotek-clean-idempotency')
      where exists (select 1 from cron.job where jobname = 'indotek-clean-idempotency');
    perform cron.schedule('indotek-clean-idempotency', '17 * * * *',
      $job$delete from public.idempotency_keys where expires_at < now()$job$);
  else
    raise notice 'pg_cron belum aktif: jadwal pembersihan idempotency_keys dilewati.';
  end if;
end $$;
