-- =============================================================================
-- Indotek Pro — Migrasi: 20261013000013_storage_security_and_attachments.sql
-- Perketat policy storage.objects dan public.attachments:
-- 1. Baca hanya jika is_assigned(proyek terkait) dan has_perm modul terkait.
-- 2. Validasi record_id milik workspace yang sama.
-- 3. Hapus oleh pengunggah atau peran Owner.
-- =============================================================================

-- 1. Helper function: private.can_access_attachment
create or replace function private.can_access_attachment(
  p_workspace_id uuid,
  p_record_type  text,
  p_record_id    uuid
) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_workspace_id is null or p_record_type is null or p_record_id is null then
    return false;
  end if;

  if not private.is_member(p_workspace_id) then
    return false;
  end if;

  case p_record_type
    when 'field_report' then
      return exists (
        select 1 from public.field_reports fr
        where fr.id = p_record_id and fr.workspace_id = p_workspace_id
          and private.is_assigned(fr.workspace_id, fr.project_id)
          and private.has_perm(fr.workspace_id, 'field_reports', 'view')
      );

    when 'petty_cash' then
      return exists (
        select 1 from public.petty_cash pc
        where pc.id = p_record_id and pc.workspace_id = p_workspace_id
          and private.is_assigned(pc.workspace_id, pc.project_id)
          and private.has_perm(pc.workspace_id, 'budget', 'view')
      );

    when 'purchase_order' then
      return exists (
        select 1 from public.purchase_orders po
        where po.id = p_record_id and po.workspace_id = p_workspace_id
          and private.is_assigned(po.workspace_id, po.project_id)
          and private.has_perm(po.workspace_id, 'procurement', 'view')
      );

    when 'stock_adjustment' then
      return exists (
        select 1 from public.stock_adjustments sa
        where sa.id = p_record_id and sa.workspace_id = p_workspace_id
          and private.has_perm(sa.workspace_id, 'materials', 'view')
      );

    when 'project' then
      return exists (
        select 1 from public.projects p
        where p.id = p_record_id and p.workspace_id = p_workspace_id
          and private.is_assigned(p.workspace_id, p.id)
          and private.has_perm(p.workspace_id, 'projects', 'view')
      );

    else
      return false;
  end case;
end $$;

grant execute on function private.can_access_attachment(uuid, text, uuid) to authenticated;

-- 2. Perketat policy public.attachments
drop policy if exists attachments_select on public.attachments;
drop policy if exists attachments_insert on public.attachments;
drop policy if exists attachments_delete on public.attachments;

create policy attachments_select on public.attachments for select to authenticated
  using (private.can_access_attachment(workspace_id, record_type, record_id));

create policy attachments_insert on public.attachments for insert to authenticated
  with check (
    private.can_access_attachment(workspace_id, record_type, record_id)
    and uploaded_by = (select auth.uid())
  );

create policy attachments_delete on public.attachments for delete to authenticated
  using (
    uploaded_by = (select auth.uid())
    or (select private.has_role(workspace_id, array['owner']::public.app_role[]))
  );

-- 3. Perketat policy storage.objects pada bucket 'attachments'
drop policy if exists attachments_obj_select on storage.objects;
drop policy if exists attachments_obj_insert on storage.objects;
drop policy if exists attachments_obj_delete on storage.objects;

create policy attachments_obj_select on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and private.can_access_attachment(
      private.try_uuid((storage.foldername(name))[1]),
      (storage.foldername(name))[2],
      private.try_uuid((storage.foldername(name))[3])
    )
  );

create policy attachments_obj_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and private.can_access_attachment(
      private.try_uuid((storage.foldername(name))[1]),
      (storage.foldername(name))[2],
      private.try_uuid((storage.foldername(name))[3])
    )
  );

create policy attachments_obj_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (
      owner = (select auth.uid())
      or private.has_role(private.try_uuid((storage.foldername(name))[1]), array['owner']::public.app_role[])
    )
  );

-- 4. DB Assertions
do $$
begin
  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'can_access_attachment'
  ), 'FAIL: function private.can_access_attachment missing';

  assert exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'attachments' and policyname = 'attachments_select'
  ), 'FAIL: attachments_select policy missing';

  assert exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'attachments' and policyname = 'attachments_insert'
  ), 'FAIL: attachments_insert policy missing';

  assert exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'attachments' and policyname = 'attachments_delete'
  ), 'FAIL: attachments_delete policy missing';

  raise notice '✅ Migration 20261013000013_storage_security_and_attachments verified successfully';
end $$;
