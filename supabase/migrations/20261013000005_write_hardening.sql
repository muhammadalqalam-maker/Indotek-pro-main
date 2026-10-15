-- ============================================================================
-- INDOTEK PRO — MIGRATION 0005: WRITE HARDENING & AUDIT TRIGGER INTEGRATION
-- ============================================================================

-- 1. Cabut hak update kolom sensitif pada budget_lines dari authenticated.
-- planned_amount hanya dapat berubah via RPC budget revision.
-- actual_amount hanya dapat berubah via RPC PO/Petty Cash.
-- status, workspace_id, project_id tidak boleh diubah langsung.
revoke update on public.budget_lines from authenticated;
grant update (code, division_name, category, unit, volume, unit_rate)
  on public.budget_lines to authenticated;

-- 2. Milestones: Cabut grant update progress dari authenticated.
-- Progress 0..99 hanya lewat RPC update_milestone_progress.
-- Progress 100 / Selesai wajib melalui RPC sign_off_milestone dengan BAST.
revoke update on public.milestones from authenticated;
grant update (title, wbs_code, planned_date, weight_percent)
  on public.milestones to authenticated;

-- RPC: update_milestone_progress (Maks 99% tanpa BAST)
create or replace function public.update_milestone_progress(
  p_workspace_id uuid,
  p_milestone_id uuid,
  p_progress numeric
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a record; ms record; v_status text;
begin
  select * into a from private.require_actor(p_workspace_id);

  if p_progress < 0 then
    raise exception 'Progress milestone tidak boleh negatif.' using errcode = '22003';
  end if;

  if p_progress >= 100 then
    raise exception 'Progress 100%% hanya dapat disahkan melalui sign-off BAST resmi (sign_off_milestone).' using errcode = '22003';
  end if;

  select * into ms from public.milestones
   where id = p_milestone_id and workspace_id = p_workspace_id
     for update;
  if not found then
    raise exception 'Milestone tidak ditemukan.' using errcode = 'P0002';
  end if;

  if not private.is_assigned(p_workspace_id, ms.project_id) then
    raise exception 'Akses ditolak: Anda tidak ditugaskan pada proyek ini.' using errcode = '42501';
  end if;

  if ms.status = 'Selesai' then
    raise exception 'Milestone yang telah berstatus Selesai tidak dapat diubah progresnya.' using errcode = '42501';
  end if;

  if p_progress > 0 then
    v_status := 'Berjalan';
  else
    v_status := 'Menunggu';
  end if;

  update public.milestones
     set progress = p_progress,
         status = v_status
   where id = ms.id;

  return jsonb_build_object(
    'success', true,
    'milestoneId', ms.id,
    'progress', p_progress,
    'status', v_status,
    'message', format('Progress milestone "%s" berhasil diperbarui menjadi %s%%.', ms.title, p_progress)
  );
end;
$$;

grant execute on function public.update_milestone_progress(uuid, uuid, numeric) to authenticated;

-- 3. Dukungan doc_counters untuk PRJ pada private.next_doc_number
create or replace function private.next_doc_number(
  p_ws uuid, p_type text, p_code text default 'IND',
  p_year int default extract(year from (now() at time zone 'Asia/Makassar'))::int)
returns text language plpgsql security definer set search_path = '' as $$
declare n int; code text;
begin
  if p_type not in ('PO','ADD-REV','LHP','KAS','ADJ','PRJ') then
    raise exception 'Tipe dokumen tidak dikenal: %', p_type;
  end if;
  code := coalesce(nullif(upper(substr(regexp_replace(coalesce(p_code,''), '[^A-Za-z0-9]', '', 'g'), 1, 4)), ''), 'IND');
  insert into public.doc_counters as c (workspace_id, year, doc_type, last_number)
  values (p_ws, p_year, p_type, 1)
  on conflict (workspace_id, year, doc_type)
  do update set last_number = c.last_number + 1, updated_at = now()
  returning c.last_number into n;
  if p_type = 'PO'      then return format('PO-%s-%s-%s', p_year, code, lpad(n::text, 4, '0')); end if;
  if p_type = 'ADD-REV' then return format('ADD-REV-%s/%s/%s', lpad(n::text, 2, '0'), code, p_year); end if;
  if p_type = 'LHP'     then return format('LHP-%s-%s', p_year, lpad(n::text, 4, '0')); end if;
  if p_type = 'KAS'     then return format('KAS-%s-%s-%s', code, p_year, lpad(n::text, 4, '0')); end if;
  if p_type = 'PRJ'     then return format('PRJ-%s-%s', p_year, lpad(n::text, 4, '0')); end if;
  return format('ADJ-%s-%s-%s', code, p_year, lpad(n::text, 4, '0'));
end $$;

-- 4. RPC create_project: Pembuatan proyek dengan nomor kode otomatis & bebas tabrakan
create or replace function public.create_project(
  p_workspace_id uuid,
  p_name text,
  p_client text default '',
  p_category text default 'Komersial',
  p_location text default '',
  p_project_manager text default '',
  p_site_engineer text default '',
  p_contract_value bigint default 0,
  p_approved_budget bigint default 0,
  p_start_date date default null,
  p_target_end_date date default null,
  p_status text default 'Pra-Konstruksi',
  p_image_url text default null,
  p_description text default '',
  p_code text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a record;
  v_code text;
  v_proj_id uuid;
begin
  select * into a from private.require_actor(p_workspace_id);

  if a.actor_role not in ('owner', 'project_manager') then
    raise exception 'Peran "%" tidak berwenang membuat proyek baru. Diperlukan peran Project Manager atau Owner.', a.actor_role using errcode = '42501';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'Nama proyek wajib diisi.' using errcode = '22023';
  end if;

  if coalesce(trim(p_code), '') <> '' then
    v_code := trim(p_code);
  else
    v_code := private.next_doc_number(p_workspace_id, 'PRJ');
  end if;

  insert into public.projects (
    workspace_id,
    code,
    name,
    client,
    category,
    location,
    project_manager,
    site_engineer,
    contract_value,
    approved_budget,
    actual_cost,
    start_date,
    target_end_date,
    progress_actual,
    progress_planned,
    status,
    schedule_status,
    image_url,
    description,
    created_by
  ) values (
    p_workspace_id,
    v_code,
    trim(p_name),
    coalesce(trim(p_client), ''),
    coalesce(p_category, 'Komersial'),
    coalesce(trim(p_location), ''),
    coalesce(trim(p_project_manager), ''),
    coalesce(trim(p_site_engineer), ''),
    coalesce(p_contract_value, 0),
    coalesce(p_approved_budget, 0),
    0,
    p_start_date,
    p_target_end_date,
    0,
    0,
    coalesce(p_status, 'Pra-Konstruksi'),
    'Tepat Waktu',
    p_image_url,
    coalesce(p_description, ''),
    a.uid
  )
  returning id into v_proj_id;

  -- Otomatis masukkan pembuat ke project_members
  insert into public.project_members (workspace_id, project_id, user_id)
  values (p_workspace_id, v_proj_id, a.uid)
  on conflict do nothing;

  return jsonb_build_object(
    'success', true,
    'id', v_proj_id,
    'code', v_code,
    'name', trim(p_name),
    'message', format('Proyek "%s" berhasil dibuat dengan kode %s.', trim(p_name), v_code)
  );
end;
$$;

grant execute on function public.create_project(
  uuid, text, text, text, text, text, text, bigint, bigint, date, date, text, text, text, text
) to authenticated;

-- 5. Trigger generik audit private.audit_row() (Security Definer)
create or replace function private.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id uuid;
  v_actor_name text := 'Sistem';
  v_actor_role public.app_role;
  v_ws_id uuid;
  v_proj_id uuid;
  v_record_id uuid;
  v_action text;
  old_json jsonb;
  new_json jsonb;
  changed_cols jsonb := '[]'::jsonb;
begin
  v_actor_id := auth.uid();

  if TG_OP = 'DELETE' then
    old_json := to_jsonb(OLD);
    new_json := null;
    v_action := 'DELETE_' || upper(TG_TABLE_NAME);
    select coalesce(jsonb_agg(k), '[]'::jsonb) into changed_cols from jsonb_object_keys(old_json) k;
  elsif TG_OP = 'INSERT' then
    old_json := null;
    new_json := to_jsonb(NEW);
    v_action := 'CREATE_' || upper(TG_TABLE_NAME);
    select coalesce(jsonb_agg(k), '[]'::jsonb) into changed_cols from jsonb_object_keys(new_json) k;
  elsif TG_OP = 'UPDATE' then
    old_json := to_jsonb(OLD);
    new_json := to_jsonb(NEW);
    v_action := 'UPDATE_' || upper(TG_TABLE_NAME);
    select coalesce(jsonb_agg(key), '[]'::jsonb)
      into changed_cols
      from (
        select key
          from jsonb_each(new_json)
         where new_json->key is distinct from old_json->key
           and key not in ('updated_at')
      ) diff;
    -- Abaikan jika hanya updated_at yang berubah
    if changed_cols is null or jsonb_array_length(changed_cols) = 0 then
      return null;
    end if;
  end if;

  -- Ekstraksi workspace_id
  if TG_TABLE_NAME = 'workspaces' then
    v_ws_id := case when TG_OP = 'DELETE' then OLD.id else NEW.id end;
  else
    v_ws_id := case when TG_OP = 'DELETE' then OLD.workspace_id else NEW.workspace_id end;
  end if;

  -- Ekstraksi project_id
  if TG_TABLE_NAME = 'projects' then
    v_proj_id := case when TG_OP = 'DELETE' then OLD.id else NEW.id end;
  elsif TG_TABLE_NAME in ('budget_lines', 'milestones', 'wbs_items', 'project_members') then
    v_proj_id := case when TG_OP = 'DELETE' then OLD.project_id else NEW.project_id end;
  elsif TG_TABLE_NAME = 'materials' then
    v_proj_id := case when TG_OP = 'DELETE' then OLD.allocated_project_id else NEW.allocated_project_id end;
  else
    v_proj_id := null;
  end if;

  -- Ekstraksi record_id
  if TG_TABLE_NAME in ('workspace_members', 'project_members') then
    v_record_id := case when TG_OP = 'DELETE' then OLD.user_id else NEW.user_id end;
  else
    v_record_id := case when TG_OP = 'DELETE' then OLD.id else NEW.id end;
  end if;

  -- Identitas actor
  if v_actor_id is not null then
    select coalesce(p.full_name, u.email, 'Pengguna')
      into v_actor_name
      from auth.users u
      left join public.profiles p on p.id = u.id
     where u.id = v_actor_id;

    if v_ws_id is not null then
      select m.role
        into v_actor_role
        from public.workspace_members m
       where m.workspace_id = v_ws_id
         and m.user_id = v_actor_id;
    end if;
  end if;

  if v_ws_id is not null then
    insert into public.audit_logs (
      workspace_id,
      action,
      record_type,
      record_id,
      actor_id,
      actor_name,
      actor_role,
      project_id,
      details,
      previous_value,
      new_value,
      metadata
    ) values (
      v_ws_id,
      v_action,
      TG_TABLE_NAME,
      v_record_id,
      v_actor_id,
      coalesce(v_actor_name, 'Sistem'),
      v_actor_role,
      v_proj_id,
      format('%s pada %s: %s', TG_OP, TG_TABLE_NAME, coalesce(changed_cols::text, '[]')),
      coalesce(old_json::text, ''),
      coalesce(new_json::text, ''),
      jsonb_build_object(
        'table', TG_TABLE_NAME,
        'operation', TG_OP,
        'changed_columns', coalesce(changed_cols, '[]'::jsonb)
      )
    );
  end if;

  return null;
end;
$$;

-- Pasang trigger pada projects, budget_lines, milestones, wbs_items, materials, workspace_members, project_members, workspaces
drop trigger if exists trg_audit_projects on public.projects;
create trigger trg_audit_projects after insert or update or delete on public.projects
  for each row execute function private.audit_row();

drop trigger if exists trg_audit_budget_lines on public.budget_lines;
create trigger trg_audit_budget_lines after insert or update or delete on public.budget_lines
  for each row execute function private.audit_row();

drop trigger if exists trg_audit_milestones on public.milestones;
create trigger trg_audit_milestones after insert or update or delete on public.milestones
  for each row execute function private.audit_row();

drop trigger if exists trg_audit_wbs_items on public.wbs_items;
create trigger trg_audit_wbs_items after insert or update or delete on public.wbs_items
  for each row execute function private.audit_row();

drop trigger if exists trg_audit_materials on public.materials;
create trigger trg_audit_materials after insert or update or delete on public.materials
  for each row execute function private.audit_row();

drop trigger if exists trg_audit_workspace_members on public.workspace_members;
create trigger trg_audit_workspace_members after insert or update or delete on public.workspace_members
  for each row execute function private.audit_row();

drop trigger if exists trg_audit_project_members on public.project_members;
create trigger trg_audit_project_members after insert or update or delete on public.project_members
  for each row execute function private.audit_row();

drop trigger if exists trg_audit_workspaces on public.workspaces;
create trigger trg_audit_workspaces after insert or update or delete on public.workspaces
  for each row execute function private.audit_row();
