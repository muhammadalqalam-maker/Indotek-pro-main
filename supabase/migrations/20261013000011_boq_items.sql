-- =============================================================================
-- Indotek Pro — Migrasi Supabase 11: BILL OF QUANTITIES (BOQ / RAB PER ITEM)
-- Modul: RAB / BOQ Tahap C
-- Fitur: boq_items hierarki, rollup otomatis ke budget_lines divisi,
--        kalkulasi bobot %, PPN dinamis (default 11%), pembulatan Rupiah,
--        dan fungsi terbilang resmi Bahasa Indonesia.
-- =============================================================================

-- 1. Tambah kolom konfigurasi PPN pada tabel projects bila belum ada
alter table public.projects
  add column if not exists ppn_percent numeric(5,2) not null default 11.00;

-- 2. TABEL: boq_items
create table if not exists public.boq_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  parent_id uuid null references public.boq_items(id) on delete cascade,
  ahsp_id uuid null references public.ahsp_templates(id) on delete set null,
  division_category text not null check (division_category in ('Pekerjaan Persiapan','Pekerjaan Struktur','Pekerjaan Arsitektur','Pekerjaan MEP','Manajemen & Overhead')),
  kode text not null,
  uraian text not null,
  satuan text not null default 'ls',
  volume numeric(18,3) not null default 0 check (volume >= 0),
  harga_satuan bigint not null default 0 check (harga_satuan >= 0),
  jumlah_harga bigint not null default 0 check (jumlah_harga >= 0),
  bobot_persen numeric(7,4) not null default 0 check (bobot_persen >= 0 and bobot_persen <= 100),
  progres_persen numeric(5,2) not null default 0 check (progres_persen >= 0 and progres_persen <= 100),
  urutan int not null default 0,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint uq_boq_items_project_kode unique (project_id, kode)
);

create index if not exists idx_boq_items_project on public.boq_items (project_id);
create index if not exists idx_boq_items_workspace on public.boq_items (workspace_id);
create index if not exists idx_boq_items_parent on public.boq_items (parent_id);
create index if not exists idx_boq_items_ahsp on public.boq_items (ahsp_id);
create index if not exists idx_boq_items_category on public.boq_items (project_id, division_category);

-- 3. RLS: Row Level Security
alter table public.boq_items enable row level security;

-- Baca: Anggota workspace yang ditugaskan pada proyek
drop policy if exists boq_items_read on public.boq_items;
create policy boq_items_read on public.boq_items
  for select using (
    private.is_member(workspace_id) and private.is_assigned(workspace_id, project_id)
  );

-- Tulis: Klien diblokir menulis langsung ke boq_items (wajib via RPC)
drop policy if exists boq_items_write on public.boq_items;
create policy boq_items_write on public.boq_items
  for all using (false) with check (false);


-- 4. FUNGSI: terbilang_rupiah (Nominal Rupiah ke Teks Bahasa Indonesia)
create or replace function public.terbilang_angka(p_angka bigint)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  satuan text[] := array['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
  v_num bigint := p_angka;
begin
  if v_num < 0 then
    return 'Minus ' || public.terbilang_angka(abs(v_num));
  elsif v_num = 0 then
    return '';
  elsif v_num < 12 then
    return satuan[v_num + 1];
  elsif v_num < 20 then
    return public.terbilang_angka(v_num - 10) || ' Belas';
  elsif v_num < 100 then
    return public.terbilang_angka(v_num / 10) || ' Puluh' ||
      case when v_num % 10 <> 0 then ' ' || public.terbilang_angka(v_num % 10) else '' end;
  elsif v_num < 200 then
    return 'Seratus' || case when v_num - 100 <> 0 then ' ' || public.terbilang_angka(v_num - 100) else '' end;
  elsif v_num < 1000 then
    return public.terbilang_angka(v_num / 100) || ' Ratus' ||
      case when v_num % 100 <> 0 then ' ' || public.terbilang_angka(v_num % 100) else '' end;
  elsif v_num < 2000 then
    return 'Seribu' || case when v_num - 1000 <> 0 then ' ' || public.terbilang_angka(v_num - 1000) else '' end;
  elsif v_num < 1000000 then
    return public.terbilang_angka(v_num / 1000) || ' Ribu' ||
      case when v_num % 1000 <> 0 then ' ' || public.terbilang_angka(v_num % 1000) else '' end;
  elsif v_num < 1000000000 then
    return public.terbilang_angka(v_num / 1000000) || ' Juta' ||
      case when v_num % 1000000 <> 0 then ' ' || public.terbilang_angka(v_num % 1000000) else '' end;
  elsif v_num < 1000000000000 then
    return public.terbilang_angka(v_num / 1000000000) || ' Miliar' ||
      case when v_num % 1000000000 <> 0 then ' ' || public.terbilang_angka(v_num % 1000000000) else '' end;
  else
    return public.terbilang_angka(v_num / 1000000000000) || ' Triliun' ||
      case when v_num % 1000000000000 <> 0 then ' ' || public.terbilang_angka(v_num % 1000000000000) else '' end;
  end if;
end;
$$;

create or replace function public.terbilang_rupiah(p_nominal bigint)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_res text;
begin
  if p_nominal = 0 then
    return 'Nol Rupiah';
  end if;

  v_res := trim(public.terbilang_angka(abs(p_nominal))) || ' Rupiah';
  -- Normalisasi spasi ganda
  while position('  ' in v_res) > 0 loop
    v_res := replace(v_res, '  ', ' ');
  end loop;

  if p_nominal < 0 then
    return 'Minus ' || v_res;
  end if;

  return v_res;
end;
$$;

grant execute on function public.terbilang_angka(bigint) to authenticated;
grant execute on function public.terbilang_rupiah(bigint) to authenticated;


-- 5. FUNGSI INTERNAL: private.recalculate_project_boq_internal
-- Melakukan rekapitulasi bobot %, sinkronisasi ke budget_lines divisi,
-- dan update progres agregat proyek.
create or replace function private.recalculate_project_boq_internal(
  p_workspace_id uuid,
  p_project_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total_subtotal bigint := 0;
  v_total_progress numeric(5,2) := 0;
  v_cat record;
  v_cat_planned bigint;
  v_div_code text;
  v_div_name text;
begin
  -- 1. Hitung jumlah_harga per item (volume x harga_satuan)
  update public.boq_items
  set jumlah_harga = round(volume * harga_satuan)::bigint,
      updated_at = clock_timestamp()
  where project_id = p_project_id;

  -- 2. Hitung Grand Total Subtotal BOQ Proyek
  select coalesce(sum(jumlah_harga), 0) into v_total_subtotal
  from public.boq_items
  where project_id = p_project_id;

  -- 3. Hitung bobot_persen masing-masing item
  if v_total_subtotal > 0 then
    update public.boq_items
    set bobot_persen = round((jumlah_harga::numeric * 100.0) / v_total_subtotal::numeric, 4)
    where project_id = p_project_id;
  else
    update public.boq_items
    set bobot_persen = 0
    where project_id = p_project_id;
  end if;

  -- 4. Hitung agregat progres fisik proyek dari bobot BOQ x progres item
  select coalesce(round(sum(progres_persen * (bobot_persen / 100.0)), 2), 0)
  into v_total_progress
  from public.boq_items
  where project_id = p_project_id;

  if v_total_progress > 100 then
    v_total_progress := 100;
  end if;

  -- Update ke progress_actual proyek bila ada item BOQ
  if v_total_subtotal > 0 then
    update public.projects
    set progress_actual = v_total_progress,
        updated_at = clock_timestamp()
    where id = p_project_id;
  end if;

  -- 5. Rollup Otomatis Subtotal per Kategori Divisi ke tabel budget_lines
  for v_cat in
    select division_category, coalesce(sum(jumlah_harga), 0)::bigint as planned_sum
    from public.boq_items
    where project_id = p_project_id
    group by division_category
  loop
    v_div_name := v_cat.division_category;
    case v_cat.division_category
      when 'Pekerjaan Persiapan' then v_div_code := 'DIV-01';
      when 'Pekerjaan Struktur' then v_div_code := 'DIV-02';
      when 'Pekerjaan Arsitektur' then v_div_code := 'DIV-03';
      when 'Pekerjaan MEP' then v_div_code := 'DIV-04';
      else v_div_code := 'DIV-05';
    end case;

    -- Upsert baris divisi di budget_lines
    insert into public.budget_lines (
      workspace_id, project_id, code, division_name, category, planned_amount, unit, volume, unit_rate
    ) values (
      p_workspace_id, p_project_id, v_div_code, v_div_name, v_cat.division_category,
      v_cat.planned_sum, 'ls', 1, v_cat.planned_sum
    )
    on conflict (project_id, code) do update
      set planned_amount = excluded.planned_amount,
          unit_rate = excluded.unit_rate,
          division_name = excluded.division_name,
          category = excluded.category,
          updated_at = clock_timestamp();
  end loop;

  -- Update approved_budget di tabel projects sama dengan total subtotal BOQ
  if v_total_subtotal > 0 then
    update public.projects
    set approved_budget = v_total_subtotal,
        updated_at = clock_timestamp()
    where id = p_project_id;
  end if;
end;
$$;


-- 6. RPC: upsert_boq_item
create or replace function public.upsert_boq_item(
  p_workspace_id uuid,
  p_project_id uuid,
  p_kode text,
  p_uraian text,
  p_satuan text default 'ls',
  p_volume numeric default 0,
  p_harga_satuan bigint default 0,
  p_division_category text default 'Pekerjaan Struktur',
  p_ahsp_id uuid default null,
  p_parent_id uuid default null,
  p_urutan int default 0,
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
  v_item record;
  v_jumlah bigint;
begin
  select * into a from private.require_actor(p_workspace_id);

  if a.actor_role not in ('owner', 'finance', 'project_manager', 'site_engineer') then
    raise exception 'Peran "%" tidak berhak mengubah item BOQ.', a.actor_role using errcode = '42501';
  end if;

  if not private.is_assigned(p_workspace_id, p_project_id) then
    raise exception 'Akses ditolak: Anda tidak ditugaskan pada proyek ini.' using errcode = '42501';
  end if;

  if coalesce(trim(p_kode), '') = '' then
    raise exception 'Kode item pekerjaan BOQ wajib diisi.' using errcode = '22023';
  end if;
  if coalesce(trim(p_uraian), '') = '' then
    raise exception 'Uraian pekerjaan BOQ wajib diisi.' using errcode = '22023';
  end if;
  if coalesce(p_volume, -1) < 0 then
    raise exception 'Volume pekerjaan tidak boleh negatif.' using errcode = '22023';
  end if;
  if coalesce(p_harga_satuan, -1) < 0 then
    raise exception 'Harga satuan pekerjaan tidak boleh negatif.' using errcode = '22023';
  end if;
  if p_division_category not in ('Pekerjaan Persiapan','Pekerjaan Struktur','Pekerjaan Arsitektur','Pekerjaan MEP','Manajemen & Overhead') then
    raise exception 'Kategori divisi "%" tidak valid.' , p_division_category using errcode = '22023';
  end if;

  v_jumlah := round(p_volume * p_harga_satuan)::bigint;

  if p_id is not null then
    select id into v_item
    from public.boq_items
    where id = p_id and project_id = p_project_id and workspace_id = p_workspace_id;

    if not found then
      raise exception 'Item BOQ tidak ditemukan.' using errcode = 'P0002';
    end if;

    v_id := p_id;
    v_action := 'UPDATE_BOQ_ITEM';

    update public.boq_items
    set kode = trim(p_kode),
        uraian = trim(p_uraian),
        satuan = coalesce(nullif(trim(p_satuan), ''), 'ls'),
        volume = p_volume,
        harga_satuan = p_harga_satuan,
        jumlah_harga = v_jumlah,
        division_category = p_division_category,
        ahsp_id = p_ahsp_id,
        parent_id = p_parent_id,
        urutan = p_urutan,
        updated_at = clock_timestamp()
    where id = v_id;
  else
    select id into v_item
    from public.boq_items
    where project_id = p_project_id and kode = trim(p_kode);

    if found then
      v_id := v_item.id;
      v_action := 'UPDATE_BOQ_ITEM';

      update public.boq_items
      set uraian = trim(p_uraian),
          satuan = coalesce(nullif(trim(p_satuan), ''), 'ls'),
          volume = p_volume,
          harga_satuan = p_harga_satuan,
          jumlah_harga = v_jumlah,
          division_category = p_division_category,
          ahsp_id = p_ahsp_id,
          parent_id = p_parent_id,
          urutan = p_urutan,
          updated_at = clock_timestamp()
      where id = v_id;
    else
      v_id := gen_random_uuid();
      v_action := 'CREATE_BOQ_ITEM';

      insert into public.boq_items (
        id, workspace_id, project_id, parent_id, ahsp_id, division_category,
        kode, uraian, satuan, volume, harga_satuan, jumlah_harga,
        bobot_persen, progres_persen, urutan, created_at, updated_at
      ) values (
        v_id, p_workspace_id, p_project_id, p_parent_id, p_ahsp_id, p_division_category,
        trim(p_kode), trim(p_uraian), coalesce(nullif(trim(p_satuan), ''), 'ls'),
        p_volume, p_harga_satuan, v_jumlah, 0, 0, p_urutan, clock_timestamp(), clock_timestamp()
      );
    end if;
  end if;

  -- Rekalkulasi otomatis bobot dan sinkronisasi ke budget_lines
  perform private.recalculate_project_boq_internal(p_workspace_id, p_project_id);

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    v_action, 'boq_item', v_id, p_project_id,
    format('%s: %s [%s] - %s %s @ Rp %s (Jumlah: Rp %s)',
      case when v_action = 'CREATE_BOQ_ITEM' then 'Tambah item BOQ' else 'Ubah item BOQ' end,
      trim(p_uraian), trim(p_kode), p_volume, p_satuan, p_harga_satuan, v_jumlah),
    '', v_jumlah::text,
    jsonb_build_object('kode', trim(p_kode), 'volume', p_volume, 'harga_satuan', p_harga_satuan, 'divisi', p_division_category)
  );

  return jsonb_build_object(
    'success', true,
    'id', v_id,
    'action', v_action,
    'message', format('Item BOQ "%s" berhasil disimpan (Jumlah: Rp %s).', trim(p_uraian), v_jumlah)
  );
end;
$$;

grant execute on function public.upsert_boq_item(uuid, uuid, text, text, text, numeric, bigint, text, uuid, uuid, int, uuid) to authenticated;


-- 7. RPC: delete_boq_item
create or replace function public.delete_boq_item(
  p_workspace_id uuid,
  p_project_id uuid,
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
    raise exception 'Peran "%" tidak berhak menghapus item BOQ.', a.actor_role using errcode = '42501';
  end if;

  select * into v_item
  from public.boq_items
  where id = p_id and project_id = p_project_id and workspace_id = p_workspace_id;

  if not found then
    raise exception 'Item BOQ tidak ditemukan.' using errcode = 'P0002';
  end if;

  delete from public.boq_items where id = p_id;

  -- Rekalkulasi otomatis sisa item
  perform private.recalculate_project_boq_internal(p_workspace_id, p_project_id);

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    'DELETE_BOQ_ITEM', 'boq_item', p_id, p_project_id,
    format('Hapus item BOQ: %s [%s]', v_item.uraian, v_item.kode),
    v_item.jumlah_harga::text, '',
    jsonb_build_object('kode', v_item.kode, 'divisi', v_item.division_category)
  );

  return jsonb_build_object('success', true, 'message', format('Item BOQ "%s" berhasil dihapus.', v_item.uraian));
end;
$$;

grant execute on function public.delete_boq_item(uuid, uuid, uuid) to authenticated;


-- 8. RPC: update_boq_item_progress
create or replace function public.update_boq_item_progress(
  p_workspace_id uuid,
  p_project_id uuid,
  p_id uuid,
  p_progres_persen numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
  v_item record;
  v_old_progres numeric;
begin
  select * into a from private.require_actor(p_workspace_id);

  if a.actor_role not in ('owner', 'project_manager', 'site_engineer') then
    raise exception 'Peran "%" tidak berhak mengupdate progres BOQ lapangan.', a.actor_role using errcode = '42501';
  end if;

  if coalesce(p_progres_persen, -1) < 0 or p_progres_persen > 100 then
    raise exception 'Progres harus antara 0%% dan 100%%.' using errcode = '22023';
  end if;

  select * into v_item
  from public.boq_items
  where id = p_id and project_id = p_project_id and workspace_id = p_workspace_id;

  if not found then
    raise exception 'Item BOQ tidak ditemukan.' using errcode = 'P0002';
  end if;

  v_old_progres := v_item.progres_persen;

  update public.boq_items
  set progres_persen = p_progres_persen,
      updated_at = clock_timestamp()
  where id = p_id;

  -- Rekalkulasi agregat progres proyek
  perform private.recalculate_project_boq_internal(p_workspace_id, p_project_id);

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    'UPDATE_BOQ_PROGRESS', 'boq_item', p_id, p_project_id,
    format('Update progres item BO %s [%s]: %s%% -> %s%%', v_item.uraian, v_item.kode, v_old_progres, p_progres_persen),
    v_old_progres::text, p_progres_persen::text,
    jsonb_build_object('kode', v_item.kode, 'bobot', v_item.bobot_persen)
  );

  return jsonb_build_object('success', true, 'message', format('Progres item "%s" diperbarui ke %s%%.', v_item.uraian, p_progres_persen));
end;
$$;

grant execute on function public.update_boq_item_progress(uuid, uuid, uuid, numeric) to authenticated;


-- 9. RPC: get_project_boq_summary
-- Rekapitulasi lengkap: Subtotal, PPN (persen), Pembulatan, Grand Total, Terbilang, dan Rekap Divisi
create or replace function public.get_project_boq_summary(
  p_workspace_id uuid,
  p_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proj record;
  v_subtotal bigint := 0;
  v_ppn_pct numeric(5,2) := 11.00;
  v_ppn_nominal bigint := 0;
  v_grand_total bigint := 0;
  v_terbilang text;
  v_terbilang_subtotal text;
  v_divisions jsonb := '[]'::jsonb;
  v_div record;
  v_items_count int := 0;
  v_progress_actual numeric(5,2) := 0;
begin
  select id, name, code, ppn_percent, progress_actual into v_proj
  from public.projects
  where id = p_project_id and workspace_id = p_workspace_id;

  if not found then
    raise exception 'Proyek tidak ditemukan.' using errcode = 'P0002';
  end if;

  v_ppn_pct := coalesce(v_proj.ppn_percent, 11.00);
  v_progress_actual := coalesce(v_proj.progress_actual, 0);

  -- Hitung total subtotal
  select coalesce(sum(jumlah_harga), 0), count(*)
  into v_subtotal, v_items_count
  from public.boq_items
  where project_id = p_project_id;

  -- Hitung PPN
  v_ppn_nominal := round(v_subtotal * (v_ppn_pct / 100.0))::bigint;
  v_grand_total := v_subtotal + v_ppn_nominal;

  -- Teks Terbilang
  v_terbilang := public.terbilang_rupiah(v_grand_total);
  v_terbilang_subtotal := public.terbilang_rupiah(v_subtotal);

  -- Rekapitulasi per divisi
  for v_div in
    select
      division_category,
      count(*) as item_count,
      coalesce(sum(jumlah_harga), 0)::bigint as total_divisi,
      case when v_subtotal > 0 then round((sum(jumlah_harga)::numeric * 100.0) / v_subtotal::numeric, 4) else 0 end as bobot_divisi
    from public.boq_items
    where project_id = p_project_id
    group by division_category
    order by
      case division_category
        when 'Pekerjaan Persiapan' then 1
        when 'Pekerjaan Struktur' then 2
        when 'Pekerjaan Arsitektur' then 3
        when 'Pekerjaan MEP' then 4
        else 5
      end
  loop
    v_divisions := v_divisions || jsonb_build_object(
      'kategori', v_div.division_category,
      'itemCount', v_div.item_count,
      'total', v_div.total_divisi,
      'bobotPersen', v_div.bobot_divisi
    );
  end loop;

  return jsonb_build_object(
    'projectId', p_project_id,
    'projectCode', v_proj.code,
    'projectName', v_proj.name,
    'totalItems', v_items_count,
    'subtotal', v_subtotal,
    'ppnPercent', v_ppn_pct,
    'ppnNominal', v_ppn_nominal,
    'grandTotal', v_grand_total,
    'terbilang', v_terbilang,
    'terbilangSubtotal', v_terbilang_subtotal,
    'progressActual', v_progress_actual,
    'divisions', v_divisions
  );
end;
$$;

grant execute on function public.get_project_boq_summary(uuid, uuid) to authenticated;


-- 10. RPC: update_project_ppn
create or replace function public.update_project_ppn(
  p_workspace_id uuid,
  p_project_id uuid,
  p_ppn_percent numeric
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

  if a.actor_role not in ('owner', 'finance', 'project_manager') then
    raise exception 'Peran "%" tidak berhak mengubah persentase PPN proyek.', a.actor_role using errcode = '42501';
  end if;

  if coalesce(p_ppn_percent, -1) < 0 or p_ppn_percent > 100 then
    raise exception 'Persentase PPN harus antara 0%% dan 100%%.' using errcode = '22023';
  end if;

  update public.projects
  set ppn_percent = p_ppn_percent,
      updated_at = clock_timestamp()
  where id = p_project_id and workspace_id = p_workspace_id;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    'UPDATE_PROJECT_PPN', 'project', p_project_id, p_project_id,
    format('Update tarif PPN proyek ke %s%% oleh %s', p_ppn_percent, a.actor_name),
    '', p_ppn_percent::text, '{}'
  );

  return jsonb_build_object('success', true, 'message', format('Tarif PPN proyek berhasil diubah ke %s%%.', p_ppn_percent));
end;
$$;

grant execute on function public.update_project_ppn(uuid, uuid, numeric) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Assertions (Verifikasi Migrasi 0011)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  assert exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'boq_items'
  ), 'Tabel boq_items tidak ditemukan';

  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'terbilang_rupiah'
  ), 'Fungsi terbilang_rupiah tidak ditemukan';

  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'upsert_boq_item'
  ), 'RPC upsert_boq_item tidak ditemukan';

  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_project_boq_summary'
  ), 'RPC get_project_boq_summary tidak ditemukan';

  -- Uji fungsi terbilang
  assert public.terbilang_rupiah(1250000) = 'Satu Juta Dua Ratus Lima Puluh Ribu Rupiah',
    format('Fungsi terbilang tidak cocok, hasil: "%s"', public.terbilang_rupiah(1250000));

  raise notice 'Migration 0011 (boq_items) assertions lulus.';
end;
$$;
