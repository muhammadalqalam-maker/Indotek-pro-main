-- =============================================================================
-- Indotek Pro — Migrasi Supabase 10: ANALISIS HARGA SATUAN PEKERJAAN (AHSP)
-- Modul: RAB / AHSP Tahap B (Permen PUPR No. 8 Tahun 2023)
-- Prinsip: Multi-tenant (workspace_id), RLS ketat, RPC Security Definer,
-- Uang: Bigint Rupiah, Koefisien: Numeric(12,6), Audit trail lengkap.
-- =============================================================================

-- 1. TABEL: ahsp_templates
create table if not exists public.ahsp_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kode text not null,
  nama text not null,
  satuan text not null,
  kategori text not null default 'Umum',
  overhead_profit_pct numeric(5,2) not null default 10.00 check (overhead_profit_pct >= 0 and overhead_profit_pct <= 100),
  dasar_hukum text not null default 'Permen PUPR No. 8 Tahun 2023',
  keterangan text null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint uq_ahsp_template_kode unique (workspace_id, kode)
);

create index if not exists idx_ahsp_templates_ws_kategori on public.ahsp_templates (workspace_id, kategori);
create index if not exists idx_ahsp_templates_ws_kode on public.ahsp_templates (workspace_id, kode);
create index if not exists idx_ahsp_templates_ws_nama on public.ahsp_templates (workspace_id, nama text_pattern_ops);

-- 2. TABEL: ahsp_components
create table if not exists public.ahsp_components (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  template_id uuid not null references public.ahsp_templates(id) on delete cascade,
  resource_id uuid null references public.resource_prices(id) on delete set null,
  jenis text not null check (jenis in ('Tenaga', 'Bahan', 'Alat', 'Subkon')),
  kode_sumber_daya text not null,
  uraian text not null,
  satuan text not null,
  koefisien numeric(12,6) not null check (koefisien > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_ahsp_components_template on public.ahsp_components (template_id);
create index if not exists idx_ahsp_components_ws on public.ahsp_components (workspace_id);
create index if not exists idx_ahsp_components_resource on public.ahsp_components (resource_id);

-- 3. RLS: Row Level Security
alter table public.ahsp_templates enable row level security;
alter table public.ahsp_components enable row level security;

-- Baca: Anggota workspace aktif
drop policy if exists ahsp_templates_read on public.ahsp_templates;
create policy ahsp_templates_read on public.ahsp_templates
  for select using (private.is_member(workspace_id));

drop policy if exists ahsp_components_read on public.ahsp_components;
create policy ahsp_components_read on public.ahsp_components
  for select using (private.is_member(workspace_id));

-- Tulis: Blokir akses tulis langsung dari klien
drop policy if exists ahsp_templates_write on public.ahsp_templates;
create policy ahsp_templates_write on public.ahsp_templates
  for all using (false) with check (false);

drop policy if exists ahsp_components_write on public.ahsp_components;
create policy ahsp_components_write on public.ahsp_components
  for all using (false) with check (false);


-- 4. RPC: upsert_ahsp_template
create or replace function public.upsert_ahsp_template(
  p_workspace_id uuid,
  p_kode text,
  p_nama text,
  p_satuan text,
  p_kategori text default 'Umum',
  p_overhead_profit_pct numeric default 10.00,
  p_keterangan text default null,
  p_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
  v_id uuid;
  v_action text;
  v_res record;
begin
  select * into a from private.require_actor(p_workspace_id);

  if a.actor_role not in ('owner', 'finance', 'project_manager', 'site_engineer') then
    raise exception 'Peran "%" tidak berhak mengubah template AHSP.', a.actor_role using errcode = '42501';
  end if;

  if coalesce(trim(p_kode), '') = '' then
    raise exception 'Kode AHSP wajib diisi.' using errcode = '22023';
  end if;
  if coalesce(trim(p_nama), '') = '' then
    raise exception 'Nama pekerjaan AHSP wajib diisi.' using errcode = '22023';
  end if;
  if coalesce(trim(p_satuan), '') = '' then
    raise exception 'Satuan pekerjaan wajib diisi.' using errcode = '22023';
  end if;
  if coalesce(p_overhead_profit_pct, -1) < 0 or p_overhead_profit_pct > 100 then
    raise exception 'Persentase Overhead & Profit harus antara 0%% dan 100%%.' using errcode = '22023';
  end if;

  if p_id is not null then
    select id into v_res
    from public.ahsp_templates
    where id = p_id and workspace_id = p_workspace_id;

    if not found then
      raise exception 'Template AHSP tidak ditemukan.' using errcode = 'P0002';
    end if;

    v_id := p_id;
    v_action := 'UPDATE_AHSP_TEMPLATE';

    update public.ahsp_templates
    set kode = trim(p_kode),
        nama = trim(p_nama),
        satuan = trim(p_satuan),
        kategori = coalesce(nullif(trim(p_kategori), ''), 'Umum'),
        overhead_profit_pct = p_overhead_profit_pct,
        keterangan = nullif(trim(p_keterangan), ''),
        updated_at = clock_timestamp()
    where id = v_id;
  else
    select id into v_res
    from public.ahsp_templates
    where workspace_id = p_workspace_id and kode = trim(p_kode);

    if found then
      v_id := v_res.id;
      v_action := 'UPDATE_AHSP_TEMPLATE';

      update public.ahsp_templates
      set nama = trim(p_nama),
          satuan = trim(p_satuan),
          kategori = coalesce(nullif(trim(p_kategori), ''), 'Umum'),
          overhead_profit_pct = p_overhead_profit_pct,
          keterangan = nullif(trim(p_keterangan), ''),
          updated_at = clock_timestamp()
      where id = v_id;
    else
      v_id := gen_random_uuid();
      v_action := 'CREATE_AHSP_TEMPLATE';

      insert into public.ahsp_templates (
        id, workspace_id, kode, nama, satuan, kategori, overhead_profit_pct,
        dasar_hukum, keterangan, created_at, updated_at
      ) values (
        v_id, p_workspace_id, trim(p_kode), trim(p_nama), trim(p_satuan),
        coalesce(nullif(trim(p_kategori), ''), 'Umum'), p_overhead_profit_pct,
        'Permen PUPR No. 8 Tahun 2023', nullif(trim(p_keterangan), ''),
        clock_timestamp(), clock_timestamp()
      );
    end if;
  end if;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    v_action, 'ahsp_template', v_id, null,
    format('%s: %s [%s] (Overhead %s%%)',
      case when v_action = 'CREATE_AHSP_TEMPLATE' then 'Tambah template AHSP' else 'Ubah template AHSP' end,
      trim(p_nama), trim(p_kode), p_overhead_profit_pct),
    '', p_overhead_profit_pct::text,
    jsonb_build_object('kode', trim(p_kode), 'satuan', trim(p_satuan), 'kategori', p_kategori)
  );

  return jsonb_build_object('success', true, 'id', v_id, 'action', v_action,
    'message', format('Template AHSP "%s" berhasil disimpan.', trim(p_nama)));
end;
$$;

grant execute on function public.upsert_ahsp_template(uuid, text, text, text, text, numeric, text, uuid) to authenticated;


-- 5. RPC: delete_ahsp_template
create or replace function public.delete_ahsp_template(
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
  v_tpl record;
begin
  select * into a from private.require_actor(p_workspace_id);

  if a.actor_role not in ('owner', 'finance', 'project_manager') then
    raise exception 'Peran "%" tidak berhak menghapus template AHSP.', a.actor_role using errcode = '42501';
  end if;

  select * into v_tpl
  from public.ahsp_templates
  where id = p_id and workspace_id = p_workspace_id;

  if not found then
    raise exception 'Template AHSP tidak ditemukan.' using errcode = 'P0002';
  end if;

  delete from public.ahsp_templates where id = p_id;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    'DELETE_AHSP_TEMPLATE', 'ahsp_template', p_id, null,
    format('Hapus template AHSP: %s [%s]', v_tpl.nama, v_tpl.kode),
    v_tpl.kode, '', jsonb_build_object('nama', v_tpl.nama)
  );

  return jsonb_build_object('success', true, 'message', format('Template AHSP "%s" berhasil dihapus.', v_tpl.nama));
end;
$$;

grant execute on function public.delete_ahsp_template(uuid, uuid) to authenticated;


-- 6. RPC: upsert_ahsp_component
create or replace function public.upsert_ahsp_component(
  p_workspace_id uuid,
  p_template_id uuid,
  p_jenis text,
  p_kode_sumber_daya text,
  p_uraian text,
  p_satuan text,
  p_koefisien numeric,
  p_resource_id uuid default null,
  p_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
  v_id uuid;
  v_action text;
  v_tpl record;
begin
  select * into a from private.require_actor(p_workspace_id);

  if a.actor_role not in ('owner', 'finance', 'project_manager', 'site_engineer') then
    raise exception 'Peran "%" tidak berhak mengubah komponen AHSP.', a.actor_role using errcode = '42501';
  end if;

  select * into v_tpl
  from public.ahsp_templates
  where id = p_template_id and workspace_id = p_workspace_id;

  if not found then
    raise exception 'Template AHSP induk tidak ditemukan.' using errcode = 'P0002';
  end if;

  if p_jenis not in ('Tenaga', 'Bahan', 'Alat', 'Subkon') then
    raise exception 'Jenis komponen tidak valid ("%"). Harus: Tenaga, Bahan, Alat, atau Subkon.', p_jenis using errcode = '22023';
  end if;

  if coalesce(p_koefisien, 0) <= 0 then
    raise exception 'Koefisien harus lebih besar dari 0.' using errcode = '22023';
  end if;

  if p_id is not null then
    v_id := p_id;
    v_action := 'UPDATE_AHSP_COMPONENT';

    update public.ahsp_components
    set jenis = p_jenis,
        kode_sumber_daya = trim(p_kode_sumber_daya),
        uraian = trim(p_uraian),
        satuan = trim(p_satuan),
        koefisien = p_koefisien,
        resource_id = p_resource_id,
        updated_at = clock_timestamp()
    where id = v_id and workspace_id = p_workspace_id and template_id = p_template_id;
  else
    v_id := gen_random_uuid();
    v_action := 'CREATE_AHSP_COMPONENT';

    insert into public.ahsp_components (
      id, workspace_id, template_id, resource_id, jenis, kode_sumber_daya,
      uraian, satuan, koefisien, created_at, updated_at
    ) values (
      v_id, p_workspace_id, p_template_id, p_resource_id, p_jenis, trim(p_kode_sumber_daya),
      trim(p_uraian), trim(p_satuan), p_koefisien, clock_timestamp(), clock_timestamp()
    );
  end if;

  return jsonb_build_object('success', true, 'id', v_id, 'action', v_action,
    'message', format('Komponen "%s" (koef: %s) berhasil disimpan.', trim(p_uraian), p_koefisien));
end;
$$;

grant execute on function public.upsert_ahsp_component(uuid, uuid, text, text, text, text, numeric, uuid, uuid) to authenticated;


-- 7. RPC: delete_ahsp_component
create or replace function public.delete_ahsp_component(
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
begin
  select * into a from private.require_actor(p_workspace_id);

  if a.actor_role not in ('owner', 'finance', 'project_manager', 'site_engineer') then
    raise exception 'Peran "%" tidak berhak menghapus komponen AHSP.', a.actor_role using errcode = '42501';
  end if;

  delete from public.ahsp_components
  where id = p_id and workspace_id = p_workspace_id;

  if not found then
    raise exception 'Komponen AHSP tidak ditemukan.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('success', true, 'message', 'Komponen AHSP berhasil dihapus.');
end;
$$;

grant execute on function public.delete_ahsp_component(uuid, uuid) to authenticated;


-- 8. RPC: calculate_ahsp_unit_price
-- Menghitung rincian harga satuan komponen dan total harga satuan pekerjaan
create or replace function public.calculate_ahsp_unit_price(
  p_workspace_id uuid,
  p_template_id uuid,
  p_wilayah text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tpl record;
  v_comp record;
  v_harga bigint;
  v_subtotal_komp numeric;
  v_tenaga bigint := 0;
  v_bahan bigint := 0;
  v_alat bigint := 0;
  v_subkon bigint := 0;
  v_biaya_langsung bigint := 0;
  v_overhead_amount bigint := 0;
  v_total_harga_satuan bigint := 0;
  v_components_detail jsonb := '[]'::jsonb;
begin
  select * into v_tpl
  from public.ahsp_templates
  where id = p_template_id and workspace_id = p_workspace_id;

  if not found then
    raise exception 'Template AHSP tidak ditemukan.' using errcode = 'P0002';
  end if;

  for v_comp in
    select c.*,
           rp.harga as rp_harga,
           rp.id as matched_rp_id,
           rp.uraian as matched_rp_uraian
    from public.ahsp_components c
    left join lateral (
      select r.id, r.harga, r.uraian
      from public.resource_prices r
      where r.workspace_id = p_workspace_id
        and (
          (c.resource_id is not null and r.id = c.resource_id)
          or (r.kode = c.kode_sumber_daya)
          or (r.uraian ilike c.uraian)
        )
        and (coalesce(trim(p_wilayah), '') = '' or r.wilayah = trim(p_wilayah) or r.wilayah = '' or r.wilayah = 'Umum')
      order by
        case when c.resource_id is not null and r.id = c.resource_id then 1 else 2 end,
        case when r.wilayah = trim(p_wilayah) then 1 else 2 end,
        r.berlaku_mulai desc
      limit 1
    ) rp on true
    where c.template_id = p_template_id
    order by
      case c.jenis when 'Tenaga' then 1 when 'Bahan' then 2 when 'Alat' then 3 else 4 end,
      c.kode_sumber_daya
  loop
    v_harga := coalesce(v_comp.rp_harga, 0);
    v_subtotal_komp := round(v_comp.koefisien * v_harga);

    if v_comp.jenis = 'Tenaga' then
      v_tenaga := v_tenaga + v_subtotal_komp::bigint;
    elsif v_comp.jenis = 'Bahan' then
      v_bahan := v_bahan + v_subtotal_komp::bigint;
    elsif v_comp.jenis = 'Alat' then
      v_alat := v_alat + v_subtotal_komp::bigint;
    else
      v_subkon := v_subkon + v_subtotal_komp::bigint;
    end if;

    v_components_detail := v_components_detail || jsonb_build_object(
      'id', v_comp.id,
      'jenis', v_comp.jenis,
      'kode', v_comp.kode_sumber_daya,
      'uraian', v_comp.uraian,
      'satuan', v_comp.satuan,
      'koefisien', v_comp.koefisien,
      'hargaDasar', v_harga,
      'subtotal', v_subtotal_komp::bigint,
      'hasPrice', v_harga > 0,
      'resourceId', v_comp.matched_rp_id
    );
  end loop;

  v_biaya_langsung := v_tenaga + v_bahan + v_alat + v_subkon;
  v_overhead_amount := round(v_biaya_langsung * (v_tpl.overhead_profit_pct / 100.0))::bigint;
  v_total_harga_satuan := v_biaya_langsung + v_overhead_amount;

  return jsonb_build_object(
    'templateId', v_tpl.id,
    'kode', v_tpl.kode,
    'nama', v_tpl.nama,
    'satuan', v_tpl.satuan,
    'kategori', v_tpl.kategori,
    'overheadProfitPct', v_tpl.overhead_profit_pct,
    'biayaTenaga', v_tenaga,
    'biayaBahan', v_bahan,
    'biayaAlat', v_alat,
    'biayaSubkon', v_subkon,
    'biayaLangsung', v_biaya_langsung,
    'overheadAmount', v_overhead_amount,
    'totalHargaSatuan', v_total_harga_satuan,
    'components', v_components_detail
  );
end;
$$;

grant execute on function public.calculate_ahsp_unit_price(uuid, uuid, text) to authenticated;


-- 9. RPC: seed_pupr_ahsp_templates
-- Menanam 20 Item Pekerjaan Sipil Standar Permen PUPR No. 8 Tahun 2023 secara Idempotent
create or replace function public.seed_pupr_ahsp_templates(
  p_workspace_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
  v_cnt int := 0;
  v_tid uuid;

  -- Helper function lokal via CTE/subquery tidak praktis di pure PL/pgSQL,
  -- maka kita gunakan blok penyisipan per item.
begin
  select * into a from private.require_actor(p_workspace_id);

  if a.actor_role not in ('owner', 'finance', 'project_manager') then
    raise exception 'Hanya Owner, Finance, atau Project Manager yang dapat melakukan seed AHSP PUPR.' using errcode = '42501';
  end if;

  -- =========================================================================
  -- ITEM 1: Pembersihan lapangan dan perataan (1 m2) - Permen PUPR 8/2023
  -- =========================================================================
  select id into v_tid from public.ahsp_templates where workspace_id = p_workspace_id and kode = 'PUPR-01';
  if not found then
    v_tid := gen_random_uuid();
    insert into public.ahsp_templates (id, workspace_id, kode, nama, satuan, kategori, overhead_profit_pct, dasar_hukum, keterangan)
    values (v_tid, p_workspace_id, 'PUPR-01', 'Pembersihan lapangan dan perataan', 'm2', 'Pekerjaan Persiapan', 10.00, 'Permen PUPR No. 8 Tahun 2023', 'A.2.2.1.9 Pembersihan 1 m2 lapangan dan perataan');
  end if;
  delete from public.ahsp_components where template_id = v_tid;
  insert into public.ahsp_components (workspace_id, template_id, jenis, kode_sumber_daya, uraian, satuan, koefisien) values
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-001', 'Pekerja Konstruksi', 'OH', 0.100000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-003', 'Mandor Lapangan', 'OH', 0.050000);
  v_cnt := v_cnt + 1;

  -- =========================================================================
  -- ITEM 2: Galian tanah biasa sedalam s.d. 1 meter (1 m3)
  -- =========================================================================
  select id into v_tid from public.ahsp_templates where workspace_id = p_workspace_id and kode = 'PUPR-02';
  if not found then
    v_tid := gen_random_uuid();
    insert into public.ahsp_templates (id, workspace_id, kode, nama, satuan, kategori, overhead_profit_pct, dasar_hukum, keterangan)
    values (v_tid, p_workspace_id, 'PUPR-02', 'Penggalian 1 m3 tanah biasa sedalam 1 m', 'm3', 'Pekerjaan Tanah', 10.00, 'Permen PUPR No. 8 Tahun 2023', 'A.2.3.1.1 Penggalian tanah biasa');
  end if;
  delete from public.ahsp_components where template_id = v_tid;
  insert into public.ahsp_components (workspace_id, template_id, jenis, kode_sumber_daya, uraian, satuan, koefisien) values
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-001', 'Pekerja Konstruksi', 'OH', 0.750000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-003', 'Mandor Lapangan', 'OH', 0.025000);
  v_cnt := v_cnt + 1;

  -- =========================================================================
  -- ITEM 3: Urugan tanah kembali (1 m3)
  -- =========================================================================
  select id into v_tid from public.ahsp_templates where workspace_id = p_workspace_id and kode = 'PUPR-03';
  if not found then
    v_tid := gen_random_uuid();
    insert into public.ahsp_templates (id, workspace_id, kode, nama, satuan, kategori, overhead_profit_pct, dasar_hukum, keterangan)
    values (v_tid, p_workspace_id, 'PUPR-03', 'Pengurugan kembali 1 m3 galian tanah', 'm3', 'Pekerjaan Tanah', 10.00, 'Permen PUPR No. 8 Tahun 2023', 'A.2.3.1.9 Pengurugan kembali (1/3 galian)');
  end if;
  delete from public.ahsp_components where template_id = v_tid;
  insert into public.ahsp_components (workspace_id, template_id, jenis, kode_sumber_daya, uraian, satuan, koefisien) values
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-001', 'Pekerja Konstruksi', 'OH', 0.250000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-003', 'Mandor Lapangan', 'OH', 0.025000);
  v_cnt := v_cnt + 1;

  -- =========================================================================
  -- ITEM 4: Urugan pasir bawah pondasi / lantai (1 m3)
  -- =========================================================================
  select id into v_tid from public.ahsp_templates where workspace_id = p_workspace_id and kode = 'PUPR-04';
  if not found then
    v_tid := gen_random_uuid();
    insert into public.ahsp_templates (id, workspace_id, kode, nama, satuan, kategori, overhead_profit_pct, dasar_hukum, keterangan)
    values (v_tid, p_workspace_id, 'PUPR-04', 'Pengurugan 1 m3 pasir urug padat', 'm3', 'Pekerjaan Tanah', 10.00, 'Permen PUPR No. 8 Tahun 2023', 'A.2.3.1.11 Pasir urug');
  end if;
  delete from public.ahsp_components where template_id = v_tid;
  insert into public.ahsp_components (workspace_id, template_id, jenis, kode_sumber_daya, uraian, satuan, koefisien) values
    (p_workspace_id, v_tid, 'Bahan', 'BHN-002', 'Pasir Urug', 'm3', 1.200000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-001', 'Pekerja Konstruksi', 'OH', 0.300000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-003', 'Mandor Lapangan', 'OH', 0.010000);
  v_cnt := v_cnt + 1;

  -- =========================================================================
  -- ITEM 5: Pasangan pondasi batu belah camp. 1:4 (1 m3)
  -- =========================================================================
  select id into v_tid from public.ahsp_templates where workspace_id = p_workspace_id and kode = 'PUPR-05';
  if not found then
    v_tid := gen_random_uuid();
    insert into public.ahsp_templates (id, workspace_id, kode, nama, satuan, kategori, overhead_profit_pct, dasar_hukum, keterangan)
    values (v_tid, p_workspace_id, 'PUPR-05', 'Pemasangan 1 m3 pondasi batu belah camp. 1:4', 'm3', 'Pekerjaan Pondasi', 10.00, 'Permen PUPR No. 8 Tahun 2023', 'A.3.2.1.2 Pondasi batu belah 1:4');
  end if;
  delete from public.ahsp_components where template_id = v_tid;
  insert into public.ahsp_components (workspace_id, template_id, jenis, kode_sumber_daya, uraian, satuan, koefisien) values
    (p_workspace_id, v_tid, 'Bahan', 'BHN-003', 'Batu Belah 15/20 cm', 'm3', 1.200000),
    (p_workspace_id, v_tid, 'Bahan', 'BHN-001', 'Semen Portland (PC)', 'kg', 163.000000),
    (p_workspace_id, v_tid, 'Bahan', 'BHN-002', 'Pasir Pasang', 'm3', 0.520000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-001', 'Pekerja Konstruksi', 'OH', 1.500000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-002', 'Tukang Batu', 'OH', 0.750000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-003', 'Mandor Lapangan', 'OH', 0.075000);
  v_cnt := v_cnt + 1;

  -- =========================================================================
  -- ITEM 6: Lantai kerja beton mutu f'c = 7.4 MPa / B-0 / K-100 (1 m3)
  -- =========================================================================
  select id into v_tid from public.ahsp_templates where workspace_id = p_workspace_id and kode = 'PUPR-06';
  if not found then
    v_tid := gen_random_uuid();
    insert into public.ahsp_templates (id, workspace_id, kode, nama, satuan, kategori, overhead_profit_pct, dasar_hukum, keterangan)
    values (v_tid, p_workspace_id, 'PUPR-06', 'Pembuatan 1 m3 lantai kerja beton f''c=7.4 MPa', 'm3', 'Pekerjaan Struktur Beton', 10.00, 'Permen PUPR No. 8 Tahun 2023', 'A.4.1.1.1 Lantai kerja mutu f''c=7.4 MPa');
  end if;
  delete from public.ahsp_components where template_id = v_tid;
  insert into public.ahsp_components (workspace_id, template_id, jenis, kode_sumber_daya, uraian, satuan, koefisien) values
    (p_workspace_id, v_tid, 'Bahan', 'BHN-001', 'Semen Portland (PC)', 'kg', 230.000000),
    (p_workspace_id, v_tid, 'Bahan', 'BHN-002', 'Pasir Beton', 'kg', 893.000000),
    (p_workspace_id, v_tid, 'Bahan', 'BHN-004', 'Kerikil / Split 2/3', 'kg', 1027.000000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-001', 'Pekerja Konstruksi', 'OH', 1.200000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-002', 'Tukang Batu', 'OH', 0.200000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-003', 'Mandor Lapangan', 'OH', 0.120000);
  v_cnt := v_cnt + 1;

  -- =========================================================================
  -- ITEM 7: Beton struktur f'c = 19.3 MPa / K-225 (1 m3)
  -- =========================================================================
  select id into v_tid from public.ahsp_templates where workspace_id = p_workspace_id and kode = 'PUPR-07';
  if not found then
    v_tid := gen_random_uuid();
    insert into public.ahsp_templates (id, workspace_id, kode, nama, satuan, kategori, overhead_profit_pct, dasar_hukum, keterangan)
    values (v_tid, p_workspace_id, 'PUPR-07', 'Pembuatan 1 m3 beton f''c=19.3 MPa (K-225)', 'm3', 'Pekerjaan Struktur Beton', 10.00, 'Permen PUPR No. 8 Tahun 2023', 'A.4.1.1.5 Beton mutu f''c=19.3 MPa');
  end if;
  delete from public.ahsp_components where template_id = v_tid;
  insert into public.ahsp_components (workspace_id, template_id, jenis, kode_sumber_daya, uraian, satuan, koefisien) values
    (p_workspace_id, v_tid, 'Bahan', 'BHN-001', 'Semen Portland (PC)', 'kg', 371.000000),
    (p_workspace_id, v_tid, 'Bahan', 'BHN-002', 'Pasir Beton', 'kg', 698.000000),
    (p_workspace_id, v_tid, 'Bahan', 'BHN-004', 'Kerikil / Split 2/3', 'kg', 1047.000000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-001', 'Pekerja Konstruksi', 'OH', 1.650000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-002', 'Tukang Batu', 'OH', 0.275000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-003', 'Mandor Lapangan', 'OH', 0.083000),
    (p_workspace_id, v_tid, 'Alat', 'ALT-001', 'Concrete Mixer (Molen)', 'hari', 0.250000);
  v_cnt := v_cnt + 1;

  -- =========================================================================
  -- ITEM 8: Pembesian dengan besi beton polos BjTP 280 (1 kg)
  -- =========================================================================
  select id into v_tid from public.ahsp_templates where workspace_id = p_workspace_id and kode = 'PUPR-08';
  if not found then
    v_tid := gen_random_uuid();
    insert into public.ahsp_templates (id, workspace_id, kode, nama, satuan, kategori, overhead_profit_pct, dasar_hukum, keterangan)
    values (v_tid, p_workspace_id, 'PUPR-08', 'Pembesian 1 kg dengan besi polos BjTP 280', 'kg', 'Pekerjaan Struktur Beton', 10.00, 'Permen PUPR No. 8 Tahun 2023', 'A.4.1.1.17 Pembesian besi polos');
  end if;
  delete from public.ahsp_components where template_id = v_tid;
  insert into public.ahsp_components (workspace_id, template_id, jenis, kode_sumber_daya, uraian, satuan, koefisien) values
    (p_workspace_id, v_tid, 'Bahan', 'BHN-005', 'Besi Beton Polos', 'kg', 1.050000),
    (p_workspace_id, v_tid, 'Bahan', 'BHN-006', 'Kawat Beton / Bendrat', 'kg', 0.015000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-001', 'Pekerja Konstruksi', 'OH', 0.007000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-002', 'Tukang Besi', 'OH', 0.007000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-003', 'Mandor Lapangan', 'OH', 0.000400);
  v_cnt := v_cnt + 1;

  -- =========================================================================
  -- ITEM 9: Pembesian dengan besi beton ulir BjTS 420 (1 kg)
  -- =========================================================================
  select id into v_tid from public.ahsp_templates where workspace_id = p_workspace_id and kode = 'PUPR-09';
  if not found then
    v_tid := gen_random_uuid();
    insert into public.ahsp_templates (id, workspace_id, kode, nama, satuan, kategori, overhead_profit_pct, dasar_hukum, keterangan)
    values (v_tid, p_workspace_id, 'PUPR-09', 'Pembesian 1 kg dengan besi ulir BjTS 420', 'kg', 'Pekerjaan Struktur Beton', 10.00, 'Permen PUPR No. 8 Tahun 2023', 'A.4.1.1.18 Pembesian besi ulir');
  end if;
  delete from public.ahsp_components where template_id = v_tid;
  insert into public.ahsp_components (workspace_id, template_id, jenis, kode_sumber_daya, uraian, satuan, koefisien) values
    (p_workspace_id, v_tid, 'Bahan', 'BHN-007', 'Besi Beton Ulir', 'kg', 1.050000),
    (p_workspace_id, v_tid, 'Bahan', 'BHN-006', 'Kawat Beton / Bendrat', 'kg', 0.015000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-001', 'Pekerja Konstruksi', 'OH', 0.007000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-002', 'Tukang Besi', 'OH', 0.007000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-003', 'Mandor Lapangan', 'OH', 0.000400);
  v_cnt := v_cnt + 1;

  -- =========================================================================
  -- ITEM 10: Bekisting sloof / pondasi (1 m2)
  -- =========================================================================
  select id into v_tid from public.ahsp_templates where workspace_id = p_workspace_id and kode = 'PUPR-10';
  if not found then
    v_tid := gen_random_uuid();
    insert into public.ahsp_templates (id, workspace_id, kode, nama, satuan, kategori, overhead_profit_pct, dasar_hukum, keterangan)
    values (v_tid, p_workspace_id, 'PUPR-10', 'Pemasangan 1 m2 bekisting untuk sloof', 'm2', 'Pekerjaan Struktur Beton', 10.00, 'Permen PUPR No. 8 Tahun 2023', 'A.4.1.1.20 Bekisting sloof');
  end if;
  delete from public.ahsp_components where template_id = v_tid;
  insert into public.ahsp_components (workspace_id, template_id, jenis, kode_sumber_daya, uraian, satuan, koefisien) values
    (p_workspace_id, v_tid, 'Bahan', 'BHN-008', 'Kayu Kelas III Bekisting', 'm3', 0.045000),
    (p_workspace_id, v_tid, 'Bahan', 'BHN-009', 'Paku 5-10 cm', 'kg', 0.300000),
    (p_workspace_id, v_tid, 'Bahan', 'BHN-010', 'Minyak Bekisting', 'liter', 0.100000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-001', 'Pekerja Konstruksi', 'OH', 0.520000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-002', 'Tukang Kayu', 'OH', 0.260000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-003', 'Mandor Lapangan', 'OH', 0.026000);
  v_cnt := v_cnt + 1;

  -- =========================================================================
  -- ITEM 11: Bekisting kolom dan balok (1 m2)
  -- =========================================================================
  select id into v_tid from public.ahsp_templates where workspace_id = p_workspace_id and kode = 'PUPR-11';
  if not found then
    v_tid := gen_random_uuid();
    insert into public.ahsp_templates (id, workspace_id, kode, nama, satuan, kategori, overhead_profit_pct, dasar_hukum, keterangan)
    values (v_tid, p_workspace_id, 'PUPR-11', 'Pemasangan 1 m2 bekisting kolom / balok', 'm2', 'Pekerjaan Struktur Beton', 10.00, 'Permen PUPR No. 8 Tahun 2023', 'A.4.1.1.22 Bekisting kolom balok');
  end if;
  delete from public.ahsp_components where template_id = v_tid;
  insert into public.ahsp_components (workspace_id, template_id, jenis, kode_sumber_daya, uraian, satuan, koefisien) values
    (p_workspace_id, v_tid, 'Bahan', 'BHN-008', 'Kayu Kelas III Bekisting', 'm3', 0.040000),
    (p_workspace_id, v_tid, 'Bahan', 'BHN-009', 'Paku 5-10 cm', 'kg', 0.400000),
    (p_workspace_id, v_tid, 'Bahan', 'BHN-010', 'Minyak Bekisting', 'liter', 0.200000),
    (p_workspace_id, v_tid, 'Bahan', 'BHN-011', 'Multiplex / Plywood 9 mm', 'lembar', 0.350000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-001', 'Pekerja Konstruksi', 'OH', 0.660000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-002', 'Tukang Kayu', 'OH', 0.330000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-003', 'Mandor Lapangan', 'OH', 0.033000);
  v_cnt := v_cnt + 1;

  -- =========================================================================
  -- ITEM 12: Pasangan dinding bata merah tebal 1/2 bata camp. 1:4 (1 m2)
  -- =========================================================================
  select id into v_tid from public.ahsp_templates where workspace_id = p_workspace_id and kode = 'PUPR-12';
  if not found then
    v_tid := gen_random_uuid();
    insert into public.ahsp_templates (id, workspace_id, kode, nama, satuan, kategori, overhead_profit_pct, dasar_hukum, keterangan)
    values (v_tid, p_workspace_id, 'PUPR-12', 'Pemasangan 1 m2 dinding bata merah tebal 1/2 bata 1:4', 'm2', 'Pekerjaan Dinding', 10.00, 'Permen PUPR No. 8 Tahun 2023', 'A.4.4.1.9 Dinding bata merah 1:4');
  end if;
  delete from public.ahsp_components where template_id = v_tid;
  insert into public.ahsp_components (workspace_id, template_id, jenis, kode_sumber_daya, uraian, satuan, koefisien) values
    (p_workspace_id, v_tid, 'Bahan', 'BHN-012', 'Bata Merah Bakar', 'buah', 70.000000),
    (p_workspace_id, v_tid, 'Bahan', 'BHN-001', 'Semen Portland (PC)', 'kg', 11.500000),
    (p_workspace_id, v_tid, 'Bahan', 'BHN-002', 'Pasir Pasang', 'm3', 0.043000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-001', 'Pekerja Konstruksi', 'OH', 0.300000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-002', 'Tukang Batu', 'OH', 0.100000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-003', 'Mandor Lapangan', 'OH', 0.015000);
  v_cnt := v_cnt + 1;

  -- =========================================================================
  -- ITEM 13: Pasangan dinding bata ringan / AAC tebal 10 cm (1 m2)
  -- =========================================================================
  select id into v_tid from public.ahsp_templates where workspace_id = p_workspace_id and kode = 'PUPR-13';
  if not found then
    v_tid := gen_random_uuid();
    insert into public.ahsp_templates (id, workspace_id, kode, nama, satuan, kategori, overhead_profit_pct, dasar_hukum, keterangan)
    values (v_tid, p_workspace_id, 'PUPR-13', 'Pemasangan 1 m2 dinding bata ringan AAC tebal 10 cm', 'm2', 'Pekerjaan Dinding', 10.00, 'Permen PUPR No. 8 Tahun 2023', 'A.4.4.1.17 Dinding bata ringan AAC');
  end if;
  delete from public.ahsp_components where template_id = v_tid;
  insert into public.ahsp_components (workspace_id, template_id, jenis, kode_sumber_daya, uraian, satuan, koefisien) values
    (p_workspace_id, v_tid, 'Bahan', 'BHN-013', 'Bata Ringan AAC 10 cm', 'm3', 0.100000),
    (p_workspace_id, v_tid, 'Bahan', 'BHN-014', 'Semen Mortar Perekat Bata Ringan', 'kg', 4.000000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-001', 'Pekerja Konstruksi', 'OH', 0.200000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-002', 'Tukang Batu', 'OH', 0.100000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-003', 'Mandor Lapangan', 'OH', 0.010000);
  v_cnt := v_cnt + 1;

  -- =========================================================================
  -- ITEM 14: Plesteran tebal 15 mm camp. 1:4 (1 m2)
  -- =========================================================================
  select id into v_tid from public.ahsp_templates where workspace_id = p_workspace_id and kode = 'PUPR-14';
  if not found then
    v_tid := gen_random_uuid();
    insert into public.ahsp_templates (id, workspace_id, kode, nama, satuan, kategori, overhead_profit_pct, dasar_hukum, keterangan)
    values (v_tid, p_workspace_id, 'PUPR-14', 'Pemasangan 1 m2 plesteran 1:4 tebal 15 mm', 'm2', 'Pekerjaan Dinding', 10.00, 'Permen PUPR No. 8 Tahun 2023', 'A.4.4.2.4 Plesteran 1:4 tebal 15 mm');
  end if;
  delete from public.ahsp_components where template_id = v_tid;
  insert into public.ahsp_components (workspace_id, template_id, jenis, kode_sumber_daya, uraian, satuan, koefisien) values
    (p_workspace_id, v_tid, 'Bahan', 'BHN-001', 'Semen Portland (PC)', 'kg', 6.240000),
    (p_workspace_id, v_tid, 'Bahan', 'BHN-002', 'Pasir Pasang', 'm3', 0.024000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-001', 'Pekerja Konstruksi', 'OH', 0.300000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-002', 'Tukang Batu', 'OH', 0.150000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-003', 'Mandor Lapangan', 'OH', 0.015000);
  v_cnt := v_cnt + 1;

  -- =========================================================================
  -- ITEM 15: Acian dinding semen (1 m2)
  -- =========================================================================
  select id into v_tid from public.ahsp_templates where workspace_id = p_workspace_id and kode = 'PUPR-15';
  if not found then
    v_tid := gen_random_uuid();
    insert into public.ahsp_templates (id, workspace_id, kode, nama, satuan, kategori, overhead_profit_pct, dasar_hukum, keterangan)
    values (v_tid, p_workspace_id, 'PUPR-15', 'Pengacian 1 m2 dinding semen', 'm2', 'Pekerjaan Dinding', 10.00, 'Permen PUPR No. 8 Tahun 2023', 'A.4.4.2.27 Acian');
  end if;
  delete from public.ahsp_components where template_id = v_tid;
  insert into public.ahsp_components (workspace_id, template_id, jenis, kode_sumber_daya, uraian, satuan, koefisien) values
    (p_workspace_id, v_tid, 'Bahan', 'BHN-001', 'Semen Portland (PC)', 'kg', 3.250000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-001', 'Pekerja Konstruksi', 'OH', 0.200000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-002', 'Tukang Batu', 'OH', 0.100000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-003', 'Mandor Lapangan', 'OH', 0.010000);
  v_cnt := v_cnt + 1;

  -- =========================================================================
  -- ITEM 16: Pengecatan dinding interior 3 lapis (1 m2)
  -- =========================================================================
  select id into v_tid from public.ahsp_templates where workspace_id = p_workspace_id and kode = 'PUPR-16';
  if not found then
    v_tid := gen_random_uuid();
    insert into public.ahsp_templates (id, workspace_id, kode, nama, satuan, kategori, overhead_profit_pct, dasar_hukum, keterangan)
    values (v_tid, p_workspace_id, 'PUPR-16', 'Pengecatan 1 m2 dinding interior (1 dasar + 2 penutup)', 'm2', 'Pekerjaan Finishing', 10.00, 'Permen PUPR No. 8 Tahun 2023', 'A.4.7.1.10 Pengecatan dinding baru');
  end if;
  delete from public.ahsp_components where template_id = v_tid;
  insert into public.ahsp_components (workspace_id, template_id, jenis, kode_sumber_daya, uraian, satuan, koefisien) values
    (p_workspace_id, v_tid, 'Bahan', 'BHN-015', 'Cat Dasar / Alkali Sealer', 'kg', 0.100000),
    (p_workspace_id, v_tid, 'Bahan', 'BHN-016', 'Cat Penutup Interior Emulsi', 'kg', 0.260000),
    (p_workspace_id, v_tid, 'Bahan', 'BHN-017', 'Plamir Tembok', 'kg', 0.100000),
    (p_workspace_id, v_tid, 'Bahan', 'BHN-018', 'Ampelas Tembok', 'lembar', 0.500000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-001', 'Pekerja Konstruksi', 'OH', 0.020000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-002', 'Tukang Cat', 'OH', 0.063000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-003', 'Mandor Lapangan', 'OH', 0.002500);
  v_cnt := v_cnt + 1;

  -- =========================================================================
  -- ITEM 17: Pemasangan keramik lantai 40x40 cm (1 m2)
  -- =========================================================================
  select id into v_tid from public.ahsp_templates where workspace_id = p_workspace_id and kode = 'PUPR-17';
  if not found then
    v_tid := gen_random_uuid();
    insert into public.ahsp_templates (id, workspace_id, kode, nama, satuan, kategori, overhead_profit_pct, dasar_hukum, keterangan)
    values (v_tid, p_workspace_id, 'PUPR-17', 'Pemasangan 1 m2 lantai keramik 40x40 cm', 'm2', 'Pekerjaan Finishing', 10.00, 'Permen PUPR No. 8 Tahun 2023', 'A.4.4.3.35 Lantai keramik 40x40');
  end if;
  delete from public.ahsp_components where template_id = v_tid;
  insert into public.ahsp_components (workspace_id, template_id, jenis, kode_sumber_daya, uraian, satuan, koefisien) values
    (p_workspace_id, v_tid, 'Bahan', 'BHN-019', 'Keramik Lantai 40x40 cm Polos', 'm2', 1.000000),
    (p_workspace_id, v_tid, 'Bahan', 'BHN-001', 'Semen Portland (PC)', 'kg', 9.300000),
    (p_workspace_id, v_tid, 'Bahan', 'BHN-002', 'Pasir Pasang', 'm3', 0.045000),
    (p_workspace_id, v_tid, 'Bahan', 'BHN-020', 'Semen Grout Pengisi Nat', 'kg', 1.500000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-001', 'Pekerja Konstruksi', 'OH', 0.700000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-002', 'Tukang Batu', 'OH', 0.350000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-003', 'Mandor Lapangan', 'OH', 0.035000);
  v_cnt := v_cnt + 1;

  -- =========================================================================
  -- ITEM 18: Pemasangan rangka atap baja ringan (1 m2)
  -- =========================================================================
  select id into v_tid from public.ahsp_templates where workspace_id = p_workspace_id and kode = 'PUPR-18';
  if not found then
    v_tid := gen_random_uuid();
    insert into public.ahsp_templates (id, workspace_id, kode, nama, satuan, kategori, overhead_profit_pct, dasar_hukum, keterangan)
    values (v_tid, p_workspace_id, 'PUPR-18', 'Pemasangan 1 m2 rangka atap baja ringan (truss & reng)', 'm2', 'Pekerjaan Atap', 10.00, 'Permen PUPR No. 8 Tahun 2023', 'Rangka atap baja ringan profil C');
  end if;
  delete from public.ahsp_components where template_id = v_tid;
  insert into public.ahsp_components (workspace_id, template_id, jenis, kode_sumber_daya, uraian, satuan, koefisien) values
    (p_workspace_id, v_tid, 'Bahan', 'BHN-021', 'Profil Rangka Baja Ringan C75 & Reng', 'm2', 1.050000),
    (p_workspace_id, v_tid, 'Bahan', 'BHN-022', 'Self Drilling Screw / Baut Baja Ringan', 'buah', 20.000000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-001', 'Pekerja Konstruksi', 'OH', 0.150000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-002', 'Tukang Khusus Rangka Baja', 'OH', 0.150000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-003', 'Mandor Lapangan', 'OH', 0.015000);
  v_cnt := v_cnt + 1;

  -- =========================================================================
  -- ITEM 19: Pemasangan penutup atap genteng metal (1 m2)
  -- =========================================================================
  select id into v_tid from public.ahsp_templates where workspace_id = p_workspace_id and kode = 'PUPR-19';
  if not found then
    v_tid := gen_random_uuid();
    insert into public.ahsp_templates (id, workspace_id, kode, nama, satuan, kategori, overhead_profit_pct, dasar_hukum, keterangan)
    values (v_tid, p_workspace_id, 'PUPR-19', 'Pemasangan 1 m2 penutup atap genteng metal pasir', 'm2', 'Pekerjaan Atap', 10.00, 'Permen PUPR No. 8 Tahun 2023', 'A.4.5.2.32 Penutup atap genteng metal');
  end if;
  delete from public.ahsp_components where template_id = v_tid;
  insert into public.ahsp_components (workspace_id, template_id, jenis, kode_sumber_daya, uraian, satuan, koefisien) values
    (p_workspace_id, v_tid, 'Bahan', 'BHN-023', 'Genteng Metal Pasir', 'm2', 1.050000),
    (p_workspace_id, v_tid, 'Bahan', 'BHN-022', 'Paku / Sekrup Atap Metal', 'buah', 12.000000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-001', 'Pekerja Konstruksi', 'OH', 0.200000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-002', 'Tukang Atap', 'OH', 0.100000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-003', 'Mandor Lapangan', 'OH', 0.010000);
  v_cnt := v_cnt + 1;

  -- =========================================================================
  -- ITEM 20: Pemasangan plafon gypsum board 9 mm + rangka hollow (1 m2)
  -- =========================================================================
  select id into v_tid from public.ahsp_templates where workspace_id = p_workspace_id and kode = 'PUPR-20';
  if not found then
    v_tid := gen_random_uuid();
    insert into public.ahsp_templates (id, workspace_id, kode, nama, satuan, kategori, overhead_profit_pct, dasar_hukum, keterangan)
    values (v_tid, p_workspace_id, 'PUPR-20', 'Pemasangan 1 m2 plafon gypsum 9 mm + rangka hollow', 'm2', 'Pekerjaan Langit-langit', 10.00, 'Permen PUPR No. 8 Tahun 2023', 'A.4.5.1.7 Plafon gypsum board 9 mm');
  end if;
  delete from public.ahsp_components where template_id = v_tid;
  insert into public.ahsp_components (workspace_id, template_id, jenis, kode_sumber_daya, uraian, satuan, koefisien) values
    (p_workspace_id, v_tid, 'Bahan', 'BHN-024', 'Gypsum Board 9 mm', 'lembar', 0.364000),
    (p_workspace_id, v_tid, 'Bahan', 'BHN-025', 'Rangka Hollow Galvanis 40x40 & 20x40', 'm', 3.500000),
    (p_workspace_id, v_tid, 'Bahan', 'BHN-026', 'Sekrup Gypsum', 'buah', 20.000000),
    (p_workspace_id, v_tid, 'Bahan', 'BHN-027', 'Kompon Joint Gypsum', 'kg', 0.250000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-001', 'Pekerja Konstruksi', 'OH', 0.100000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-002', 'Tukang Plafon', 'OH', 0.150000),
    (p_workspace_id, v_tid, 'Tenaga', 'UPH-003', 'Mandor Lapangan', 'OH', 0.010000);
  v_cnt := v_cnt + 1;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    'SEED_PUPR_AHSP', 'ahsp_templates', p_workspace_id, null,
    format('Seed 20 item AHSP standar Permen PUPR No. 8 Tahun 2023 ke workspace oleh %s', a.actor_name),
    '', format('seeded:%s_items', v_cnt),
    jsonb_build_object('totalItems', v_cnt, 'dasarHukum', 'Permen PUPR No. 8 Tahun 2023')
  );

  return jsonb_build_object('success', true, 'total', v_cnt,
    'message', format('Berhasil menanam %s item standar AHSP Bidang PUPR (Permen PUPR No. 8 Tahun 2023) ke workspace.', v_cnt));
end;
$$;

grant execute on function public.seed_pupr_ahsp_templates(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Assertions (Verifikasi Migrasi 0010)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  assert exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'ahsp_templates'
  ), 'Tabel ahsp_templates tidak ditemukan';

  assert exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'ahsp_components'
  ), 'Tabel ahsp_components tidak ditemukan';

  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'upsert_ahsp_template'
  ), 'RPC upsert_ahsp_template tidak ditemukan';

  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'upsert_ahsp_component'
  ), 'RPC upsert_ahsp_component tidak ditemukan';

  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'calculate_ahsp_unit_price'
  ), 'RPC calculate_ahsp_unit_price tidak ditemukan';

  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'seed_pupr_ahsp_templates'
  ), 'RPC seed_pupr_ahsp_templates tidak ditemukan';

  raise notice 'Migration 0010 (ahsp_templates) assertions lulus.';
end;
$$;
