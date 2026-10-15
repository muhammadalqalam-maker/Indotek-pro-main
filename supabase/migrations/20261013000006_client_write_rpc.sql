-- ============================================================================
-- INDOTEK PRO — MIGRATION 0006: CLIENT-SAFE WRITE RPCs
-- ============================================================================
-- Seluruh update dari klien yang sebelumnya menyentuh kolom uang / status /
-- derived values secara langsung kini dialihkan ke RPC security-definer.
-- Klien tidak boleh menulis langsung ke kolom sensitif.
-- ============================================================================

-- 1. RPC: update_project_meta
--    Memperbarui kolom deskriptif proyek (bukan kolom uang/derived).
--    Kolom approved_budget, actual_cost, progress_*, completed_milestones,
--    total_milestones, status, schedule_status TIDAK dapat diubah melalui RPC ini;
--    mereka hanya berubah via workflow RPC lain (create_project, sign_off_milestone,
--    approve_budget_revision, dst).
create or replace function public.update_project_meta(
  p_workspace_id  uuid,
  p_project_id    uuid,
  p_name          text    default null,
  p_client        text    default null,
  p_category      text    default null,
  p_location      text    default null,
  p_project_manager text  default null,
  p_site_engineer text    default null,
  p_contract_value bigint default null,
  p_start_date    date    default null,
  p_target_end_date date  default null,
  p_image_url     text    default null,
  p_description   text    default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a      record;
  proj   record;
  payload jsonb := '{}';
begin
  select * into a from private.require_actor(p_workspace_id);

  if a.actor_role not in ('owner', 'project_manager') then
    raise exception 'Peran "%" tidak berwenang mengubah data proyek. Diperlukan peran Project Manager atau Owner.',
      a.actor_role using errcode = '42501';
  end if;

  select * into proj
    from public.projects
   where id = p_project_id
     and workspace_id = p_workspace_id
     for update;

  if not found then
    raise exception 'Proyek tidak ditemukan.' using errcode = 'P0002';
  end if;

  if not private.is_assigned(p_workspace_id, p_project_id) then
    raise exception 'Akses ditolak: Anda tidak ditugaskan pada proyek ini.' using errcode = '42501';
  end if;

  -- Hanya update kolom yang dikirim (non-null)
  update public.projects set
    name             = coalesce(p_name,             name),
    client           = coalesce(p_client,           client),
    category         = coalesce(p_category,         category),
    location         = coalesce(p_location,         location),
    project_manager  = coalesce(p_project_manager,  project_manager),
    site_engineer    = coalesce(p_site_engineer,     site_engineer),
    contract_value   = coalesce(p_contract_value,   contract_value),
    start_date       = coalesce(p_start_date,       start_date),
    target_end_date  = coalesce(p_target_end_date,  target_end_date),
    image_url        = coalesce(p_image_url,        image_url),
    description      = coalesce(p_description,      description)
  where id = p_project_id;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    'UPDATE_PROJECT', 'project', p_project_id, p_project_id,
    format('Metadata proyek "%s" diperbarui oleh %s.', proj.name, a.actor_name),
    '', '', jsonb_build_object('updatedFields', array_remove(array[
      case when p_name            is not null then 'name'             end,
      case when p_client          is not null then 'client'           end,
      case when p_category        is not null then 'category'         end,
      case when p_location        is not null then 'location'         end,
      case when p_project_manager is not null then 'project_manager'  end,
      case when p_site_engineer   is not null then 'site_engineer'    end,
      case when p_contract_value  is not null then 'contract_value'   end,
      case when p_start_date      is not null then 'start_date'       end,
      case when p_target_end_date is not null then 'target_end_date'  end,
      case when p_image_url       is not null then 'image_url'        end,
      case when p_description     is not null then 'description'      end
    ], null))
  );

  return jsonb_build_object(
    'success', true,
    'projectId', p_project_id,
    'message', format('Proyek "%s" berhasil diperbarui.', coalesce(p_name, proj.name))
  );
end;
$$;

grant execute on function public.update_project_meta(
  uuid, uuid, text, text, text, text, text, text, bigint, date, date, text, text
) to authenticated;


-- 2. RPC: update_budget_line_meta
--    Memperbarui kolom deskriptif budget_line (bukan planned_amount / actual_amount).
--    Perubahan planned_amount: lewat alur budget_revision.
--    Perubahan actual_amount:  otomatis dari PO/petty_cash (approve_purchase_order / disburse_petty_cash).
create or replace function public.update_budget_line_meta(
  p_workspace_id  uuid,
  p_project_id    uuid,
  p_line_id       uuid,
  p_code          text    default null,
  p_division_name text    default null,
  p_category      text    default null,
  p_unit          text    default null,
  p_volume        numeric default null,
  p_unit_rate     numeric default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a    record;
  line record;
begin
  select * into a from private.require_actor(p_workspace_id);

  if a.actor_role not in ('owner', 'project_manager', 'quantity_surveyor') then
    raise exception 'Peran "%" tidak berwenang mengubah baris RAB.', a.actor_role using errcode = '42501';
  end if;

  if not private.is_assigned(p_workspace_id, p_project_id) then
    raise exception 'Akses ditolak: Anda tidak ditugaskan pada proyek ini.' using errcode = '42501';
  end if;

  select * into line
    from public.budget_lines
   where id = p_line_id
     and project_id = p_project_id
     and workspace_id = p_workspace_id
     for update;

  if not found then
    raise exception 'Baris RAB tidak ditemukan.' using errcode = 'P0002';
  end if;

  update public.budget_lines set
    code          = coalesce(p_code,          code),
    division_name = coalesce(p_division_name, division_name),
    category      = coalesce(p_category,      category),
    unit          = coalesce(p_unit,          unit),
    volume        = coalesce(p_volume,        volume),
    unit_rate     = coalesce(p_unit_rate,     unit_rate)
  where id = p_line_id;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    'UPDATE_BUDGET_LINE', 'budget_line', p_line_id, p_project_id,
    format('Metadata baris RAB "%s" diperbarui.', coalesce(p_code, line.code)),
    '', '', '{}'
  );

  return jsonb_build_object('success', true, 'lineId', p_line_id,
    'message', format('Baris RAB "%s" berhasil diperbarui.', coalesce(p_code, line.code)));
end;
$$;

grant execute on function public.update_budget_line_meta(
  uuid, uuid, uuid, text, text, text, text, numeric, numeric
) to authenticated;


-- 3. RPC: save_workspace_settings
--    Menyimpan pengaturan perusahaan (settings JSONB + name).
--    Klien tidak boleh menulis updated_at langsung.
create or replace function public.save_workspace_settings(
  p_workspace_id uuid,
  p_name         text    default null,
  p_settings     jsonb   default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a record;
begin
  select * into a from private.require_actor(p_workspace_id);

  if a.actor_role not in ('owner') then
    raise exception 'Hanya Owner yang dapat mengubah pengaturan perusahaan.' using errcode = '42501';
  end if;

  update public.workspaces
     set name     = coalesce(p_name,     name),
         settings = coalesce(p_settings, settings)
   where id = p_workspace_id;

  if not found then
    raise exception 'Workspace tidak ditemukan.' using errcode = 'P0002';
  end if;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    'UPDATE_WORKSPACE_SETTINGS', 'workspace', p_workspace_id, null,
    format('Pengaturan workspace diperbarui oleh %s.', a.actor_name),
    '', '', '{}'
  );

  return jsonb_build_object('success', true, 'message', 'Pengaturan berhasil disimpan.');
end;
$$;

grant execute on function public.save_workspace_settings(uuid, text, jsonb) to authenticated;


-- 4. Pastikan logAuditEvent dari klien tidak perlu insert langsung:
--    Klien cukup memanggil write_audit melalui server-side trigger (sudah ada).
--    Untuk kasus manual logging dari klien via RPC:
create or replace function public.log_audit_event(
  p_workspace_id uuid,
  p_action       text,
  p_record_type  text,
  p_record_id    uuid    default null,
  p_project_id   uuid    default null,
  p_details      text    default '',
  p_previous     text    default '',
  p_new          text    default '',
  p_metadata     jsonb   default '{}'
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  a      record;
  new_id uuid;
begin
  select * into a from private.require_actor(p_workspace_id);

  insert into public.audit_logs (
    workspace_id, action, record_type, record_id, actor_id, actor_name, actor_role,
    project_id, details, previous_value, new_value, metadata
  ) values (
    p_workspace_id, p_action, p_record_type, p_record_id, a.uid, a.actor_name, a.actor_role,
    p_project_id, p_details, p_previous, p_new, p_metadata
  ) returning id into new_id;

  return new_id;
end;
$$;

grant execute on function public.log_audit_event(
  uuid, text, text, uuid, uuid, text, text, text, jsonb
) to authenticated;


-- 5. Assertion: pastikan fungsi baru dapat dipanggil dan kolom sensitif tidak bisa ditulis langsung
do $$
begin
  -- Verifikasi fungsi terdaftar
  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'update_project_meta'
  ), 'RPC update_project_meta tidak ditemukan';

  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'update_budget_line_meta'
  ), 'RPC update_budget_line_meta tidak ditemukan';

  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'save_workspace_settings'
  ), 'RPC save_workspace_settings tidak ditemukan';

  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'log_audit_event'
  ), 'RPC log_audit_event tidak ditemukan';

  -- Verifikasi kolom sensitif budget_lines tidak ada di column_privileges untuk authenticated update
  assert not exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'budget_lines'
      and grantee = 'authenticated'
      and privilege_type = 'UPDATE'
      and column_name in ('planned_amount', 'actual_amount', 'variance_amount', 'variance_percent', 'status', 'workspace_id', 'project_id')
  ), 'Kolom sensitif budget_lines masih bisa di-UPDATE langsung oleh authenticated!';

  -- Verifikasi kolom progress milestones tidak ada di column_privileges untuk authenticated update
  assert not exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'milestones'
      and grantee = 'authenticated'
      and privilege_type = 'UPDATE'
      and column_name in ('progress', 'status', 'signed_off_by', 'signed_off_at', 'bast_ref', 'actual_date')
  ), 'Kolom sensitif milestones masih bisa di-UPDATE langsung oleh authenticated!';

  raise notice 'Migration 0006 assertions lulus: semua RPC terdaftar, kolom sensitif terlindungi.';
end;
$$;
