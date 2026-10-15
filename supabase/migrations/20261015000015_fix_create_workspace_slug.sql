-- ============================================================================
-- Migration: Fix create_workspace - add slug uniqueness check
-- Date: 2026-10-15
-- Description: Prevent duplicate slug constraint violation with friendly error
-- ============================================================================

create or replace function public.create_workspace(
  p_name    text,
  p_slug    text,
  p_address text    default '',
  p_npwp    text    default '',
  p_logo    text    default null   -- URL logo (Supabase Storage)
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid  := auth.uid();
  v_ws_id   uuid;
  v_count   int;
begin
  if v_uid is null then
    raise exception 'Anda harus login untuk membuat workspace.' using errcode = '42501';
  end if;

  -- Slug validation
  if p_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' then
    raise exception 'Slug harus huruf kecil, angka, dan tanda hubung (2-63 karakter).' using errcode = '22023';
  end if;

  -- Check slug uniqueness
  select count(*) into v_count
    from public.workspaces
   where slug = p_slug;

  if v_count > 0 then
    raise exception 'Slug "%" sudah digunakan. Pilih slug lain.', p_slug using errcode = '23505';
  end if;

  -- Cegah spam workspace
  select count(*) into v_count
    from public.workspace_members
   where user_id = v_uid and role = 'owner';

  if v_count >= 3 then
    raise exception 'Anda sudah memiliki 3 workspace. Hubungi dukungan untuk menambah lebih.' using errcode = '42501';
  end if;

  -- Buat workspace
  insert into public.workspaces (slug, name, settings)
  values (
    p_slug,
    p_name,
    jsonb_build_object(
      'companyAddress', p_address,
      'taxNumberNPWP',  p_npwp,
      'logoUrl',        coalesce(p_logo, ''),
      'currency',       'IDR',
      'language',       'id',
      'tableDensity',   'comfortable',
      'sod_mode',       'strict'
    )
  )
  returning id into v_ws_id;

  -- Buat / perbarui profil (upsert karena mungkin sudah ada dari login OAuth)
  insert into public.profiles (id, email, full_name)
  select v_uid, (select email from auth.users where id = v_uid),
         coalesce((select raw_user_meta_data->>'full_name' from auth.users where id = v_uid), '')
  on conflict (id) do update
    set email = excluded.email;

  -- Daftarkan sebagai Owner
  insert into public.workspace_members (workspace_id, user_id, role, status, all_projects)
  values (v_ws_id, v_uid, 'owner', 'Aktif', true);

  return jsonb_build_object(
    'success',     true,
    'workspaceId', v_ws_id,
    'slug',        p_slug,
    'message',     format('Workspace "%s" berhasil dibuat. Selamat datang!', p_name)
  );
end;
$$;
