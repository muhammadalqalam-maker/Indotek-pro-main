-- =============================================================================
-- Indotek Pro — Migrasi Supabase 9: KATALOG HARGA DASAR (RESOURCE PRICES)
-- Modul: RAB / AHSP Tahap A
-- Prinsip: Multi-tenant (workspace_id), RLS ketat (baca: member, tulis: RPC security definer),
-- Uang: bigint Rupiah, Audit trail lengkap, Batch import CSV/XLSX.
-- =============================================================================

-- 1. ENUM / Check untuk Jenis Sumber Daya
do $$
begin
  if not exists (select 1 from pg_type where typname = 'resource_type') then
    create type public.resource_type as enum ('Bahan', 'Upah', 'Alat', 'Subkon');
  end if;
end $$;

-- 2. TABEL: resource_prices
create table if not exists public.resource_prices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  jenis public.resource_type not null default 'Bahan',
  kode text not null,
  uraian text not null,
  satuan text not null,
  harga bigint not null check (harga >= 0),
  wilayah text not null default '',
  berlaku_mulai date not null default current_date,
  berlaku_sampai date null,
  spesifikasi text null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint uq_resource_price_unique unique (workspace_id, kode, wilayah, berlaku_mulai)
);

create index if not exists idx_resource_prices_ws_jenis on public.resource_prices (workspace_id, jenis);
create index if not exists idx_resource_prices_ws_kode on public.resource_prices (workspace_id, kode);
create index if not exists idx_resource_prices_ws_uraian on public.resource_prices (workspace_id, uraian text_pattern_ops);

-- 3. RLS: Row Level Security
alter table public.resource_prices enable row level security;

-- Member aktif workspace dapat membaca seluruh katalog harga dasar perusahaan
drop policy if exists resource_prices_read on public.resource_prices;
create policy resource_prices_read on public.resource_prices
  for select using (private.is_member(workspace_id));

-- Klien DILARANG menulis langsung ke resource_prices untuk menjamin audit & integritas nominal harga
drop policy if exists resource_prices_write on public.resource_prices;
create policy resource_prices_write on public.resource_prices
  for all using (false) with check (false);

-- 4. RPC: upsert_resource_price
create or replace function public.upsert_resource_price(
  p_workspace_id uuid,
  p_jenis text,
  p_kode text,
  p_uraian text,
  p_satuan text,
  p_harga bigint,
  p_wilayah text default '',
  p_berlaku_mulai date default current_date,
  p_berlaku_sampai date default null,
  p_spesifikasi text default null,
  p_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
  v_jenis public.resource_type;
  v_id uuid;
  v_old_harga bigint;
  v_action text;
  v_res record;
begin
  select * into a from private.require_actor(p_workspace_id);

  -- Hak akses: Estimator, Site Engineer, Project Manager, Finance, Owner
  if a.actor_role not in ('owner', 'finance', 'project_manager', 'site_engineer') then
    raise exception 'Peran "%" tidak memiliki hak mengubah katalog harga dasar.', a.actor_role using errcode = '42501';
  end if;

  -- Validasi input
  if coalesce(trim(p_kode), '') = '' then
    raise exception 'Kode sumber daya wajib diisi.' using errcode = '22023';
  end if;
  if coalesce(trim(p_uraian), '') = '' then
    raise exception 'Uraian sumber daya wajib diisi.' using errcode = '22023';
  end if;
  if coalesce(trim(p_satuan), '') = '' then
    raise exception 'Satuan wajib diisi.' using errcode = '22023';
  end if;
  if coalesce(p_harga, -1) < 0 then
    raise exception 'Harga satuan dasar tidak boleh negatif.' using errcode = '22023';
  end if;

  begin
    v_jenis := p_jenis::public.resource_type;
  exception when others then
    raise exception 'Jenis sumber daya tidak valid ("%"). Harus: Bahan, Upah, Alat, atau Subkon.', p_jenis using errcode = '22023';
  end;

  -- Cek apakah pembaruan baris eksisting berdasarkan ID atau Unique Constraint
  if p_id is not null then
    select id, harga into v_res
    from public.resource_prices
    where id = p_id and workspace_id = p_workspace_id;

    if not found then
      raise exception 'Item harga dasar dengan ID % tidak ditemukan.', p_id using errcode = 'P0002';
    end if;

    v_old_harga := v_res.harga;
    v_id := v_res.id;
    v_action := 'UPDATE_RESOURCE_PRICE';

    update public.resource_prices
    set jenis = v_jenis,
        kode = trim(p_kode),
        uraian = trim(p_uraian),
        satuan = trim(p_satuan),
        harga = p_harga,
        wilayah = coalesce(trim(p_wilayah), ''),
        berlaku_mulai = coalesce(p_berlaku_mulai, current_date),
        berlaku_sampai = p_berlaku_sampai,
        spesifikasi = nullif(trim(p_spesifikasi), ''),
        updated_at = clock_timestamp()
    where id = v_id;
  else
    -- Cek jika ada baris dengan (workspace_id, kode, wilayah, berlaku_mulai)
    select id, harga into v_res
    from public.resource_prices
    where workspace_id = p_workspace_id
      and kode = trim(p_kode)
      and wilayah = coalesce(trim(p_wilayah), '')
      and berlaku_mulai = coalesce(p_berlaku_mulai, current_date);

    if found then
      v_old_harga := v_res.harga;
      v_id := v_res.id;
      v_action := 'UPDATE_RESOURCE_PRICE';

      update public.resource_prices
      set jenis = v_jenis,
          uraian = trim(p_uraian),
          satuan = trim(p_satuan),
          harga = p_harga,
          berlaku_sampai = p_berlaku_sampai,
          spesifikasi = nullif(trim(p_spesifikasi), ''),
          updated_at = clock_timestamp()
      where id = v_id;
    else
      v_id := gen_random_uuid();
      v_old_harga := null;
      v_action := 'CREATE_RESOURCE_PRICE';

      insert into public.resource_prices (
        id, workspace_id, jenis, kode, uraian, satuan, harga, wilayah,
        berlaku_mulai, berlaku_sampai, spesifikasi, created_at, updated_at
      ) values (
        v_id, p_workspace_id, v_jenis, trim(p_kode), trim(p_uraian), trim(p_satuan),
        p_harga, coalesce(trim(p_wilayah), ''), coalesce(p_berlaku_mulai, current_date),
        p_berlaku_sampai, nullif(trim(p_spesifikasi), ''), clock_timestamp(), clock_timestamp()
      );
    end if;
  end if;

  -- Audit log pencatatan harga
  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    v_action, 'resource_price', v_id, null,
    format('%s: %s [%s] @ Rp %s/%s (%s)',
      case when v_action = 'CREATE_RESOURCE_PRICE' then 'Tambah harga dasar' else 'Ubah harga dasar' end,
      trim(p_uraian), trim(p_kode), p_harga, trim(p_satuan), coalesce(trim(p_wilayah), 'Umum')),
    case when v_old_harga is not null then v_old_harga::text else '' end,
    p_harga::text,
    jsonb_build_object('jenis', v_jenis, 'kode', trim(p_kode), 'satuan', trim(p_satuan), 'wilayah', trim(p_wilayah))
  );

  return jsonb_build_object(
    'success', true,
    'id', v_id,
    'action', v_action,
    'message', format('Harga dasar "%s" berhasil disimpan (Rp %s/%s).', trim(p_uraian), p_harga, trim(p_satuan))
  );
end;
$$;

grant execute on function public.upsert_resource_price(uuid, text, text, text, text, bigint, text, date, date, text, uuid) to authenticated;

-- 5. RPC: delete_resource_price
create or replace function public.delete_resource_price(
  p_workspace_id uuid,
  p_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
  v_item record;
begin
  select * into a from private.require_actor(p_workspace_id);

  if a.actor_role not in ('owner', 'finance', 'project_manager') then
    raise exception 'Peran "%" tidak berhak menghapus katalog harga dasar.', a.actor_role using errcode = '42501';
  end if;

  select * into v_item
  from public.resource_prices
  where id = p_id and workspace_id = p_workspace_id;

  if not found then
    raise exception 'Item harga dasar tidak ditemukan.' using errcode = 'P0002';
  end if;

  delete from public.resource_prices where id = p_id;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    'DELETE_RESOURCE_PRICE', 'resource_price', p_id, null,
    format('Hapus harga dasar: %s [%s] @ Rp %s', v_item.uraian, v_item.kode, v_item.harga),
    v_item.harga::text, '',
    jsonb_build_object('jenis', v_item.jenis, 'kode', v_item.kode, 'wilayah', v_item.wilayah)
  );

  return jsonb_build_object('success', true, 'message', format('Item harga dasar "%s" berhasil dihapus.', v_item.uraian));
end;
$$;

grant execute on function public.delete_resource_price(uuid, uuid) to authenticated;

-- 6. RPC: import_resource_prices_batch
create or replace function public.import_resource_prices_batch(
  p_workspace_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
  v_elem jsonb;
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_total int := 0;
  v_kode text;
  v_uraian text;
  v_satuan text;
  v_jenis_str text;
  v_jenis public.resource_type;
  v_harga bigint;
  v_wilayah text;
  v_berlaku_mulai date;
  v_spesifikasi text;
  v_existing_id uuid;
begin
  select * into a from private.require_actor(p_workspace_id);

  if a.actor_role not in ('owner', 'finance', 'project_manager', 'site_engineer') then
    raise exception 'Peran "%" tidak berhak mengimpor katalog harga dasar.', a.actor_role using errcode = '42501';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Data impor kosong atau bukan array json valid.' using errcode = '22023';
  end if;

  for v_elem in select * from jsonb_array_elements(p_rows) loop
    v_total := v_total + 1;
    v_kode := coalesce(trim((v_elem->>'kode')), '');
    v_uraian := coalesce(trim((v_elem->>'uraian')), '');
    v_satuan := coalesce(trim((v_elem->>'satuan')), '');
    v_jenis_str := coalesce(trim((v_elem->>'jenis')), 'Bahan');
    v_wilayah := coalesce(trim((v_elem->>'wilayah')), '');
    v_spesifikasi := nullif(trim((v_elem->>'spesifikasi')), '');

    -- Sanitasi tanggal
    begin
      v_berlaku_mulai := coalesce((v_elem->>'berlaku_mulai')::date, current_date);
    exception when others then
      v_berlaku_mulai := current_date;
    end;

    -- Validasi nominal harga
    begin
      v_harga := round(coalesce((v_elem->>'harga')::numeric, 0))::bigint;
    exception when others then
      v_harga := 0;
    end;

    -- Validasi jenis
    begin
      v_jenis := v_jenis_str::public.resource_type;
    exception when others then
      -- Default ke Bahan jika tidak cocok
      v_jenis := 'Bahan'::public.resource_type;
    end;

    -- Abaikan baris tanpa kode/uraian dasar
    if v_kode = '' or v_uraian = '' or v_satuan = '' or v_harga < 0 then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    select id into v_existing_id
    from public.resource_prices
    where workspace_id = p_workspace_id
      and kode = v_kode
      and wilayah = v_wilayah
      and berlaku_mulai = v_berlaku_mulai;

    if found then
      update public.resource_prices
      set jenis = v_jenis,
          uraian = v_uraian,
          satuan = v_satuan,
          harga = v_harga,
          spesifikasi = coalesce(v_spesifikasi, spesifikasi),
          updated_at = clock_timestamp()
      where id = v_existing_id;

      v_updated := v_updated + 1;
    else
      insert into public.resource_prices (
        id, workspace_id, jenis, kode, uraian, satuan, harga, wilayah,
        berlaku_mulai, spesifikasi, created_at, updated_at
      ) values (
        gen_random_uuid(), p_workspace_id, v_jenis, v_kode, v_uraian, v_satuan,
        v_harga, v_wilayah, v_berlaku_mulai, v_spesifikasi, clock_timestamp(), clock_timestamp()
      );

      v_inserted := v_inserted + 1;
    end if;
  end loop;

  -- Audit log batch import
  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    'IMPORT_RESOURCE_PRICES', 'resource_prices', p_workspace_id, null,
    format('Impor katalog harga dasar: %s total, %s baru, %s diperbarui, %s dilewati',
      v_total, v_inserted, v_updated, v_skipped),
    '', format('inserted:%s,updated:%s,skipped:%s', v_inserted, v_updated, v_skipped),
    jsonb_build_object('total', v_total, 'inserted', v_inserted, 'updated', v_updated, 'skipped', v_skipped)
  );

  return jsonb_build_object(
    'success', true,
    'total', v_total,
    'inserted', v_inserted,
    'updated', v_updated,
    'skipped', v_skipped,
    'message', format('Impor berhasil: %s baru ditambahkan, %s diperbarui, %s dilewati dari total %s baris.',
      v_inserted, v_updated, v_skipped, v_total)
  );
end;
$$;

grant execute on function public.import_resource_prices_batch(uuid, jsonb) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Assertions (Verifikasi Migrasi 0009)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  assert exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'resource_prices'
  ), 'Tabel resource_prices tidak ditemukan';

  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'upsert_resource_price'
  ), 'RPC upsert_resource_price tidak ditemukan';

  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'import_resource_prices_batch'
  ), 'RPC import_resource_prices_batch tidak ditemukan';

  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'delete_resource_price'
  ), 'RPC delete_resource_price tidak ditemukan';

  raise notice 'Migration 0009 (resource_prices) assertions lulus.';
end;
$$;
