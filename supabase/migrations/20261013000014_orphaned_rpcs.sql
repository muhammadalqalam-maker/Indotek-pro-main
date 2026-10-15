-- ============================================================================
-- INDOTEK PRO — MIGRATION 0014: ORPHANED RPC IMPLEMENTATIONS
-- ============================================================================
-- Implements 10 missing RPC functions called by client code but not defined
-- in previous migrations. Discovered via audit-rpc-catalog script.
-- ============================================================================

-- 1. delete_project: Remove a project (soft-delete via is_archived)
create or replace function public.delete_project(
  p_workspace_id uuid,
  p_project_id   uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a      record;
  proj   record;
begin
  select * into a from private.require_actor(p_workspace_id);
  
  if a.actor_role not in ('owner', 'project_manager') then
    raise exception 'Peran "%" tidak berwenang menghapus proyek.', a.actor_role using errcode = '42501';
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

  -- Soft delete: mark as archived
  update public.projects set is_archived = true where id = p_project_id;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    'DELETE_PROJECT', 'project', p_project_id, p_project_id,
    format('Proyek "%s" dihapus oleh %s.', proj.name, a.actor_name),
    '', '', '{}'
  );

  return jsonb_build_object(
    'success', true,
    'projectId', p_project_id,
    'message', format('Proyek "%s" berhasil dihapus.', proj.name)
  );
end;
$$;

grant execute on function public.delete_project(uuid, uuid) to authenticated;


-- 2. delete_budget_line: Remove budget line (soft-delete or hard delete)
create or replace function public.delete_budget_line(
  p_workspace_id uuid,
  p_project_id   uuid,
  p_line_id      uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a    record;
  line record;
begin
  select * into a from private.require_actor(p_workspace_id);
  
  if a.actor_role not in ('owner', 'project_manager', 'quantity_surveyor') then
    raise exception 'Peran "%" tidak berwenang menghapus baris RAB.', a.actor_role using errcode = '42501';
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

  -- Hard delete
  delete from public.budget_lines where id = p_line_id;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    'DELETE_BUDGET_LINE', 'budget_line', p_line_id, p_project_id,
    format('Baris RAB "%s" dihapus.', line.code),
    '', '', '{}'
  );

  return jsonb_build_object(
    'success', true,
    'lineId', p_line_id,
    'message', format('Baris RAB "%s" berhasil dihapus.', line.code)
  );
end;
$$;

grant execute on function public.delete_budget_line(uuid, uuid, uuid) to authenticated;


-- 3. update_material_meta: Update descriptive fields of material
create or replace function public.update_material_meta(
  p_workspace_id       uuid,
  p_material_id        uuid,
  p_code               text    default null,
  p_name               text    default null,
  p_specification      text    default null,
  p_category           text    default null,
  p_unit               text    default null,
  p_min_stock          numeric default null,
  p_warehouse_location text    default null,
  p_primary_supplier   text    default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a   record;
  mat record;
begin
  select * into a from private.require_actor(p_workspace_id);
  
  if a.actor_role not in ('owner', 'warehouse_manager', 'quantity_surveyor') then
    raise exception 'Peran "%" tidak berwenang mengubah katalog material.', a.actor_role using errcode = '42501';
  end if;

  select * into mat
    from public.materials
   where id = p_material_id
     and workspace_id = p_workspace_id
     for update;

  if not found then
    raise exception 'Material tidak ditemukan.' using errcode = 'P0002';
  end if;

  update public.materials set
    code               = coalesce(p_code,               code),
    name               = coalesce(p_name,               name),
    specification      = coalesce(p_specification,      specification),
    category           = coalesce(p_category,           category),
    unit               = coalesce(p_unit,               unit),
    min_stock          = coalesce(p_min_stock,          min_stock),
    warehouse_location = coalesce(p_warehouse_location, warehouse_location),
    primary_supplier   = coalesce(p_primary_supplier,   primary_supplier)
  where id = p_material_id;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    'UPDATE_MATERIAL', 'material', p_material_id, null,
    format('Metadata material "%s" diperbarui.', coalesce(p_code, mat.code)),
    '', '', '{}'
  );

  return jsonb_build_object(
    'success', true,
    'materialId', p_material_id,
    'message', format('Material "%s" berhasil diperbarui.', coalesce(p_code, mat.code))
  );
end;
$$;

grant execute on function public.update_material_meta(
  uuid, uuid, text, text, text, text, text, numeric, text, text
) to authenticated;


-- 4. create_stock_mutation: Record stock IN/OUT transaction
create or replace function public.create_stock_mutation(
  p_workspace_id uuid,
  p_material_id  uuid,
  p_type         text,
  p_quantity     numeric,
  p_reference_no text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a      record;
  mut_id uuid;
begin
  select * into a from private.require_actor(p_workspace_id);
  
  if a.actor_role not in ('owner', 'warehouse_manager') then
    raise exception 'Peran "%" tidak berwenang mencatat mutasi stok.', a.actor_role using errcode = '42501';
  end if;

  if p_type not in ('IN', 'OUT') then
    raise exception 'Tipe mutasi harus IN atau OUT.' using errcode = '22P02';
  end if;

  insert into public.stock_mutations (
    workspace_id, material_id, type, quantity, reference_no, created_by
  ) values (
    p_workspace_id, p_material_id, p_type, p_quantity, p_reference_no, a.uid
  ) returning id into mut_id;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    'CREATE_STOCK_MUTATION', 'stock_mutation', mut_id, null,
    format('Mutasi stok %s qty %s dicatat (ref: %s).', p_type, p_quantity, coalesce(p_reference_no, '-')),
    '', '', '{}'
  );

  return jsonb_build_object(
    'success', true,
    'mutationId', mut_id,
    'message', 'Mutasi stok berhasil dicatat.'
  );
end;
$$;

grant execute on function public.create_stock_mutation(
  uuid, uuid, text, numeric, text
) to authenticated;


-- 5. update_project: Actor-aware project update (for audit trail)
create or replace function public.update_project(
  p_workspace_id uuid,
  p_project_id   uuid,
  p_updates      jsonb,
  p_actor_name   text,
  p_actor_role   text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a      record;
  proj   record;
  old_val jsonb;
begin
  select * into a from private.require_actor(p_workspace_id);
  
  if a.actor_role not in ('owner', 'project_manager') then
    raise exception 'Peran "%" tidak berwenang mengubah data proyek.', a.actor_role using errcode = '42501';
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

  -- Store old values for audit
  old_val := jsonb_build_object(
    'name', proj.name,
    'client', proj.client,
    'category', proj.category,
    'location', proj.location,
    'description', proj.description
  );

  -- Apply whitelisted updates only
  update public.projects set
    name             = coalesce(p_updates->>'name', name),
    client           = coalesce(p_updates->>'client', client),
    category         = coalesce(p_updates->>'category', category),
    location         = coalesce(p_updates->>'location', location),
    description      = coalesce(p_updates->>'description', description)
  where id = p_project_id;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    'UPDATE_PROJECT', 'project', p_project_id, p_project_id,
    format('Proyek "%s" diperbarui oleh %s.', proj.name, a.actor_name),
    old_val::text, (jsonb_build_object(
      'name', proj.name,
      'client', proj.client,
      'category', proj.category,
      'location', proj.location,
      'description', proj.description
    ))::text, p_updates
  );

  return jsonb_build_object(
    'success', true,
    'projectId', p_project_id,
    'message', 'Proyek berhasil diperbarui.'
  );
end;
$$;

grant execute on function public.update_project(uuid, uuid, jsonb, text, text) to authenticated;


-- 6. add_budget_line: Add budget line with actor info
create or replace function public.add_budget_line(
  p_workspace_id uuid,
  p_project_id   uuid,
  p_line_data    jsonb,
  p_actor_name   text,
  p_actor_role   text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  a      record;
  line_id uuid;
begin
  select * into a from private.require_actor(p_workspace_id);
  
  if a.actor_role not in ('owner', 'project_manager', 'quantity_surveyor') then
    raise exception 'Peran "%" tidak berwenang membuat baris RAB.', a.actor_role using errcode = '42501';
  end if;

  if not private.is_assigned(p_workspace_id, p_project_id) then
    raise exception 'Akses ditolak: Anda tidak ditugaskan pada proyek ini.' using errcode = '42501';
  end if;

  line_id := gen_random_uuid();
  
  insert into public.budget_lines (
    id, workspace_id, project_id,
    code, division_name, category, unit, volume, unit_rate,
    created_by
  ) values (
    line_id, p_workspace_id, p_project_id,
    p_line_data->>'code',
    p_line_data->>'division_name',
    p_line_data->>'category',
    p_line_data->>'unit',
    (p_line_data->>'volume')::numeric,
    (p_line_data->>'unit_rate')::numeric,
    a.uid
  );

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    'CREATE_BUDGET_LINE', 'budget_line', line_id, p_project_id,
    format('Baris RAB "%s" dibuat.', p_line_data->>'code'),
    '', (p_line_data)::text, p_line_data
  );

  return line_id;
end;
$$;

grant execute on function public.add_budget_line(uuid, uuid, jsonb, text, text) to authenticated;


-- 7. update_budget_line: Update budget line with actor info
create or replace function public.update_budget_line(
  p_workspace_id uuid,
  p_project_id   uuid,
  p_line_id      uuid,
  p_updates      jsonb,
  p_actor_name   text,
  p_actor_role   text
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
    code          = coalesce(p_updates->>'code', code),
    division_name = coalesce(p_updates->>'division_name', division_name),
    category      = coalesce(p_updates->>'category', category),
    unit          = coalesce(p_updates->>'unit', unit),
    volume        = coalesce((p_updates->>'volume')::numeric, volume),
    unit_rate     = coalesce((p_updates->>'unit_rate')::numeric, unit_rate)
  where id = p_line_id;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    'UPDATE_BUDGET_LINE', 'budget_line', p_line_id, p_project_id,
    format('Baris RAB "%s" diperbarui.', line.code),
    '', '', p_updates
  );

  return jsonb_build_object('success', true, 'lineId', p_line_id);
end;
$$;

grant execute on function public.update_budget_line(
  uuid, uuid, uuid, jsonb, text, text
) to authenticated;


-- 8. update_wbs_progress: Update WBS item progress
create or replace function public.update_wbs_progress(
  p_workspace_id   uuid,
  p_project_id     uuid,
  p_wbs_id         uuid,
  p_progress_persen numeric,
  p_actor_name     text,
  p_actor_role     text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a   record;
  wbs record;
begin
  select * into a from private.require_actor(p_workspace_id);
  
  if a.actor_role not in ('owner', 'project_manager', 'site_engineer', 'site_supervisor') then
    raise exception 'Peran "%" tidak berwenang mengubah progres WBS.', a.actor_role using errcode = '42501';
  end if;

  if not private.is_assigned(p_workspace_id, p_project_id) then
    raise exception 'Akses ditolak: Anda tidak ditugaskan pada proyek ini.' using errcode = '42501';
  end if;

  select * into wbs
    from public.wbs_items
   where id = p_wbs_id
     and project_id = p_project_id
     and workspace_id = p_workspace_id
     for update;

  if not found then
    raise exception 'Item WBS tidak ditemukan.' using errcode = 'P0002';
  end if;

  if p_progress_persen < 0 or p_progress_persen > 100 then
    raise exception 'Progres harus antara 0-100 persen.' using errcode = '22P02';
  end if;

  update public.wbs_items set
    progress = p_progress_persen,
    updated_at = now()
  where id = p_wbs_id;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    'UPDATE_WBS_PROGRESS', 'wbs_item', p_wbs_id, p_project_id,
    format('Progres WBS "%s" diperbarui ke %s%%.', wbs.name, p_progress_persen),
    wbs.progress::text, p_progress_persen::text, jsonb_build_object('progress_persen', p_progress_persen)
  );

  return jsonb_build_object(
    'success', true,
    'wbsId', p_wbs_id,
    'progress', p_progress_persen
  );
end;
$$;

grant execute on function public.update_wbs_progress(
  uuid, uuid, uuid, numeric, text, text
) to authenticated;


-- 9. add_team_member: Add team member to workspace
create or replace function public.add_team_member(
  p_workspace_id     uuid,
  p_name             text,
  p_email            text,
  p_role             text,
  p_assigned_projects uuid[] default null,
  p_status           text    default 'active',
  p_actor_name       text,
  p_actor_role       text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  a      record;
  mem_id uuid;
begin
  select * into a from private.require_actor(p_workspace_id);
  
  if a.actor_role not in ('owner') then
    raise exception 'Hanya Owner yang dapat menambah anggota tim.' using errcode = '42501';
  end if;

  if p_role not in ('owner', 'project_manager', 'site_engineer', 'site_supervisor', 
                     'quantity_surveyor', 'warehouse_manager', 'accountant', 'admin') then
    raise exception 'Peran "%" tidak valid.', p_role using errcode = '22P02';
  end if;

  mem_id := gen_random_uuid();

  insert into public.team_members (
    id, workspace_id, name, email, role, assigned_projects, status
  ) values (
    mem_id, p_workspace_id, p_name, p_email, p_role, 
    coalesce(p_assigned_projects, array[]::uuid[]), 
    p_status
  );

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    'ADD_TEAM_MEMBER', 'team_member', mem_id, null,
    format('Anggota tim "%s" (%s) ditambahkan sebagai %s.', p_name, p_email, p_role),
    '', '', jsonb_build_object('role', p_role, 'email', p_email)
  );

  return mem_id;
end;
$$;

grant execute on function public.add_team_member(
  uuid, text, text, text, uuid[], text, text, text
) to authenticated;


-- 10. update_team_member: Update team member details
create or replace function public.update_team_member(
  p_workspace_id     uuid,
  p_member_id        uuid,
  p_updates          jsonb,
  p_actor_name       text,
  p_actor_role       text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a   record;
  mem record;
begin
  select * into a from private.require_actor(p_workspace_id);
  
  if a.actor_role not in ('owner') then
    raise exception 'Hanya Owner yang dapat mengubah anggota tim.' using errcode = '42501';
  end if;

  select * into mem
    from public.team_members
   where id = p_member_id
     and workspace_id = p_workspace_id
     for update;

  if not found then
    raise exception 'Anggota tim tidak ditemukan.' using errcode = 'P0002';
  end if;

  update public.team_members set
    name               = coalesce(p_updates->>'name', name),
    email              = coalesce(p_updates->>'email', email),
    role               = coalesce(p_updates->>'role', role),
    assigned_projects  = coalesce((p_updates->'assigned_projects')::uuid[], assigned_projects),
    status             = coalesce(p_updates->>'status', status)
  where id = p_member_id;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    'UPDATE_TEAM_MEMBER', 'team_member', p_member_id, null,
    format('Anggota tim "%s" diperbarui oleh %s.', mem.name, a.actor_name),
    '', '', p_updates
  );

  return jsonb_build_object(
    'success', true,
    'memberId', p_member_id,
    'message', format('Anggota tim "%s" berhasil diperbarui.', coalesce(p_updates->>'name', mem.name))
  );
end;
$$;

grant execute on function public.update_team_member(
  uuid, uuid, jsonb, text, text
) to authenticated;


-- Assertions: Verify all 10 functions are registered
do $$
begin
  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'delete_project'
  ), 'RPC delete_project tidak ditemukan';

  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'delete_budget_line'
  ), 'RPC delete_budget_line tidak ditemukan';

  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'update_material_meta'
  ), 'RPC update_material_meta tidak ditemukan';

  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_stock_mutation'
  ), 'RPC create_stock_mutation tidak ditemukan';

  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'update_project'
  ), 'RPC update_project tidak ditemukan';

  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'add_budget_line'
  ), 'RPC add_budget_line tidak ditemukan';

  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'update_budget_line'
  ), 'RPC update_budget_line tidak ditemukan';

  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'update_wbs_progress'
  ), 'RPC update_wbs_progress tidak ditemukan';

  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'add_team_member'
  ), 'RPC add_team_member tidak ditemukan';

  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'update_team_member'
  ), 'RPC update_team_member tidak ditemukan';

  raise notice 'Migration 0014 assertions lulus: semua 10 RPC orphaned terdaftar.';
end;
$$;
