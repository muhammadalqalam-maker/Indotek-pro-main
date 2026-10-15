-- ============================================================================
-- INDOTEK PRO — MIGRATION 0008: ONBOARDING, SOD KONFIGURABEL, UNDANGAN TIM
-- ============================================================================
-- 1. create_workspace   — user baru bisa membuat perusahaan sendiri
-- 2. accept_invitation  — anggota tim mengaktifkan keanggotaan saat login pertama
-- 3. private.check_sod  — SoD konfigurabel (strict | owner_override)
--    Semua RPC approver memanggil check_sod sebelum memproses
-- 4. Tambah sod_mode ke workspaces.settings default
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Tambah kolom invitation_token ke workspace_members
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.workspace_members
  add column if not exists invitation_token uuid default null,
  add column if not exists invitation_expires_at timestamptz default null,
  add column if not exists invited_email text default null;

create index if not exists idx_workspace_members_token
  on public.workspace_members (invitation_token)
  where invitation_token is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. RPC: create_workspace
--    Membuat workspace baru, profil creator, dan keanggotaan owner.
--    Dibatasi: satu user maksimal punya 3 workspace (mencegah spam).
-- ─────────────────────────────────────────────────────────────────────────────
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

grant execute on function public.create_workspace(text, text, text, text, text) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RPC: invite_member
--    Membuat undangan (token + expiry). Edge Function memanggil ini,
--    lalu mengirim email dengan link berisi token.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.invite_member(
  p_workspace_id uuid,
  p_email        text,
  p_role         public.app_role,
  p_department   text  default ''
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a        record;
  v_uid    uuid;
  v_token  uuid := gen_random_uuid();
  v_expiry timestamptz := now() + interval '7 days';
begin
  select * into a from private.require_actor(p_workspace_id);

  if a.actor_role not in ('owner') then
    raise exception 'Hanya Owner yang dapat mengundang anggota baru.' using errcode = '42501';
  end if;

  -- Cek apakah email sudah punya akun Supabase
  select id into v_uid from auth.users where lower(email) = lower(p_email) limit 1;

  if v_uid is not null then
    -- User sudah ada: tambahkan langsung dengan status Menunggu Undangan
    insert into public.workspace_members (
      workspace_id, user_id, role, department, status,
      invitation_token, invitation_expires_at, invited_email
    ) values (
      p_workspace_id, v_uid, p_role, p_department, 'Menunggu Undangan',
      v_token, v_expiry, lower(p_email)
    )
    on conflict (workspace_id, user_id) do update
      set role                  = excluded.role,
          department            = excluded.department,
          status                = 'Menunggu Undangan',
          invitation_token      = excluded.invitation_token,
          invitation_expires_at = excluded.invitation_expires_at;
  else
    -- User belum ada: simpan undangan dengan user_id = '00000000-0000-0000-0000-000000000000'
    -- Edge Function akan update setelah user mendaftar
    insert into public.workspace_members (
      workspace_id, user_id, role, department, status,
      invitation_token, invitation_expires_at, invited_email
    ) values (
      p_workspace_id,
      '00000000-0000-0000-0000-000000000000'::uuid,
      p_role, p_department, 'Menunggu Undangan',
      v_token, v_expiry, lower(p_email)
    );
  end if;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    'INVITE_MEMBER', 'workspace_member', null, null,
    format('Undangan dikirim ke %s dengan peran %s.', p_email, p_role),
    '', '', '{}'
  );

  return jsonb_build_object(
    'success', true,
    'token',   v_token,
    'expires', v_expiry,
    'email',   lower(p_email),
    'message', format('Undangan untuk %s berhasil dibuat (berlaku 7 hari).', p_email)
  );
end;
$$;

grant execute on function public.invite_member(uuid, text, public.app_role, text) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC: accept_invitation
--    Dipanggil saat user login pertama kali dan ada token di URL.
--    Mengaktifkan keanggotaan dan menghapus token.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.accept_invitation(
  p_token uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_member record;
  v_email  text;
begin
  if v_uid is null then
    raise exception 'Anda harus login untuk menerima undangan.' using errcode = '42501';
  end if;

  select email into v_email from auth.users where id = v_uid;

  -- Cari undangan yang cocok: token + belum expired + email cocok atau placeholder
  select * into v_member
    from public.workspace_members
   where invitation_token = p_token
     and invitation_expires_at > now()
     and (
       user_id = v_uid
       or (user_id = '00000000-0000-0000-0000-000000000000' and lower(invited_email) = lower(v_email))
     )
   for update;

  if not found then
    raise exception 'Token undangan tidak valid atau sudah kadaluarsa.' using errcode = 'P0002';
  end if;

  -- Aktifkan keanggotaan
  update public.workspace_members
     set user_id               = v_uid,
         status                = 'Aktif',
         invitation_token      = null,
         invitation_expires_at = null
   where workspace_id = v_member.workspace_id
     and invitation_token = p_token;

  -- Upsert profil
  insert into public.profiles (id, email, full_name)
  select v_uid, v_email,
         coalesce((select raw_user_meta_data->>'full_name' from auth.users where id = v_uid), '')
  on conflict (id) do update
    set email = excluded.email;

  perform private.write_audit(
    v_member.workspace_id, v_uid, v_email, v_member.role::text,
    'ACCEPT_INVITATION', 'workspace_member', null, null,
    format('Undangan diterima oleh %s dengan peran %s.', v_email, v_member.role),
    '', '', '{}'
  );

  return jsonb_build_object(
    'success',     true,
    'workspaceId', v_member.workspace_id,
    'role',        v_member.role,
    'message',     format('Selamat bergabung! Anda telah terdaftar sebagai %s.', v_member.role)
  );
end;
$$;

grant execute on function public.accept_invitation(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RPC: update_member_role
--    Owner mengubah peran / status anggota.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.update_member_role(
  p_workspace_id uuid,
  p_target_user  uuid,
  p_new_role     public.app_role   default null,
  p_new_status   public.member_status default null,
  p_department   text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a record;
begin
  select * into a from private.require_actor(p_workspace_id);

  if a.actor_role not in ('owner') then
    raise exception 'Hanya Owner yang dapat mengubah peran anggota.' using errcode = '42501';
  end if;

  if p_target_user = a.uid then
    raise exception 'Owner tidak dapat mengubah peran/statusnya sendiri.' using errcode = '42501';
  end if;

  update public.workspace_members
     set role       = coalesce(p_new_role,   role),
         status     = coalesce(p_new_status, status),
         department = coalesce(p_department, department)
   where workspace_id = p_workspace_id
     and user_id      = p_target_user;

  if not found then
    raise exception 'Anggota tidak ditemukan di workspace ini.' using errcode = 'P0002';
  end if;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    'UPDATE_MEMBER_ROLE', 'workspace_member', p_target_user, null,
    format('Anggota %s: role=%s, status=%s diperbarui oleh %s.',
      p_target_user, p_new_role, p_new_status, a.actor_name),
    '', '', '{}'
  );

  return jsonb_build_object('success', true, 'message', 'Peran anggota berhasil diperbarui.');
end;
$$;

grant execute on function public.update_member_role(uuid, uuid, public.app_role, public.member_status, text) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. private.check_sod — SoD konfigurabel
--    Dipanggil oleh semua RPC approver.
--    Mode strict: creator != approver (tanpa pengecualian)
--    Mode owner_override: Owner BOLEH approve dokumennya sendiri
--    ASALKAN p_override_reason diisi minimal 15 karakter.
--    Setiap override dicatat di audit_logs dengan sod_override=true
--    dan Auditor mendapat notifikasi.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function private.check_sod(
  p_workspace_id   uuid,
  p_actor_uid      uuid,
  p_actor_role     text,
  p_creator_uid    uuid,
  p_doc_type       text,    -- e.g. 'purchase_order', 'petty_cash'
  p_doc_id         uuid,
  p_override_reason text   default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_sod_mode   text;
  v_auditor_id uuid;
  v_notif_id   uuid;
begin
  -- Ambil sod_mode dari settings workspace
  select coalesce(settings->>'sod_mode', 'strict')
    into v_sod_mode
    from public.workspaces
   where id = p_workspace_id;

  -- Jika creator bukan actor, tidak ada konflik SoD -> langsung return
  if p_creator_uid is null or p_creator_uid != p_actor_uid then
    return;
  end if;

  -- Ada konflik SoD
  if v_sod_mode = 'strict' then
    raise exception
      'Pelanggaran Segregation of Duties: % tidak boleh menyetujui % yang dibuat sendiri (sod_mode=strict).',
      p_actor_role, p_doc_type
      using errcode = '42501';
  end if;

  -- Mode owner_override: hanya Owner yang boleh override
  if p_actor_role != 'owner' then
    raise exception
      'Pelanggaran SoD: hanya Owner yang dapat menggunakan override pada sod_mode=owner_override.'
      using errcode = '42501';
  end if;

  -- Validasi alasan override
  if p_override_reason is null or length(trim(p_override_reason)) < 15 then
    raise exception
      'Override SoD memerlukan alasan minimal 15 karakter. Alasan diberikan: "%".',
      coalesce(p_override_reason, '(kosong)')
      using errcode = '22023';
  end if;

  -- Catat audit override
  insert into public.audit_logs (
    workspace_id, action, record_type, record_id, actor_id, actor_name, actor_role,
    details, previous_value, new_value, metadata
  ) values (
    p_workspace_id, 'SOD_OVERRIDE', p_doc_type, p_doc_id,
    p_actor_uid, 'Owner', 'owner',
    format('SoD override oleh Owner pada %s %s. Alasan: %s',
      p_doc_type, p_doc_id, p_override_reason),
    'pending', 'approved_with_override',
    jsonb_build_object('sod_override', true, 'override_reason', p_override_reason)
  );

  -- Kirim notifikasi ke semua Auditor di workspace
  insert into public.notifications (workspace_id, title, message, type, target_roles, target_screen)
  select
    p_workspace_id,
    format('[SoD Override] %s disetujui sendiri oleh Owner', p_doc_type),
    format('Owner menggunakan override SoD untuk %s ID %s. Alasan: %s',
      p_doc_type, p_doc_id, p_override_reason),
    'alert',
    array['auditor'],
    'settings'
  where exists (
    select 1 from public.workspace_members
     where workspace_id = p_workspace_id
       and role = 'auditor'
       and status = 'Aktif'
  );

end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Terapkan check_sod ke RPC yang ada
--    Patch: approve_purchase_order, approve_petty_cash, approve_budget_revision
--    (fungsi-fungsi ini ada di migration 0003)
-- ─────────────────────────────────────────────────────────────────────────────

-- 6a. Tambah kolom created_by_name di petty_cash / purchase_orders jika belum ada,
--     dan helper untuk mendapatkan creator
-- Catatan: check_sod dipanggil SEBELUM update status.

-- Override approve_purchase_order dengan SoD check
create or replace function public.approve_purchase_order(
  p_workspace_id   uuid,
  p_po_id          uuid,
  p_override_reason text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a       record;
  po      record;
begin
  select * into a from private.require_actor(p_workspace_id);

  if a.actor_role not in ('owner', 'finance') then
    raise exception 'Peran "%" tidak berwenang menyetujui PO. Diperlukan peran Owner atau Finance.',
      a.actor_role using errcode = '42501';
  end if;

  select * into po
    from public.purchase_orders
   where id = p_po_id and workspace_id = p_workspace_id
     for update;

  if not found then
    raise exception 'PO tidak ditemukan.' using errcode = 'P0002';
  end if;

  if po.status not in ('Menunggu', 'Draft') then
    raise exception 'PO berstatus "%" tidak dapat disetujui. Status harus Menunggu atau Draft.',
      po.status using errcode = '42501';
  end if;

  -- SoD Check
  perform private.check_sod(
    p_workspace_id, a.uid, a.actor_role::text,
    po.requester_id,
    'purchase_order', p_po_id, p_override_reason
  );

  update public.purchase_orders
     set status           = 'Disetujui',
         approved_by      = a.uid,
         approved_by_name = a.actor_name,
         approved_at      = now()
   where id = p_po_id;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    'APPROVE_PO', 'purchase_order', p_po_id, po.project_id,
    format('PO %s disetujui oleh %s.', po.po_number, a.actor_name),
    'Menunggu', 'Disetujui',
    jsonb_build_object(
      'sod_override', p_override_reason is not null,
      'override_reason', coalesce(p_override_reason, '')
    )
  );

  return jsonb_build_object(
    'success', true, 'poId', p_po_id,
    'message', format('PO %s berhasil disetujui.', po.po_number)
  );
end;
$$;

grant execute on function public.approve_purchase_order(uuid, uuid, text) to authenticated;


-- Override approve_petty_cash dengan SoD check
create or replace function public.approve_petty_cash(
  p_workspace_id   uuid,
  p_cash_id        uuid,
  p_override_reason text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a    record;
  cash record;
begin
  select * into a from private.require_actor(p_workspace_id);

  if a.actor_role not in ('owner', 'finance') then
    raise exception 'Peran "%" tidak berwenang menyetujui kas kecil.', a.actor_role
      using errcode = '42501';
  end if;

  select * into cash
    from public.petty_cash
   where id = p_cash_id and workspace_id = p_workspace_id
     for update;

  if not found then
    raise exception 'Voucher kas kecil tidak ditemukan.' using errcode = 'P0002';
  end if;

  if cash.status != 'Menunggu' then
    raise exception 'Voucher kas kecil berstatus "%" tidak dapat disetujui.', cash.status
      using errcode = '42501';
  end if;

  -- SoD Check
  perform private.check_sod(
    p_workspace_id, a.uid, a.actor_role::text,
    cash.submitted_by,
    'petty_cash', p_cash_id, p_override_reason
  );

  update public.petty_cash
     set status           = 'Disetujui',
         approved_by      = a.uid,
         approved_by_name = a.actor_name,
         approved_at      = now()
   where id = p_cash_id;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    'APPROVE_PETTY_CASH', 'petty_cash', p_cash_id, cash.project_id,
    format('Kas kecil %s disetujui oleh %s.', cash.petty_cash_no, a.actor_name),
    'Menunggu', 'Disetujui',
    jsonb_build_object('sod_override', p_override_reason is not null)
  );

  return jsonb_build_object('success', true, 'cashId', p_cash_id,
    'message', format('Voucher kas kecil %s berhasil disetujui.', cash.petty_cash_no));
end;
$$;

grant execute on function public.approve_petty_cash(uuid, uuid, text) to authenticated;


-- Override approve_budget_revision dengan SoD check
create or replace function public.approve_budget_revision(
  p_workspace_id   uuid,
  p_revision_id    uuid,
  p_override_reason text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a   record;
  rev record;
begin
  select * into a from private.require_actor(p_workspace_id);

  if a.actor_role not in ('owner') then
    raise exception 'Hanya Owner/Direksi yang dapat menyetujui revisi anggaran.' using errcode = '42501';
  end if;

  select * into rev
    from public.budget_revisions
   where id = p_revision_id and workspace_id = p_workspace_id
     for update;

  if not found then
    raise exception 'Revisi anggaran tidak ditemukan.' using errcode = 'P0002';
  end if;

  if rev.status != 'Menunggu' then
    raise exception 'Revisi anggaran berstatus "%" tidak dapat disetujui.', rev.status
      using errcode = '42501';
  end if;

  -- SoD Check
  perform private.check_sod(
    p_workspace_id, a.uid, a.actor_role::text,
    rev.submitted_by,
    'budget_revision', p_revision_id, p_override_reason
  );

  update public.budget_revisions
     set status           = 'Disetujui',
         approved_by      = a.uid,
         approved_by_name = coalesce(a.actor_name, 'Owner'),
         approved_at      = now()
   where id = p_revision_id;

  -- Update planned_amount di budget_lines sesuai items revisi
  update public.budget_lines bl
     set planned_amount = ri.new_amount
    from public.budget_revision_items ri
   where ri.revision_id = p_revision_id
     and ri.budget_line_id = bl.id
     and bl.workspace_id = p_workspace_id;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    'APPROVE_BUDGET_REVISION', 'budget_revision', p_revision_id, rev.project_id,
    format('Revisi anggaran %s disetujui oleh %s.', rev.revision_number, a.actor_name),
    'Menunggu', 'Disetujui',
    jsonb_build_object('sod_override', p_override_reason is not null)
  );

  return jsonb_build_object('success', true, 'revisionId', p_revision_id,
    'message', format('Revisi anggaran %s berhasil disetujui.', rev.revision_number));
end;
$$;

grant execute on function public.approve_budget_revision(uuid, uuid, text) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RPC: update_workspace_sod_mode
--    Owner mengubah sod_mode dari UI Settings.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.update_workspace_sod_mode(
  p_workspace_id uuid,
  p_sod_mode     text   -- 'strict' | 'owner_override'
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a record;
begin
  select * into a from private.require_actor(p_workspace_id);

  if a.actor_role != 'owner' then
    raise exception 'Hanya Owner yang dapat mengubah mode SoD.' using errcode = '42501';
  end if;

  if p_sod_mode not in ('strict', 'owner_override') then
    raise exception 'Nilai sod_mode harus "strict" atau "owner_override".' using errcode = '22023';
  end if;

  update public.workspaces
     set settings = jsonb_set(coalesce(settings, '{}'), '{sod_mode}', to_jsonb(p_sod_mode))
   where id = p_workspace_id;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    'UPDATE_SOD_MODE', 'workspace', p_workspace_id, null,
    format('SoD mode diubah menjadi "%s" oleh %s.', p_sod_mode, a.actor_name),
    '', p_sod_mode, '{}'
  );

  return jsonb_build_object('success', true,
    'message', format('SoD mode berhasil diubah menjadi "%s".', p_sod_mode));
end;
$$;

grant execute on function public.update_workspace_sod_mode(uuid, text) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Assertions
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_workspace'
  ), 'RPC create_workspace tidak ditemukan';

  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'accept_invitation'
  ), 'RPC accept_invitation tidak ditemukan';

  assert exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'check_sod'
  ), 'Fungsi private.check_sod tidak ditemukan';

  assert exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'workspace_members'
       and column_name  = 'invitation_token'
  ), 'Kolom invitation_token tidak ada di workspace_members';

  raise notice 'Migration 0008 assertions lulus.';
end;
$$;
