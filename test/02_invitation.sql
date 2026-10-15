-- Invitation flow integration tests
-- Tests: create_workspace spam check, invite_member, accept_invitation

\set on_error_stop on

-- T25: Owner invites existing user → creates membership with token
do $$
declare
  v_owner_id uuid := '11111111-1111-1111-1111-111111111111';
  v_existing_user_id uuid := '22222222-2222-2222-2222-222222222222';
  v_ws_id uuid;
  v_result jsonb;
  v_member_exists boolean;
  v_has_token boolean;
begin
  -- Setup: create workspace owned by v_owner_id
  perform pg_temp.as_user(v_owner_id);
  set role authenticated;
  select (public.create_workspace('Test Workspace', 'test-ws', 'Jakarta', '12345678901234', null))::jsonb ->> 'id' into v_ws_id;
  
  -- Setup: ensure v_existing_user_id exists in auth.users
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values (v_existing_user_id, 'existing@example.com', 'hash', now(), now(), now())
  on conflict (id) do nothing;
  
  -- Invite existing user
  select public.invite_member(v_ws_id, 'existing@example.com', 'project_manager', 'Engineering') into v_result;
  
  -- Verify: membership created with token
  select exists(
    select 1 from public.workspace_members
    where workspace_id = v_ws_id
      and user_id = v_existing_user_id
      and status = 'Menunggu Undangan'
      and token is not null
  ) into v_member_exists;
  
  select exists(
    select 1 from public.workspace_members
    where workspace_id = v_ws_id
      and user_id = v_existing_user_id
      and token is not null
      and (token_expires_at - now()) > interval '6 days'
  ) into v_has_token;
  
  assert v_member_exists, 'T25: Membership not created for existing user';
  assert v_has_token, 'T25: Token expiry incorrect (should be ~7 days)';
  raise notice 'T25 PASS: Owner invites existing user';
end $$;

-- T26: Owner invites new user (no auth.users entry) → creates placeholder
do $$
declare
  v_owner_id uuid := '11111111-1111-1111-1111-111111111111';
  v_ws_id uuid;
  v_result jsonb;
  v_placeholder_id uuid := '00000000-0000-0000-0000-000000000000';
  v_member_exists boolean;
begin
  -- Workspace already created in T25
  select id from public.workspaces where slug = 'test-ws' limit 1 into v_ws_id;
  
  -- Invite new (non-existent) user
  select public.invite_member(v_ws_id, 'newuser@example.com', 'finance', 'Finance') into v_result;
  
  -- Verify: membership created with placeholder user_id
  select exists(
    select 1 from public.workspace_members
    where workspace_id = v_ws_id
      and user_id = v_placeholder_id
      and status = 'Menunggu Undangan'
      and email = 'newuser@example.com'
      and token is not null
  ) into v_member_exists;
  
  assert v_member_exists, 'T26: Membership not created with placeholder for new user';
  raise notice 'T26 PASS: Owner invites new user (placeholder)';
end $$;

-- T27: Non-owner tries to invite → denied
do $$
declare
  v_non_owner_id uuid := '33333333-3333-3333-3333-333333333333';
  v_ws_id uuid;
  v_result jsonb;
  v_error_occurred boolean := false;
begin
  select id from public.workspaces where slug = 'test-ws' limit 1 into v_ws_id;
  
  -- Ensure non-owner is not owner
  perform pg_temp.as_user(v_non_owner_id);
  set role authenticated;
  
  begin
    select public.invite_member(v_ws_id, 'someone@example.com', 'project_manager', 'Ops') into v_result;
  exception when others then
    v_error_occurred := true;
  end;
  
  assert v_error_occurred, 'T27: Non-owner should not be able to invite';
  raise notice 'T27 PASS: Non-owner invite denied';
end $$;

-- T28: Accept valid invitation → status becomes Aktif
do $$
declare
  v_invitee_id uuid := '22222222-2222-2222-2222-222222222222';
  v_ws_id uuid;
  v_token uuid;
  v_result jsonb;
  v_status text;
begin
  -- Get workspace and token from T25
  select id from public.workspaces where slug = 'test-ws' limit 1 into v_ws_id;
  select token from public.workspace_members 
    where workspace_id = v_ws_id and user_id = v_invitee_id limit 1 into v_token;
  
  -- Switch to invitee
  perform pg_temp.as_user(v_invitee_id);
  set role authenticated;
  
  -- Accept invitation
  select public.accept_invitation(v_token) into v_result;
  
  -- Verify: status changed to Aktif, token cleared
  select status from public.workspace_members
    where workspace_id = v_ws_id and user_id = v_invitee_id into v_status;
  
  assert v_status = 'Aktif', 'T28: Status not changed to Aktif, got: ' || v_status;
  
  select token is null from public.workspace_members
    where workspace_id = v_ws_id and user_id = v_invitee_id into v_result;
  
  assert (v_result)::boolean, 'T28: Token not cleared after acceptance';
  raise notice 'T28 PASS: Accept valid invitation';
end $$;

-- T29: Accept expired token → denied
do $$
declare
  v_invitee_id uuid := '44444444-4444-4444-4444-444444444444';
  v_ws_id uuid;
  v_token uuid;
  v_result jsonb;
  v_error_occurred boolean := false;
begin
  -- Setup workspace
  select id from public.workspaces where slug = 'test-ws' limit 1 into v_ws_id;
  
  -- Manually insert membership with expired token
  v_token := gen_random_uuid();
  insert into public.workspace_members 
    (workspace_id, user_id, email, status, role, token, token_expires_at, created_at)
  values (v_ws_id, v_invitee_id, 'expired@example.com', 'Menunggu Undangan', 'project_manager', 
    v_token, now() - interval '1 day', now());
  
  -- Try to accept expired token
  perform pg_temp.as_user(v_invitee_id);
  set role authenticated;
  
  begin
    select public.accept_invitation(v_token) into v_result;
  exception when others then
    v_error_occurred := true;
  end;
  
  assert v_error_occurred, 'T29: Should reject expired token';
  raise notice 'T29 PASS: Accept expired token denied';
end $$;

-- T30: Create workspace spam limit (4th workspace) → denied
do $$
declare
  v_owner_id uuid := '55555555-5555-5555-5555-555555555555';
  v_result jsonb;
  v_error_occurred boolean := false;
begin
  perform pg_temp.as_user(v_owner_id);
  set role authenticated;
  
  -- Create 3 workspaces (should succeed)
  select public.create_workspace('WS1', 'ws1-slug', 'Jakarta', '11111111111111', null) into v_result;
  assert v_result ->> 'success' = 'true' or v_result ? 'id', 'T30: Failed to create 1st workspace';
  
  select public.create_workspace('WS2', 'ws2-slug', 'Bandung', '22222222222222', null) into v_result;
  assert v_result ->> 'success' = 'true' or v_result ? 'id', 'T30: Failed to create 2nd workspace';
  
  select public.create_workspace('WS3', 'ws3-slug', 'Surabaya', '33333333333333', null) into v_result;
  assert v_result ->> 'success' = 'true' or v_result ? 'id', 'T30: Failed to create 3rd workspace';
  
  -- 4th should fail
  begin
    select public.create_workspace('WS4', 'ws4-slug', 'Medan', '44444444444444', null) into v_result;
  exception when others then
    v_error_occurred := true;
  end;
  
  assert v_error_occurred, 'T30: Should reject 4th workspace (spam limit)';
  raise notice 'T30 PASS: Workspace spam limit enforced';
end $$;

raise notice 'All invitation flow tests completed successfully';
