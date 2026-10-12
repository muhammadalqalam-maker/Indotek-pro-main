-- =============================================================================
-- Indotek Pro — Migrasi Supabase 2/4: HELPER IZIN, RLS, GRANT
-- Prinsip: (1) RLS aktif di SEMUA tabel, (2) klien hanya boleh MEMBACA tabel workflow,
-- semua perubahan status/uang lewat fungsi RPC (0003) -> tidak ada jalur "fallback" yang melewati aturan.
-- =============================================================================

-- ---------- Helper (security definer, search_path kosong, tidak diekspos Data API) ----------
create or replace function private.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_members m
                 where m.workspace_id = ws and m.user_id = (select auth.uid()) and m.status = 'Aktif');
$$;

create or replace function private.has_role(ws uuid, roles public.app_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_members m
                 where m.workspace_id = ws and m.user_id = (select auth.uid())
                   and m.status = 'Aktif' and m.role = any (roles));
$$;

create or replace function private.has_perm(ws uuid, p_module text, p_action text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1
                 from public.workspace_members m
                 join public.role_permissions rp on rp.role = m.role
                 where m.workspace_id = ws and m.user_id = (select auth.uid()) and m.status = 'Aktif'
                   and rp.module = p_module and rp.action = p_action);
$$;

-- Owner/Finance/Auditor melihat semua proyek (sama seperti isAssignedToProject di rules lama)
create or replace function private.is_assigned(ws uuid, pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_members m
                 where m.workspace_id = ws and m.user_id = (select auth.uid()) and m.status = 'Aktif'
                   and ( m.all_projects
                         or m.role in ('owner','finance','auditor')
                         or exists (select 1 from public.project_members pm
                                    where pm.project_id = pid and pm.user_id = m.user_id)));
$$;

create or replace function private.shares_workspace(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.workspace_members a
                 join public.workspace_members b on b.workspace_id = a.workspace_id
                 where a.user_id = (select auth.uid()) and a.status = 'Aktif' and b.user_id = other);
$$;

create or replace function private.try_uuid(t text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin return t::uuid; exception when others then return null; end $$;

-- Cegah workspace tanpa Owner aktif (mis. owner terakhir terhapus / diturunkan)
create or replace function private.guard_last_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
declare remaining int;
begin
  if (tg_op = 'DELETE' and old.role = 'owner' and old.status = 'Aktif')
     or (tg_op = 'UPDATE' and old.role = 'owner' and old.status = 'Aktif'
         and (new.role <> 'owner' or new.status <> 'Aktif')) then
    select count(*) into remaining from public.workspace_members
      where workspace_id = old.workspace_id and role = 'owner' and status = 'Aktif' and user_id <> old.user_id;
    if remaining = 0 then
      raise exception 'Workspace harus memiliki minimal satu Owner aktif' using errcode = '23514';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger trg_guard_last_owner before update or delete on public.workspace_members
  for each row execute function private.guard_last_owner();

-- Hanya helper yang dipakai policy RLS yang boleh dieksekusi role 'authenticated' (daftar eksplisit, bukan "all functions")
grant usage on schema private to authenticated;
grant execute on function
  private.is_member(uuid), private.has_role(uuid, public.app_role[]), private.has_perm(uuid, text, text),
  private.is_assigned(uuid, uuid), private.shares_workspace(uuid), private.try_uuid(text)
  to authenticated;

-- ---------- Seed matriks izin (port 1:1 dari hasModulePerm) ----------
insert into public.role_permissions (role, module, action)
select r.role::public.app_role, m.module, a.action
from (values
  -- owner: semua
  ('owner','*','*'),
  -- project_manager
  ('project_manager','projects','*5'), ('project_manager','schedule','*5'), ('project_manager','materials','*5'), ('project_manager','field_reports','*5'),
  ('project_manager','budget','*6'), ('project_manager','procurement','*6'),
  ('project_manager','team','view'), ('project_manager','reports','view'), ('project_manager','settings','view'), ('project_manager','audit','view'),
  -- site_manager
  ('site_manager','field_reports','*5'),
  ('site_manager','schedule','view,edit'),
  ('site_manager','materials','view,create,edit,submit'),
  ('site_manager','procurement','view,create,submit'),
  ('site_manager','projects','view'), ('site_manager','budget','view'), ('site_manager','team','view'), ('site_manager','reports','view'),
  -- quantity_surveyor
  ('quantity_surveyor','budget','view,create,edit,submit'),
  ('quantity_surveyor','procurement','view,create,submit'),
  ('quantity_surveyor','projects','view'), ('quantity_surveyor','schedule','view'), ('quantity_surveyor','materials','view'),
  ('quantity_surveyor','field_reports','view'), ('quantity_surveyor','reports','view'),
  -- finance
  ('finance','budget','view,edit,submit,approve,reject'), ('finance','procurement','view,edit,submit,approve,reject'),
  ('finance','projects','view'), ('finance','schedule','view'), ('finance','materials','view'), ('finance','field_reports','view'),
  ('finance','team','view'), ('finance','audit','view'), ('finance','reports','view'), ('finance','settings','view'),
  -- procurement
  ('procurement','procurement','view,create,edit,submit'),
  ('procurement','materials','view,edit,submit'),
  ('procurement','projects','view'), ('procurement','budget','view'), ('procurement','schedule','view'),
  ('procurement','field_reports','view'), ('procurement','reports','view'),
  -- warehouse
  ('warehouse','materials','*5'),
  ('warehouse','procurement','view'), ('warehouse','schedule','view'), ('warehouse','projects','view'),
  ('warehouse','field_reports','view'), ('warehouse','reports','view')
) as r(role, module, actions)
cross join lateral (
  select unnest(case r.actions
    when '*'  then array['view','create','edit','submit','approve','reject']
    when '*5' then array['view','create','edit','submit','approve']
    when '*6' then array['view','create','edit','submit','approve','reject']
    else string_to_array(r.actions, ',') end) as action
) a
cross join lateral (
  select unnest(case r.module when '*' then array['projects','schedule','budget','materials','procurement','field_reports','team','reports','settings','audit']
                 else array[r.module] end) as module
) m
on conflict do nothing;

-- auditor: lihat semua modul
insert into public.role_permissions (role, module, action)
select 'auditor', m, 'view'
from unnest(array['projects','schedule','budget','materials','procurement','field_reports','team','reports','settings','audit']) m
on conflict do nothing;

-- ---------- Aktifkan RLS di semua tabel ----------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------- Grant eksplisit (jangan bergantung pada default privilege Supabase) ----------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.profiles, public.workspaces, public.workspace_members, public.role_permissions,
  public.projects, public.project_members, public.budget_lines, public.milestones, public.wbs_items,
  public.budget_versions, public.activities, public.materials, public.stock_mutations, public.stock_adjustments,
  public.purchase_orders, public.field_reports, public.budget_revisions, public.petty_cash,
  public.notifications, public.notification_reads, public.audit_logs, public.attachments
  to authenticated;

-- Tulis langsung dari klien: hanya tabel master/data non-transaksional, dan kolom sensitif dikecualikan
grant insert on public.projects, public.budget_lines, public.milestones, public.wbs_items, public.materials,
  public.activities, public.project_members, public.workspace_members, public.attachments, public.notification_reads
  to authenticated;
grant update (name, client, category, location, project_manager, site_engineer, contract_value, start_date,
  target_end_date, progress_actual, progress_planned, status, schedule_status, image_url, description)
  on public.projects to authenticated;                    -- code, approved_budget, actual_cost, counter milestone: hanya via RPC/service role
grant update on public.budget_lines, public.wbs_items to authenticated;
grant update (title, wbs_code, planned_date, progress, weight_percent) on public.milestones to authenticated;  -- status/sign-off hanya via RPC
grant update (name, specification, category, unit, min_stock, allocated_project_id, warehouse_location,
  primary_supplier, unit_price) on public.materials to authenticated;                                          -- stok & status hanya via RPC
grant update (role, department, status, all_projects) on public.workspace_members to authenticated;
grant update (name, settings) on public.workspaces to authenticated;
grant update (full_name, nip, phone) on public.profiles to authenticated;
grant delete on public.projects, public.budget_lines, public.milestones, public.wbs_items, public.materials,
  public.project_members, public.workspace_members, public.attachments to authenticated;

-- ---------- Policy ----------
-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.shares_workspace(id)));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- workspaces (TIDAK ada policy insert/delete: dibuat via private.bootstrap_workspace oleh admin DB)
create policy workspaces_select on public.workspaces for select to authenticated
  using ((select private.is_member(id)));
create policy workspaces_update on public.workspaces for update to authenticated
  using ((select private.has_role(id, array['owner']::public.app_role[])))
  with check ((select private.has_role(id, array['owner']::public.app_role[])));

-- workspace_members: baca oleh sesama anggota; ubah hanya Owner
create policy members_select on public.workspace_members for select to authenticated
  using ((select private.is_member(workspace_id)));
create policy members_insert on public.workspace_members for insert to authenticated
  with check ((select private.has_role(workspace_id, array['owner']::public.app_role[])));
create policy members_update on public.workspace_members for update to authenticated
  using ((select private.has_role(workspace_id, array['owner']::public.app_role[])))
  with check ((select private.has_role(workspace_id, array['owner']::public.app_role[])));
create policy members_delete on public.workspace_members for delete to authenticated
  using ((select private.has_role(workspace_id, array['owner']::public.app_role[])));

create policy role_permissions_select on public.role_permissions for select to authenticated using (true);

-- projects
create policy projects_select on public.projects for select to authenticated
  using ((select private.is_assigned(workspace_id, id)));
create policy projects_insert on public.projects for insert to authenticated
  with check ((select private.has_perm(workspace_id, 'projects', 'create')) and actual_cost = 0 and completed_milestones = 0);
create policy projects_update on public.projects for update to authenticated
  using ((select private.has_perm(workspace_id, 'projects', 'edit')) and (select private.is_assigned(workspace_id, id)))
  with check ((select private.has_perm(workspace_id, 'projects', 'edit')));
create policy projects_delete on public.projects for delete to authenticated
  using ((select private.has_role(workspace_id, array['owner']::public.app_role[])));

create policy project_members_select on public.project_members for select to authenticated
  using ((select private.is_member(workspace_id)));
create policy project_members_insert on public.project_members for insert to authenticated
  with check ((select private.has_role(workspace_id, array['owner','project_manager']::public.app_role[])));
create policy project_members_delete on public.project_members for delete to authenticated
  using ((select private.has_role(workspace_id, array['owner','project_manager']::public.app_role[])));

-- budget_lines
create policy budget_lines_select on public.budget_lines for select to authenticated
  using ((select private.is_assigned(workspace_id, project_id)));
create policy budget_lines_insert on public.budget_lines for insert to authenticated
  with check ((select private.has_perm(workspace_id, 'budget', 'create')) and (select private.is_assigned(workspace_id, project_id)));
create policy budget_lines_update on public.budget_lines for update to authenticated
  using ((select private.has_perm(workspace_id, 'budget', 'edit')) and (select private.is_assigned(workspace_id, project_id)))
  with check ((select private.has_perm(workspace_id, 'budget', 'edit')) and (select private.is_assigned(workspace_id, project_id)));
create policy budget_lines_delete on public.budget_lines for delete to authenticated
  using ((select private.has_role(workspace_id, array['owner']::public.app_role[])));

-- milestones
create policy milestones_select on public.milestones for select to authenticated
  using ((select private.is_assigned(workspace_id, project_id)));
create policy milestones_insert on public.milestones for insert to authenticated
  with check ((select private.has_perm(workspace_id, 'schedule', 'create')) and status in ('Menunggu','Berjalan')
              and signed_off_by is null and (select private.is_assigned(workspace_id, project_id)));
create policy milestones_update on public.milestones for update to authenticated
  using ((select private.has_perm(workspace_id, 'schedule', 'edit')) and (select private.is_assigned(workspace_id, project_id)))
  with check ((select private.has_perm(workspace_id, 'schedule', 'edit')));
create policy milestones_delete on public.milestones for delete to authenticated
  using ((select private.has_role(workspace_id, array['owner']::public.app_role[])));

-- wbs_items
create policy wbs_select on public.wbs_items for select to authenticated
  using ((select private.is_assigned(workspace_id, project_id)));
create policy wbs_insert on public.wbs_items for insert to authenticated
  with check ((select private.has_perm(workspace_id, 'schedule', 'edit')) and (select private.is_assigned(workspace_id, project_id)));
create policy wbs_update on public.wbs_items for update to authenticated
  using ((select private.has_perm(workspace_id, 'schedule', 'edit')) and (select private.is_assigned(workspace_id, project_id)))
  with check ((select private.has_perm(workspace_id, 'schedule', 'edit')));
create policy wbs_delete on public.wbs_items for delete to authenticated
  using ((select private.has_role(workspace_id, array['owner']::public.app_role[])));

-- budget_versions (hanya baca; ditulis oleh RPC persetujuan revisi)
create policy budget_versions_select on public.budget_versions for select to authenticated
  using ((select private.is_assigned(workspace_id, project_id)));

-- activities (append-only dari klien)
create policy activities_select on public.activities for select to authenticated
  using ((select private.is_assigned(workspace_id, project_id)));
create policy activities_insert on public.activities for insert to authenticated
  with check ((select private.is_assigned(workspace_id, project_id)));

-- materials
create policy materials_select on public.materials for select to authenticated
  using ((select private.is_member(workspace_id)));
create policy materials_insert on public.materials for insert to authenticated
  with check ((select private.has_perm(workspace_id, 'materials', 'create')) and current_stock = 0 and status = 'Aman');
create policy materials_update on public.materials for update to authenticated
  using ((select private.has_perm(workspace_id, 'materials', 'edit')))
  with check ((select private.has_perm(workspace_id, 'materials', 'edit')));
create policy materials_delete on public.materials for delete to authenticated
  using ((select private.has_role(workspace_id, array['owner']::public.app_role[])));

-- Tabel workflow: HANYA BACA dari klien (tulis via RPC)
create policy stock_mutations_select on public.stock_mutations for select to authenticated
  using ((select private.is_member(workspace_id)));
create policy stock_adjustments_select on public.stock_adjustments for select to authenticated
  using ((select private.is_member(workspace_id)));
create policy purchase_orders_select on public.purchase_orders for select to authenticated
  using ((select private.is_assigned(workspace_id, project_id)) and (select private.has_perm(workspace_id, 'procurement', 'view')));
create policy field_reports_select on public.field_reports for select to authenticated
  using ((select private.is_assigned(workspace_id, project_id)) and (select private.has_perm(workspace_id, 'field_reports', 'view')));
create policy budget_revisions_select on public.budget_revisions for select to authenticated
  using ((select private.is_assigned(workspace_id, project_id)) and (select private.has_perm(workspace_id, 'budget', 'view')));
create policy petty_cash_select on public.petty_cash for select to authenticated
  using ((select private.is_assigned(workspace_id, project_id)) and (select private.has_perm(workspace_id, 'budget', 'view')));

-- notifications: untuk saya (recipient) atau untuk peran saya (target_roles); status baca per-pengguna
create policy notifications_select on public.notifications for select to authenticated
  using ((select private.is_member(workspace_id))
         and ( recipient_id = (select auth.uid())
               or (recipient_id is null and (target_roles = '{}' or (select private.has_role(workspace_id, target_roles)))) ));
create policy notification_reads_select on public.notification_reads for select to authenticated
  using (user_id = (select auth.uid()));
create policy notification_reads_insert on public.notification_reads for insert to authenticated
  with check (user_id = (select auth.uid()));

-- audit_logs: baca oleh yang punya izin 'audit'; tidak ada insert/update/delete dari klien
create policy audit_select on public.audit_logs for select to authenticated
  using ((select private.has_perm(workspace_id, 'audit', 'view')));

-- attachments
create policy attachments_select on public.attachments for select to authenticated
  using ((select private.is_member(workspace_id)));
create policy attachments_insert on public.attachments for insert to authenticated
  with check ((select private.is_member(workspace_id)) and uploaded_by = (select auth.uid()));
create policy attachments_delete on public.attachments for delete to authenticated
  using (uploaded_by = (select auth.uid()) or (select private.has_role(workspace_id, array['owner']::public.app_role[])));

-- doc_counters & idempotency_keys: RLS aktif TANPA policy = tertutup untuk klien (hanya fungsi security definer)

-- ---------- Storage: bucket privat 'attachments', path = <workspace_id>/<record_type>/<record_id>/<file> ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 10485760,
        array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

create policy attachments_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (select private.is_member(private.try_uuid((storage.foldername(name))[1]))));
create policy attachments_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (select private.is_member(private.try_uuid((storage.foldername(name))[1]))));
create policy attachments_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and owner = (select auth.uid()));

-- ---------- Realtime: hanya tabel yang benar-benar perlu live ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications, public.purchase_orders;
  end if;
end $$;
