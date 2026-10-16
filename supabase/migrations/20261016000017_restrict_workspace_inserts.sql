-- ============================================================================
-- INDOTEK PRO — MIGRATION 0017: RESTRICT DIRECT WORKSPACE INSERTS
-- ============================================================================
-- Workspace creation must go through the SECURITY DEFINER create_workspace RPC.
-- Authenticated clients must not bypass its ownership and validation rules.
-- ============================================================================

drop policy if exists workspaces_insert on public.workspaces;
revoke insert on public.workspaces from authenticated;

do $$
begin
  if has_table_privilege('authenticated', 'public.workspaces', 'INSERT') then
    raise exception 'Authenticated users must not have direct INSERT access to public.workspaces';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'workspaces'
      and cmd in ('INSERT', 'ALL')
      and 'authenticated' = any(roles)
  ) then
    raise exception 'Authenticated users must not have a direct INSERT policy on public.workspaces';
  end if;
end;
$$;
