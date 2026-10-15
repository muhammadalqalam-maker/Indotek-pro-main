-- =============================================================================
-- INDOTEK PRO - FULL CONSOLIDATED SUPABASE MIGRATION
-- =============================================================================



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START: 20261012000001_schema.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- Indotek Pro — Migrasi Supabase 1/4: SCHEMA INTI (multi-tenant)
-- Pemetaan dari Firestore: workspaces/{wsId}/<koleksi> -> tabel dengan kolom workspace_id
-- Semua uang = bigint Rupiah. Semua waktu = timestamptz (disimpan UTC).
-- =============================================================================

create schema if not exists private;          -- helper internal, TIDAK diekspos Data API
revoke all on schema private from public;

create type public.app_role as enum (
  'owner',               -- Owner / Director
  'project_manager',     -- Project Manager
  'site_manager',        -- Site Manager / Supervisor
  'quantity_surveyor',   -- Quantity Surveyor / Estimator
  'finance',             -- Finance / Accounting
  'procurement',         -- Procurement
  'warehouse',           -- Warehouse / Inventory
  'auditor'              -- Read-only Auditor
);
create type public.member_status as enum ('Aktif', 'Nonaktif', 'Menunggu Undangan');

create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- Identitas ----------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null default '',
  full_name   text not null default '',
  nip         text not null default '',
  phone       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name        text not null,
  settings    jsonb not null default '{"currency":"IDR","language":"id","tableDensity":"comfortable"}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         public.app_role not null,
  department   text not null default '',
  status       public.member_status not null default 'Aktif',
  all_projects boolean not null default false,   -- pengganti assignedProjectIds = ['*']
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

-- Matriks izin (port dari hasModulePerm di firestore.rules) — data, bukan kode
create table public.role_permissions (
  role    public.app_role not null,
  module  text not null check (module in ('projects','schedule','budget','materials','procurement','field_reports','team','reports','settings','audit')),
  action  text not null check (action in ('view','create','edit','submit','approve','reject')),
  primary key (role, module, action)
);

-- ---------- Proyek & anak-anaknya ----------
create table public.projects (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  legacy_id        text,                        -- ID Firestore lama (untuk migrasi data)
  code             text not null,
  name             text not null,
  client           text not null default '',
  category         text not null default 'Komersial' check (category in ('Komersial','Infrastruktur','Residensial','Industri')),
  location         text not null default '',
  project_manager  text not null default '',
  site_engineer    text not null default '',
  contract_value   bigint not null default 0 check (contract_value >= 0),
  approved_budget  bigint not null default 0 check (approved_budget >= 0),
  actual_cost      bigint not null default 0 check (actual_cost >= 0),
  start_date       date,
  target_end_date  date,
  progress_actual  numeric(5,2) not null default 0 check (progress_actual between 0 and 100),
  progress_planned numeric(5,2) not null default 0 check (progress_planned between 0 and 100),
  status           text not null default 'Pra-Konstruksi' check (status in ('Berjalan','Selesai','Tertunda','Pra-Konstruksi')),
  schedule_status  text not null default 'Tepat Waktu' check (schedule_status in ('Tepat Waktu','Kritis','Terlambat','Mendahului')),
  image_url        text,
  description      text not null default '',
  total_milestones     int not null default 0,
  completed_milestones int not null default 0,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, code)
);
create index projects_ws_status_idx on public.projects (workspace_id, status);

create table public.project_members (          -- pengganti assignedProjectIds[]
  workspace_id uuid not null,
  project_id   uuid not null,
  user_id      uuid not null,
  created_at   timestamptz not null default now(),
  primary key (project_id, user_id),
  foreign key (workspace_id, project_id) references public.projects (workspace_id, id) on delete cascade,
  foreign key (workspace_id, user_id)    references public.workspace_members (workspace_id, user_id) on delete cascade
);
create index project_members_user_idx on public.project_members (user_id);

create table public.budget_lines (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  project_id    uuid not null,
  legacy_id     text,
  code          text not null,
  division_name text not null,
  category      text not null check (category in ('Pekerjaan Struktur','Pekerjaan Arsitektur','Pekerjaan MEP','Pekerjaan Persiapan','Manajemen & Overhead')),
  planned_amount bigint not null default 0,
  actual_amount  bigint not null default 0,
  unit          text not null default '',
  volume        numeric(18,4) not null default 0,
  unit_rate     bigint not null default 0,
  -- ASUMSI: selisih = realisasi - rencana (positif = boros). Samakan dengan projectCalculations.ts bila berbeda.
  variance_amount  bigint generated always as (actual_amount - planned_amount) stored,
  variance_percent numeric(8,2) generated always as (
    case when planned_amount = 0 then 0 else round((actual_amount - planned_amount)::numeric * 100 / planned_amount, 2) end) stored,
  status        text not null default 'Aman' check (status in ('Aman','Peringatan','Overbudget')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (workspace_id, project_id) references public.projects (workspace_id, id) on delete cascade,
  unique (project_id, code)
);

create table public.milestones (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  project_id    uuid not null,
  legacy_id     text,
  title         text not null,
  wbs_code      text not null default '',
  planned_date  date,
  actual_date   date,
  progress      numeric(5,2) not null default 0,
  status        text not null default 'Menunggu' check (status in ('Selesai','Berjalan','Menunggu','Terlambat')),
  weight_percent numeric(5,2) not null default 0,
  signed_off_by uuid references auth.users(id),
  signed_off_at timestamptz,
  bast_ref      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (workspace_id, project_id) references public.projects (workspace_id, id) on delete cascade
);
create index milestones_project_idx on public.milestones (project_id);

create table public.wbs_items (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  project_id    uuid not null,
  legacy_id     text,
  code          text not null,
  name          text not null,
  category      text not null default '',
  duration_days int not null default 0,
  start_date    date,
  end_date      date,
  planned_progress numeric(5,2) not null default 0,
  actual_progress  numeric(5,2) not null default 0,
  status        text not null default 'Belum Mulai' check (status in ('Selesai','Berjalan','Terlambat','Belum Mulai')),
  critical_path boolean not null default false,
  assigned_team text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (workspace_id, project_id) references public.projects (workspace_id, id) on delete cascade,
  unique (project_id, code)
);

create table public.budget_versions (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  project_id    uuid not null,
  legacy_id     text,
  version_number text not null,                 -- "v0 Kontrak Induk", "v1 Addendum 1"
  effective_date date,
  approved_by   uuid references auth.users(id),
  revision_id   uuid,
  total_planned_amount bigint not null default 0,
  description   text not null default '',
  division_amounts jsonb not null default '{}',
  notes         text,
  created_at    timestamptz not null default now(),
  foreign key (workspace_id, project_id) references public.projects (workspace_id, id) on delete cascade
);

create table public.activities (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  project_id    uuid not null,
  user_name     text not null,
  action        text not null,
  type          text not null check (type in ('progress','cost','material','report','milestone')),
  created_at    timestamptz not null default now(),
  foreign key (workspace_id, project_id) references public.projects (workspace_id, id) on delete cascade
);
create index activities_ws_created_idx on public.activities (workspace_id, created_at desc);

-- ---------- Material & stok ----------
create table public.materials (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  legacy_id     text,
  code          text not null,
  name          text not null,
  specification text not null default '',
  category      text not null check (category in ('Semen & Pasir','Besi & Baja','Beton Readymix','Arsitektural','MEP & Utilitas')),
  unit          text not null,
  current_stock int not null default 0 check (current_stock >= 0),   -- jaminan stok tidak negatif di level DB
  min_stock     int not null default 0 check (min_stock >= 0),
  allocated_project_id uuid,
  warehouse_location text not null default '',
  primary_supplier   text not null default '',
  unit_price    bigint not null default 0,
  last_restocked timestamptz,
  status        text not null default 'Aman' check (status in ('Aman','Menipis','Kritis')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, code),
  foreign key (workspace_id, allocated_project_id) references public.projects (workspace_id, id) on delete set null (allocated_project_id)
);

create table public.stock_mutations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  material_id   uuid not null,
  material_name text not null,
  type          text not null check (type in ('Masuk','Keluar')),
  quantity      int not null check (quantity > 0),
  unit          text not null,
  reference_no  text not null default '',
  project_id    uuid,
  handler       text not null default '',
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  foreign key (workspace_id, material_id) references public.materials (workspace_id, id) on delete cascade
);
create index stock_mutations_material_idx on public.stock_mutations (material_id, created_at desc);
create index stock_mutations_ws_idx on public.stock_mutations (workspace_id, created_at desc);

create table public.stock_adjustments (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  material_id   uuid not null,
  project_id    uuid,
  adjustment_no text not null,
  previous_stock int not null,
  physical_stock int not null check (physical_stock >= 0),
  variance_quantity int generated always as (physical_stock - previous_stock) stored,
  reason        text not null check (reason in ('Kerusakan Fisik di Site','Susut / Faktor Cuaca','Selisih Bongkar Muat','Retur Pekerjaan Subkon','Koreksi Opname Fisik')),
  evidence_ref  text not null default '',
  status        text not null default 'Menunggu' check (status in ('Menunggu','Disetujui','Ditolak')),
  submitted_by  uuid references auth.users(id),
  submitted_at  timestamptz not null default now(),
  reviewed_by   uuid references auth.users(id),
  reviewed_at   timestamptz,
  rejection_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (workspace_id, material_id) references public.materials (workspace_id, id) on delete cascade,
  unique (workspace_id, adjustment_no)
);

-- ---------- Pengadaan, laporan lapangan, anggaran, kas kecil ----------
create table public.purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  project_id    uuid not null,
  legacy_id     text,
  po_number     text not null,
  spp_number    text not null default '',
  supplier_name text not null,
  item_description text not null default '',
  quantity_summary text not null default '',
  total_cost    bigint not null check (total_cost >= 0),
  request_date  date not null default current_date,
  target_delivery_date date,
  status        text not null default 'Menunggu' check (status in ('Draft','Menunggu','Disetujui','Ditolak','Dikirim','Selesai')),
  requester_id  uuid references auth.users(id),
  requester_name text not null default '',
  approved_by   uuid references auth.users(id),
  approved_by_name text,
  approved_at   timestamptz,
  rejected_by   uuid references auth.users(id),
  rejected_at   timestamptz,
  rejection_reason text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (workspace_id, project_id) references public.projects (workspace_id, id) on delete restrict,
  unique (workspace_id, po_number)
);
create index purchase_orders_ws_status_idx on public.purchase_orders (workspace_id, status, created_at desc);
create index purchase_orders_project_idx on public.purchase_orders (project_id);

create table public.field_reports (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  project_id    uuid not null,
  legacy_id     text,
  report_number text not null,
  report_date   date not null,
  weather_morning   text not null default 'Cerah' check (weather_morning in ('Cerah','Berawan','Hujan Ringan','Hujan Deras')),
  weather_afternoon text not null default 'Cerah' check (weather_afternoon in ('Cerah','Berawan','Hujan Ringan','Hujan Deras')),
  working_hours numeric(4,1) not null default 8,
  site_supervisor_id uuid references auth.users(id),
  site_supervisor_name text not null default '',
  workforce       jsonb not null default '[]',
  completed_works jsonb not null default '[]',
  materials_used  jsonb not null default '[]',
  equipment_used  jsonb not null default '[]',
  blockers      text,
  status        text not null default 'Draft' check (status in ('Draft','Diverifikasi','Disetujui','Perlu Revisi')),
  verified_by   uuid references auth.users(id),
  verified_at   timestamptz,
  approved_by   uuid references auth.users(id),
  approved_at   timestamptz,
  reviewer_notes text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (workspace_id, project_id) references public.projects (workspace_id, id) on delete restrict,
  unique (workspace_id, report_number)
);
create index field_reports_project_date_idx on public.field_reports (project_id, report_date desc);

create table public.budget_revisions (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  project_id    uuid not null,
  legacy_id     text,
  revision_number text not null,
  title         text not null,
  division_name text not null,
  original_amount bigint not null,
  proposed_amount bigint not null,
  variance_amount bigint generated always as (proposed_amount - original_amount) stored,
  justification text not null default '',
  status        text not null default 'Menunggu' check (status in ('Draft','Menunggu','Disetujui','Ditolak')),
  submitted_by  uuid references auth.users(id),
  submitted_at  timestamptz not null default now(),
  reviewed_by   uuid references auth.users(id),
  reviewed_at   timestamptz,
  rejection_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (workspace_id, project_id) references public.projects (workspace_id, id) on delete restrict,
  unique (workspace_id, revision_number)
);

create table public.petty_cash (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  project_id    uuid not null,
  legacy_id     text,
  petty_cash_no text not null,
  requester_id  uuid references auth.users(id),
  requester_name text not null default '',
  amount        bigint not null check (amount > 0),
  category      text not null check (category in ('Konsumsi & Lembur','BBM & Logistik Ringan','K3 & Obat P3K','Perkakas Kecil & Baut','Lain-lain')),
  purpose       text not null default '',
  receipt_path  text,                           -- path di Supabase Storage (bukan URL publik)
  status        text not null default 'Menunggu' check (status in ('Draft','Menunggu','Disetujui','Ditolak','Dicairkan')),
  submitted_at  timestamptz not null default now(),
  reviewed_by   uuid references auth.users(id),
  reviewed_at   timestamptz,
  disbursed_by  uuid references auth.users(id),
  disbursed_at  timestamptz,
  rejection_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (workspace_id, project_id) references public.projects (workspace_id, id) on delete restrict,
  unique (workspace_id, petty_cash_no)
);

-- ---------- Notifikasi, audit, lampiran, infrastruktur workflow ----------
create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  title         text not null,
  message       text not null,
  type          text not null default 'info' check (type in ('warning','info','success','alert')),
  target_screen text,
  target_roles  public.app_role[] not null default '{}',
  recipient_id  uuid references auth.users(id),
  project_id    uuid,
  dedup_key     text,
  created_at    timestamptz not null default now()
);
create unique index notifications_dedup_idx on public.notifications (workspace_id, dedup_key) where dedup_key is not null;
create index notifications_ws_created_idx on public.notifications (workspace_id, created_at desc);

-- status "dibaca" per pengguna (di Firestore hanya 1 flag per dokumen, salah untuk notifikasi berbasis peran)
create table public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create table public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  action        text not null,
  record_type   text not null,
  record_id     uuid,
  actor_id      uuid references auth.users(id),
  actor_name    text not null default '',
  actor_role    public.app_role,
  project_id    uuid,
  details       text not null default '',
  previous_value text not null default '',
  new_value     text not null default '',
  metadata      jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
create index audit_logs_ws_created_idx on public.audit_logs (workspace_id, created_at desc);
create index audit_logs_record_idx on public.audit_logs (record_type, record_id);

create table public.attachments (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  record_type   text not null check (record_type in ('field_report','petty_cash','purchase_order','stock_adjustment','project')),
  record_id     uuid not null,
  storage_path  text not null unique,           -- <workspace_id>/<record_type>/<record_id>/<file>
  caption       text not null default '',
  mime_type     text,
  size_bytes    bigint,
  uploaded_by   uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
create index attachments_record_idx on public.attachments (record_type, record_id);

create table public.doc_counters (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  year         int  not null,
  doc_type     text not null,
  last_number  int  not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, year, doc_type)
);

create table public.idempotency_keys (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key          text not null,
  user_id      uuid,
  result       jsonb,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '24 hours',
  primary key (workspace_id, key)
);
create index idempotency_expires_idx on public.idempotency_keys (expires_at);

-- ---------- Trigger updated_at ----------
do $$
declare t text;
begin
  foreach t in array array['profiles','workspaces','workspace_members','projects','budget_lines','milestones',
    'wbs_items','materials','stock_adjustments','purchase_orders','field_reports','budget_revisions','petty_cash']
  loop
    execute format('create trigger trg_touch_%1$s before update on public.%1$I for each row execute function private.touch_updated_at()', t);
  end loop;
end $$;

-- ---------- Profil otomatis saat user baru terdaftar di auth ----------
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''),
          coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email,''), '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------- Audit log bersifat WORM: tidak boleh diubah/dihapus, siapa pun perannya ----------
create or replace function private.block_audit_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'audit_logs bersifat append-only' using errcode = '42501'; end $$;
create trigger trg_audit_worm before update or delete on public.audit_logs
  for each row execute function private.block_audit_mutation();
-- Catatan: workspaces tidak punya policy DELETE sehingga tenant tidak bisa dihapus lewat Data API.
-- Menghapus tenant utuh = tugas admin DB (nonaktifkan trigger ini sementara, lalu aktifkan lagi).


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START: 20261012000002_rls.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START: 20261012000003_workflows.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- Indotek Pro — Migrasi Supabase 3/4: WORKFLOW TRANSAKSIONAL (RPC)
-- Pengganti Express + Firebase Admin (src/server/workflows/*). Tiap fungsi = 1 transaksi atomik:
-- baris dikunci (FOR UPDATE), cek peran & penugasan proyek, Segregation of Duties, state machine,
-- audit log, notifikasi, dan idempotensi.
-- Cakupan file ini : nomor dokumen, Purchase Order, mutasi stok (anti-negatif), Kas Kecil,
--                    terima undangan, bootstrap workspace, revisi anggaran (budget revision),
--                    penyesuaian stok opname (stock adjustment), laporan harian (field report),
--                    dan pengesahan milestone (milestone sign-off).
-- =============================================================================

-- ---------- Helper internal (schema private) ----------
create or replace function private.rp(n bigint) returns text
language sql immutable set search_path = '' as $$
  select 'Rp ' || replace(to_char(n, 'FM999,999,999,999,999'), ',', '.');
$$;

create or replace function private.require_actor(ws uuid)
returns table (uid uuid, actor_name text, actor_role public.app_role)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sesi tidak valid. Silakan login kembali.' using errcode = '28000';
  end if;
  return query
    select m.user_id, coalesce(nullif(p.full_name, ''), p.email), m.role
    from public.workspace_members m join public.profiles p on p.id = m.user_id
    where m.workspace_id = ws and m.user_id = (select auth.uid()) and m.status = 'Aktif';
  if not found then
    raise exception 'Akses ditolak: Anda bukan anggota aktif workspace ini.' using errcode = '42501';
  end if;
end $$;

-- Nomor dokumen berurutan & bebas tabrakan (UPSERT mengunci baris counter). Tahun mengikuti WITA, tidak di-hardcode.
create or replace function private.next_doc_number(
  p_ws uuid, p_type text, p_code text default 'IND',
  p_year int default extract(year from (now() at time zone 'Asia/Makassar'))::int)
returns text language plpgsql security definer set search_path = '' as $$
declare n int; code text;
begin
  if p_type not in ('PO','ADD-REV','LHP','KAS','ADJ') then
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
  return format('ADJ-%s-%s-%s', code, p_year, lpad(n::text, 4, '0'));
end $$;

-- Idempotensi: klaim kunci di awal transaksi; kalau sudah pernah selesai, kembalikan hasil lama.
create or replace function private.idem_begin(p_ws uuid, p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare inserted int; r record;
begin
  if p_key is null or p_key = '' then return null; end if;
  delete from public.idempotency_keys where workspace_id = p_ws and key = p_key and expires_at < now();
  insert into public.idempotency_keys (workspace_id, key, user_id)
  values (p_ws, p_key, (select auth.uid())) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 1 then return null; end if;
  select * into r from public.idempotency_keys where workspace_id = p_ws and key = p_key;
  if r.user_id is distinct from (select auth.uid()) then
    raise exception 'Idempotency key sudah dipakai pengguna lain' using errcode = '23505';
  end if;
  return r.result;
end $$;

create or replace function private.idem_end(p_ws uuid, p_key text, p_result jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_key is null or p_key = '' then return; end if;
  update public.idempotency_keys set result = p_result where workspace_id = p_ws and key = p_key;
end $$;

create or replace function private.write_audit(
  p_ws uuid, p_uid uuid, p_name text, p_role public.app_role, p_action text, p_record_type text,
  p_record_id uuid, p_project_id uuid, p_details text, p_prev text default '', p_new text default '', p_meta jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (workspace_id, action, record_type, record_id, actor_id, actor_name, actor_role,
                                 project_id, details, previous_value, new_value, metadata)
  values (p_ws, p_action, p_record_type, p_record_id, p_uid, p_name, p_role, p_project_id, p_details, p_prev, p_new, p_meta);
$$;

create or replace function private.notify(
  p_ws uuid, p_title text, p_message text, p_type text, p_roles public.app_role[],
  p_screen text, p_project_id uuid default null, p_dedup text default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (workspace_id, title, message, type, target_roles, target_screen, project_id, dedup_key)
  values (p_ws, p_title, p_message, p_type, p_roles, p_screen, p_project_id, p_dedup)
  on conflict (workspace_id, dedup_key) where dedup_key is not null do nothing;
$$;

-- ASUMSI ambang status stok: Kritis <= 50% min, Menipis <= min. Samakan dengan logika di MaterialsContext bila berbeda.
create or replace function private.material_status(stock int, min_stock int) returns text
language sql immutable set search_path = '' as $$
  select case when stock <= min_stock / 2.0 then 'Kritis' when stock <= min_stock then 'Menipis' else 'Aman' end;
$$;

-- =============================================================================
-- PURCHASE ORDER
-- =============================================================================
create or replace function public.create_purchase_order(
  p_workspace_id uuid, p_project_id uuid, p_supplier_name text, p_item_description text,
  p_quantity_summary text, p_total_cost bigint, p_target_delivery_date date default null,
  p_submit boolean default true, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record; cached jsonb; proj record; v_id uuid; v_no text; v_year int; v_status text; res jsonb;
begin
  select * into a from private.require_actor(p_workspace_id);
  cached := private.idem_begin(p_workspace_id, p_idempotency_key);
  if cached is not null then return cached || jsonb_build_object('idempotentReplay', true); end if;

  if not private.has_perm(p_workspace_id, 'procurement', 'create') then
    raise exception 'Peran "%" tidak berhak membuat Purchase Order.', a.actor_role using errcode = '42501';
  end if;
  select id, code, name into proj from public.projects where id = p_project_id and workspace_id = p_workspace_id;
  if not found then raise exception 'Proyek tidak ditemukan.' using errcode = 'P0002'; end if;
  if not private.is_assigned(p_workspace_id, p_project_id) then
    raise exception 'Akses ditolak: Anda tidak ditugaskan pada proyek "%".', proj.name using errcode = '42501';
  end if;
  if coalesce(p_total_cost, 0) <= 0 then raise exception 'Total biaya PO harus lebih dari 0.'; end if;
  if coalesce(trim(p_supplier_name), '') = '' then raise exception 'Nama pemasok wajib diisi.'; end if;

  v_year := extract(year from (now() at time zone 'Asia/Makassar'))::int;
  v_no := private.next_doc_number(p_workspace_id, 'PO', proj.code, v_year);
  v_status := case when p_submit then 'Menunggu' else 'Draft' end;

  insert into public.purchase_orders (workspace_id, project_id, po_number, spp_number, supplier_name, item_description,
      quantity_summary, total_cost, target_delivery_date, status, requester_id, requester_name, created_by)
  values (p_workspace_id, p_project_id, v_no, 'SPP-' || v_year || '-' || split_part(v_no, '-', 4), p_supplier_name,
      coalesce(p_item_description, ''), coalesce(p_quantity_summary, ''), p_total_cost, p_target_delivery_date,
      v_status, a.uid, a.actor_name, a.uid)
  returning id into v_id;

  perform private.write_audit(p_workspace_id, a.uid, a.actor_name, a.actor_role, 'PO_CREATED', 'purchase_order', v_id,
      p_project_id, format('Membuat Purchase Order %s senilai %s', v_no, private.rp(p_total_cost)), 'None', v_status);
  if p_submit then
    perform private.notify(p_workspace_id, 'Pengajuan PO Baru Menunggu Persetujuan',
        format('%s (%s) senilai %s diajukan oleh %s.', v_no, coalesce(nullif(p_item_description, ''), 'Pengadaan'), private.rp(p_total_cost), a.actor_name),
        'info', array['owner','project_manager','finance']::public.app_role[], 'procurement', p_project_id);
  end if;

  res := jsonb_build_object('success', true, 'message', format('PO %s berhasil diajukan untuk otorisasi.', v_no),
                            'data', jsonb_build_object('id', v_id, 'poNumber', v_no, 'status', v_status));
  perform private.idem_end(p_workspace_id, p_idempotency_key, res);
  return res;
end $$;

create or replace function public.decide_purchase_order(
  p_workspace_id uuid, p_po_id uuid, p_decision text, p_reason text default null, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record; cached jsonb; po record; proj record; res jsonb; v_new text; v_committed bigint;
begin
  if p_decision not in ('approve', 'reject') then raise exception 'Keputusan harus approve atau reject.'; end if;
  select * into a from private.require_actor(p_workspace_id);
  cached := private.idem_begin(p_workspace_id, p_idempotency_key);
  if cached is not null then return cached || jsonb_build_object('idempotentReplay', true); end if;

  select * into po from public.purchase_orders where id = p_po_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'Purchase Order tidak ditemukan.' using errcode = 'P0002'; end if;
  if not private.is_assigned(p_workspace_id, po.project_id) then
    raise exception 'Akses ditolak: Anda tidak ditugaskan pada proyek ini.' using errcode = '42501';
  end if;
  if not private.has_perm(p_workspace_id, 'procurement', p_decision) then
    raise exception 'Peran "%" tidak memiliki hak % PO.', a.actor_role, p_decision using errcode = '42501';
  end if;
  if po.status <> 'Menunggu' then
    raise exception 'Transisi status tidak valid: dokumen berstatus "%". Hanya "Menunggu" yang dapat diproses.', po.status;
  end if;

  if p_decision = 'approve' then
    -- Segregation of Duties: pembuat tidak boleh menyetujui dokumennya sendiri (berlaku juga untuk Owner)
    if po.requester_id = a.uid or po.created_by = a.uid then
      raise exception 'Segregation of Duties (SoD) dilanggar: pembuat dokumen tidak boleh menyetujui dokumen sendiri.' using errcode = '42501';
    end if;
    -- Cek sisa pagu (proyek dikunci agar dua persetujuan bersamaan tidak sama-sama lolos)
    -- PERBAIKAN dari versi Firebase: PO yang sudah Disetujui/Dikirim (komitmen belum terealisasi) ikut dihitung.
    -- Versi lama hanya membandingkan actual_cost (angka hitungan klien) sehingga PO disetujui tidak pernah mengurangi sisa pagu.
    select approved_budget, actual_cost into proj from public.projects
      where id = po.project_id and workspace_id = p_workspace_id for update;
    select coalesce(sum(total_cost), 0)::bigint into v_committed from public.purchase_orders
      where project_id = po.project_id and status in ('Disetujui', 'Dikirim') and id <> po.id;
    if proj.approved_budget > 0 and proj.actual_cost + v_committed + po.total_cost > proj.approved_budget then
      raise exception 'Nilai PO % melebihi sisa anggaran proyek (sisa pagu: %, anggaran: %, aktual: %, komitmen PO: %). Ajukan revisi anggaran terlebih dahulu.',
        private.rp(po.total_cost), private.rp(greatest(0, proj.approved_budget - proj.actual_cost - v_committed)),
        private.rp(proj.approved_budget), private.rp(proj.actual_cost), private.rp(v_committed);
    end if;
    update public.purchase_orders set status = 'Disetujui', approved_by = a.uid, approved_by_name = a.actor_name, approved_at = now()
      where id = po.id;
    v_new := 'Disetujui';
    perform private.write_audit(p_workspace_id, a.uid, a.actor_name, a.actor_role, 'PO_APPROVED', 'purchase_order', po.id,
        po.project_id, format('Menyetujui Purchase Order %s senilai %s', po.po_number, private.rp(po.total_cost)), po.status, v_new);
    perform private.notify(p_workspace_id, 'Purchase Order Disetujui',
        format('%s senilai %s disetujui oleh %s.', po.po_number, private.rp(po.total_cost), a.actor_name),
        'success', array['procurement','project_manager','warehouse']::public.app_role[], 'procurement', po.project_id);
  else
    if coalesce(trim(p_reason), '') = '' then raise exception 'Alasan penolakan PO wajib disertakan.'; end if;
    update public.purchase_orders set status = 'Ditolak', rejected_by = a.uid, rejected_at = now(), rejection_reason = p_reason
      where id = po.id;
    v_new := 'Ditolak';
    perform private.write_audit(p_workspace_id, a.uid, a.actor_name, a.actor_role, 'PO_REJECTED', 'purchase_order', po.id,
        po.project_id, format('Menolak Purchase Order %s. Alasan: %s', po.po_number, p_reason), po.status, v_new);
    perform private.notify(p_workspace_id, 'Purchase Order Ditolak',
        format('%s ditolak oleh %s. Alasan: %s', po.po_number, a.actor_name, p_reason),
        'alert', array['procurement','project_manager']::public.app_role[], 'procurement', po.project_id);
  end if;

  res := jsonb_build_object('success', true, 'message', format('PO %s berstatus %s.', po.po_number, v_new),
                            'data', jsonb_build_object('poId', po.id, 'status', v_new, 'actor', a.actor_name));
  perform private.idem_end(p_workspace_id, p_idempotency_key, res);
  return res;
end $$;

-- Progres logistik: Disetujui -> Dikirim -> Selesai (lebih ketat dari rules lama yang membolehkan lompat langsung ke Selesai)
create or replace function public.advance_purchase_order(
  p_workspace_id uuid, p_po_id uuid, p_to_status text, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record; cached jsonb; po record; res jsonb;
begin
  select * into a from private.require_actor(p_workspace_id);
  cached := private.idem_begin(p_workspace_id, p_idempotency_key);
  if cached is not null then return cached || jsonb_build_object('idempotentReplay', true); end if;
  if p_to_status not in ('Dikirim', 'Selesai') then raise exception 'Status tujuan harus Dikirim atau Selesai.'; end if;
  if a.actor_role not in ('owner', 'project_manager', 'procurement', 'warehouse') then
    raise exception 'Peran "%" tidak berhak memperbarui status logistik PO.', a.actor_role using errcode = '42501';
  end if;
  select * into po from public.purchase_orders where id = p_po_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'Purchase Order tidak ditemukan.' using errcode = 'P0002'; end if;
  if not private.is_assigned(p_workspace_id, po.project_id) then
    raise exception 'Akses ditolak: Anda tidak ditugaskan pada proyek ini.' using errcode = '42501';
  end if;
  if not ((po.status = 'Disetujui' and p_to_status = 'Dikirim') or (po.status = 'Dikirim' and p_to_status = 'Selesai')) then
    raise exception 'Transisi % -> % tidak valid.', po.status, p_to_status;
  end if;
  update public.purchase_orders set status = p_to_status where id = po.id;
  perform private.write_audit(p_workspace_id, a.uid, a.actor_name, a.actor_role, 'PO_STATUS_CHANGED', 'purchase_order', po.id,
      po.project_id, format('Status PO %s: %s -> %s', po.po_number, po.status, p_to_status), po.status, p_to_status);
  res := jsonb_build_object('success', true, 'message', format('PO %s kini %s.', po.po_number, p_to_status),
                            'data', jsonb_build_object('poId', po.id, 'status', p_to_status));
  perform private.idem_end(p_workspace_id, p_idempotency_key, res);
  return res;
end $$;

-- =============================================================================
-- MUTASI STOK (Masuk/Keluar) — stok tidak pernah negatif (dijamin juga oleh CHECK di tabel)
-- =============================================================================
create or replace function public.record_stock_mutation(
  p_workspace_id uuid, p_material_id uuid, p_type text, p_quantity int, p_reference_no text,
  p_project_id uuid default null, p_handler text default '', p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record; cached jsonb; m record; v_new_stock int; res jsonb; v_id uuid;
begin
  select * into a from private.require_actor(p_workspace_id);
  cached := private.idem_begin(p_workspace_id, p_idempotency_key);
  if cached is not null then return cached || jsonb_build_object('idempotentReplay', true); end if;
  if not private.has_perm(p_workspace_id, 'materials', 'submit') then
    raise exception 'Peran "%" tidak berhak mencatat mutasi stok.', a.actor_role using errcode = '42501';
  end if;
  if p_type not in ('Masuk', 'Keluar') then raise exception 'Tipe mutasi harus Masuk atau Keluar.'; end if;
  if coalesce(p_quantity, 0) <= 0 then raise exception 'Kuantitas harus lebih dari 0.'; end if;
  if p_project_id is not null and not private.is_assigned(p_workspace_id, p_project_id) then
    raise exception 'Akses ditolak: Anda tidak ditugaskan pada proyek tujuan.' using errcode = '42501';
  end if;

  select * into m from public.materials where id = p_material_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'Material tidak ditemukan.' using errcode = 'P0002'; end if;

  v_new_stock := m.current_stock + case when p_type = 'Masuk' then p_quantity else -p_quantity end;
  if v_new_stock < 0 then
    raise exception 'Stok tidak mencukupi: tersedia % %, diminta %.', m.current_stock, m.unit, p_quantity;
  end if;

  update public.materials
     set current_stock = v_new_stock,
         status = private.material_status(v_new_stock, m.min_stock),
         last_restocked = case when p_type = 'Masuk' then now() else m.last_restocked end
   where id = m.id;

  insert into public.stock_mutations (workspace_id, material_id, material_name, type, quantity, unit, reference_no,
                                      project_id, handler, created_by)
  values (p_workspace_id, m.id, m.name, p_type, p_quantity, m.unit, coalesce(p_reference_no, ''), p_project_id,
          coalesce(nullif(p_handler, ''), a.actor_name), a.uid)
  returning id into v_id;

  perform private.write_audit(p_workspace_id, a.uid, a.actor_name, a.actor_role, 'STOCK_MUTATION', 'stock_mutation', v_id,
      p_project_id, format('Mutasi %s %s %s %s (ref %s)', p_type, p_quantity, m.unit, m.name, coalesce(p_reference_no, '-')),
      m.current_stock::text, v_new_stock::text);
  if private.material_status(v_new_stock, m.min_stock) <> 'Aman' then
    perform private.notify(p_workspace_id, 'Stok Material ' || private.material_status(v_new_stock, m.min_stock),
        format('%s tersisa %s %s (minimum %s).', m.name, v_new_stock, m.unit, m.min_stock),
        'warning', array['owner','project_manager','procurement','warehouse']::public.app_role[], 'materials', null,
        'stock-' || m.id || '-' || private.material_status(v_new_stock, m.min_stock) || '-' || to_char(now() at time zone 'Asia/Makassar', 'YYYYMMDD'));
  end if;

  res := jsonb_build_object('success', true, 'message', format('Mutasi %s %s berhasil dicatat.', p_type, m.name),
                            'data', jsonb_build_object('mutationId', v_id, 'newStock', v_new_stock));
  perform private.idem_end(p_workspace_id, p_idempotency_key, res);
  return res;
end $$;

-- =============================================================================
-- KAS KECIL (petty cash): ajukan -> setujui/tolak -> cairkan
-- ASUMSI peran: pengaju = owner/PM/site_manager/procurement/warehouse; pencair = owner/finance (samakan dengan pettyCash.ts)
-- =============================================================================
create or replace function public.create_petty_cash(
  p_workspace_id uuid, p_project_id uuid, p_amount bigint, p_category text, p_purpose text,
  p_receipt_path text default null, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record; cached jsonb; proj record; v_no text; v_id uuid; res jsonb;
begin
  select * into a from private.require_actor(p_workspace_id);
  cached := private.idem_begin(p_workspace_id, p_idempotency_key);
  if cached is not null then return cached || jsonb_build_object('idempotentReplay', true); end if;
  if a.actor_role not in ('owner','project_manager','site_manager','procurement','warehouse') then
    raise exception 'Peran "%" tidak berhak mengajukan kas kecil.', a.actor_role using errcode = '42501';
  end if;
  select id, code, name into proj from public.projects where id = p_project_id and workspace_id = p_workspace_id;
  if not found then raise exception 'Proyek tidak ditemukan.' using errcode = 'P0002'; end if;
  if not private.is_assigned(p_workspace_id, p_project_id) then
    raise exception 'Akses ditolak: Anda tidak ditugaskan pada proyek "%".', proj.name using errcode = '42501';
  end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Nominal kas kecil harus lebih dari 0.'; end if;
  if p_receipt_path is not null and p_receipt_path not like p_workspace_id::text || '/%' then
    raise exception 'Path bukti tidak valid untuk workspace ini.';
  end if;

  v_no := private.next_doc_number(p_workspace_id, 'KAS', proj.code);
  insert into public.petty_cash (workspace_id, project_id, petty_cash_no, requester_id, requester_name, amount, category,
                                 purpose, receipt_path, status)
  values (p_workspace_id, p_project_id, v_no, a.uid, a.actor_name, p_amount, p_category, coalesce(p_purpose, ''),
          p_receipt_path, 'Menunggu')
  returning id into v_id;

  perform private.write_audit(p_workspace_id, a.uid, a.actor_name, a.actor_role, 'PETTY_CASH_CREATED', 'petty_cash', v_id,
      p_project_id, format('Mengajukan kas kecil %s senilai %s (%s)', v_no, private.rp(p_amount), p_category), 'None', 'Menunggu');
  perform private.notify(p_workspace_id, 'Pengajuan Kas Kecil Baru',
      format('%s senilai %s diajukan oleh %s.', v_no, private.rp(p_amount), a.actor_name),
      'info', array['owner','project_manager','finance']::public.app_role[], 'budget', p_project_id);

  res := jsonb_build_object('success', true, 'message', format('Kas kecil %s berhasil diajukan.', v_no),
                            'data', jsonb_build_object('id', v_id, 'pettyCashNo', v_no, 'status', 'Menunggu'));
  perform private.idem_end(p_workspace_id, p_idempotency_key, res);
  return res;
end $$;

create or replace function public.decide_petty_cash(
  p_workspace_id uuid, p_petty_cash_id uuid, p_decision text, p_reason text default null, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record; cached jsonb; pc record; res jsonb; v_new text;
begin
  if p_decision not in ('approve', 'reject') then raise exception 'Keputusan harus approve atau reject.'; end if;
  select * into a from private.require_actor(p_workspace_id);
  cached := private.idem_begin(p_workspace_id, p_idempotency_key);
  if cached is not null then return cached || jsonb_build_object('idempotentReplay', true); end if;
  if not private.has_perm(p_workspace_id, 'budget', p_decision) then
    raise exception 'Peran "%" tidak memiliki hak % kas kecil.', a.actor_role, p_decision using errcode = '42501';
  end if;
  select * into pc from public.petty_cash where id = p_petty_cash_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'Kas kecil tidak ditemukan.' using errcode = 'P0002'; end if;
  if not private.is_assigned(p_workspace_id, pc.project_id) then
    raise exception 'Akses ditolak: Anda tidak ditugaskan pada proyek ini.' using errcode = '42501';
  end if;
  if pc.status <> 'Menunggu' then
    raise exception 'Transisi status tidak valid: dokumen berstatus "%".', pc.status;
  end if;
  if p_decision = 'approve' then
    if pc.requester_id = a.uid then
      raise exception 'Segregation of Duties (SoD) dilanggar: pemohon tidak boleh menyetujui kas kecil sendiri.' using errcode = '42501';
    end if;
    update public.petty_cash set status = 'Disetujui', reviewed_by = a.uid, reviewed_at = now() where id = pc.id;
    v_new := 'Disetujui';
  else
    if coalesce(trim(p_reason), '') = '' then raise exception 'Alasan penolakan wajib disertakan.'; end if;
    update public.petty_cash set status = 'Ditolak', reviewed_by = a.uid, reviewed_at = now(), rejection_reason = p_reason where id = pc.id;
    v_new := 'Ditolak';
  end if;
  perform private.write_audit(p_workspace_id, a.uid, a.actor_name, a.actor_role,
      case when p_decision = 'approve' then 'PETTY_CASH_APPROVED' else 'PETTY_CASH_REJECTED' end, 'petty_cash', pc.id,
      pc.project_id, format('%s kas kecil %s senilai %s', v_new, pc.petty_cash_no, private.rp(pc.amount)), pc.status, v_new);
  res := jsonb_build_object('success', true, 'message', format('Kas kecil %s berstatus %s.', pc.petty_cash_no, v_new),
                            'data', jsonb_build_object('id', pc.id, 'status', v_new));
  perform private.idem_end(p_workspace_id, p_idempotency_key, res);
  return res;
end $$;

create or replace function public.disburse_petty_cash(
  p_workspace_id uuid, p_petty_cash_id uuid, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record; cached jsonb; pc record; res jsonb;
begin
  select * into a from private.require_actor(p_workspace_id);
  cached := private.idem_begin(p_workspace_id, p_idempotency_key);
  if cached is not null then return cached || jsonb_build_object('idempotentReplay', true); end if;
  if a.actor_role not in ('owner', 'finance') then
    raise exception 'Hanya Finance atau Owner yang dapat mencairkan kas kecil.' using errcode = '42501';
  end if;
  select * into pc from public.petty_cash where id = p_petty_cash_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'Kas kecil tidak ditemukan.' using errcode = 'P0002'; end if;
  if pc.status <> 'Disetujui' then raise exception 'Hanya kas kecil berstatus "Disetujui" yang dapat dicairkan (saat ini "%").', pc.status; end if;
  if pc.requester_id = a.uid then
    raise exception 'Segregation of Duties (SoD) dilanggar: pemohon tidak boleh mencairkan kas kecil sendiri.' using errcode = '42501';
  end if;
  update public.petty_cash set status = 'Dicairkan', disbursed_by = a.uid, disbursed_at = now() where id = pc.id;
  perform private.write_audit(p_workspace_id, a.uid, a.actor_name, a.actor_role, 'PETTY_CASH_DISBURSED', 'petty_cash', pc.id,
      pc.project_id, format('Mencairkan kas kecil %s senilai %s', pc.petty_cash_no, private.rp(pc.amount)), pc.status, 'Dicairkan');
  res := jsonb_build_object('success', true, 'message', format('Kas kecil %s dicairkan.', pc.petty_cash_no),
                            'data', jsonb_build_object('id', pc.id, 'status', 'Dicairkan'));
  perform private.idem_end(p_workspace_id, p_idempotency_key, res);
  return res;
end $$;

-- =============================================================================
-- UNDANGAN & BOOTSTRAP
-- =============================================================================
-- Dipanggil klien setelah login pertama dari undangan: hanya mengubah 'Menunggu Undangan' -> 'Aktif' untuk dirinya sendiri.
create or replace function public.accept_invitation() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if (select auth.uid()) is null then raise exception 'Sesi tidak valid.' using errcode = '28000'; end if;
  update public.workspace_members set status = 'Aktif'
   where user_id = (select auth.uid()) and status = 'Menunggu Undangan';
  get diagnostics n = row_count;
  return n;
end $$;

-- Dijalankan MANUAL oleh admin database (SQL Editor) untuk membuat workspace + Owner pertama. Tidak bisa dipanggil klien.
create or replace function private.bootstrap_workspace(p_slug text, p_name text, p_owner_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_ws uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(p_owner_email);
  if v_user is null then raise exception 'User % belum ada di auth.users (undang/daftarkan dulu).', p_owner_email; end if;
  insert into public.workspaces (slug, name) values (p_slug, p_name)
    on conflict (slug) do update set name = excluded.name returning id into v_ws;
  insert into public.workspace_members (workspace_id, user_id, role, status, all_projects, department)
    values (v_ws, v_user, 'owner', 'Aktif', true, 'Direksi & Eksekutif')
    on conflict (workspace_id, user_id) do update set role = 'owner', status = 'Aktif', all_projects = true;
  return v_ws;
end $$;

-- =============================================================================
-- REVISI ANGGARAN (BUDGET REVISION / ADDENDUM)
-- =============================================================================
create or replace function public.create_budget_revision(
  p_workspace_id uuid, p_project_id uuid, p_title text, p_division_name text,
  p_original_amount bigint, p_proposed_amount bigint, p_justification text default '',
  p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a record; cached jsonb; proj record; v_no text; v_id uuid; v_var bigint; res jsonb;
begin
  select * into a from private.require_actor(p_workspace_id);
  cached := private.idem_begin(p_workspace_id, p_idempotency_key);
  if cached is not null then return cached || jsonb_build_object('idempotentReplay', true); end if;

  if not private.has_perm(p_workspace_id, 'budget', 'create') and not private.has_perm(p_workspace_id, 'budget', 'submit') then
    raise exception 'Peran "%" tidak berhak mengajukan revisi anggaran.', a.actor_role using errcode = '42501';
  end if;

  select id, code, name into proj from public.projects where id = p_project_id and workspace_id = p_workspace_id;
  if not found then raise exception 'Proyek tidak ditemukan.' using errcode = 'P0002'; end if;
  if not private.is_assigned(p_workspace_id, p_project_id) then
    raise exception 'Akses ditolak: Anda tidak ditugaskan pada proyek "%".', proj.name using errcode = '42501';
  end if;

  if coalesce(trim(p_title), '') = '' then raise exception 'Judul revisi anggaran wajib diisi.'; end if;
  if coalesce(trim(p_division_name), '') = '' then raise exception 'Nama divisi/pos anggaran wajib diisi.'; end if;
  if coalesce(p_original_amount, 0) < 0 then raise exception 'Nilai awal anggaran tidak boleh negatif.'; end if;
  if coalesce(p_proposed_amount, 0) < 0 then raise exception 'Usulan nilai anggaran tidak boleh negatif.'; end if;

  v_no := private.next_doc_number(p_workspace_id, 'ADD-REV', proj.code);
  v_var := p_proposed_amount - p_original_amount;

  insert into public.budget_revisions (
    workspace_id, project_id, revision_number, title, division_name,
    original_amount, proposed_amount, justification, status, submitted_by
  ) values (
    p_workspace_id, p_project_id, v_no, p_title, p_division_name,
    p_original_amount, p_proposed_amount, coalesce(p_justification, ''), 'Menunggu', a.uid
  ) returning id into v_id;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role, 'BUDGET_REVISED', 'budget', v_id,
    p_project_id, format('Mengajukan Addendum Revisi Anggaran %s (%s, selisih %s)', v_no, p_division_name, private.rp(v_var)), 'None', 'Menunggu'
  );

  perform private.notify(
    p_workspace_id, 'Pengajuan Addendum Anggaran Baru',
    format('%s (%s) diajukan oleh %s (%s).', v_no, p_division_name, a.actor_name, private.rp(v_var)),
    'info', array['owner', 'finance']::public.app_role[], 'budget', p_project_id
  );

  res := jsonb_build_object(
    'success', true,
    'message', format('Revisi anggaran %s berhasil diajukan.', v_no),
    'data', jsonb_build_object('id', v_id, 'revisionNumber', v_no, 'status', 'Menunggu')
  );
  perform private.idem_end(p_workspace_id, p_idempotency_key, res);
  return res;
end $$;

create or replace function public.decide_budget_revision(
  p_workspace_id uuid, p_revision_id uuid, p_decision text,
  p_rejection_reason text default null, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a record; cached jsonb; rev record; v_new text; v_old_budget bigint; v_new_budget bigint; res jsonb;
begin
  if p_decision not in ('approve', 'reject') then raise exception 'Keputusan harus approve atau reject.'; end if;
  select * into a from private.require_actor(p_workspace_id);
  cached := private.idem_begin(p_workspace_id, p_idempotency_key);
  if cached is not null then return cached || jsonb_build_object('idempotentReplay', true); end if;

  if not private.has_perm(p_workspace_id, 'budget', p_decision) then
    raise exception 'Peran "%" tidak memiliki hak % revisi anggaran.', a.actor_role, p_decision using errcode = '42501';
  end if;

  select * into rev from public.budget_revisions where id = p_revision_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'Revisi anggaran tidak ditemukan.' using errcode = 'P0002'; end if;
  if not private.is_assigned(p_workspace_id, rev.project_id) then
    raise exception 'Akses ditolak: Anda tidak ditugaskan pada proyek ini.' using errcode = '42501';
  end if;
  if rev.status <> 'Menunggu' then
    raise exception 'Transisi status tidak valid: dokumen berstatus "%". Hanya "Menunggu" yang dapat diproses.', rev.status;
  end if;

  if p_decision = 'approve' then
    if rev.submitted_by = a.uid then
      raise exception 'Segregation of Duties (SoD) dilanggar: pembuat/pengaju revisi tidak boleh menyetujui addendum sendiri.' using errcode = '42501';
    end if;

    select approved_budget into v_old_budget from public.projects where id = rev.project_id and workspace_id = p_workspace_id for update;
    v_new_budget := greatest(0, v_old_budget + rev.variance_amount);

    update public.projects
       set approved_budget = v_new_budget
     where id = rev.project_id;

    update public.budget_lines
       set planned_amount = rev.proposed_amount
     where project_id = rev.project_id and division_name = rev.division_name;

    update public.budget_revisions
       set status = 'Disetujui', reviewed_by = a.uid, reviewed_at = now()
     where id = rev.id;
    v_new := 'Disetujui';

    perform private.write_audit(
      p_workspace_id, a.uid, a.actor_name, a.actor_role, 'BUDGET_APPROVED', 'budget', rev.id,
      rev.project_id, format('Menyetujui Addendum %s (%s): Pagu proyek %s -> %s', rev.revision_number, rev.division_name, private.rp(v_old_budget), private.rp(v_new_budget)),
      format('Pagu: %s', v_old_budget), format('Pagu: %s', v_new_budget),
      jsonb_build_object('lineDivision', rev.division_name, 'lineOldAmount', rev.original_amount, 'lineNewAmount', rev.proposed_amount)
    );

    perform private.notify(
      p_workspace_id, 'Addendum Anggaran Disetujui',
      format('%s telah disetujui oleh %s. Pagu proyek kini %s.', rev.revision_number, a.actor_name, private.rp(v_new_budget)),
      'success', array['owner', 'project_manager', 'quantity_surveyor', 'finance']::public.app_role[], 'budget', rev.project_id
    );
  else
    if coalesce(trim(p_rejection_reason), '') = '' then raise exception 'Alasan penolakan revisi anggaran wajib disertakan.'; end if;
    update public.budget_revisions
       set status = 'Ditolak', reviewed_by = a.uid, reviewed_at = now(), rejection_reason = trim(p_rejection_reason)
     where id = rev.id;
    v_new := 'Ditolak';

    perform private.write_audit(
      p_workspace_id, a.uid, a.actor_name, a.actor_role, 'BUDGET_REJECTED', 'budget', rev.id,
      rev.project_id, format('Menolak Addendum Revisi Anggaran %s. Alasan: %s', rev.revision_number, trim(p_rejection_reason)),
      rev.status, 'Ditolak', jsonb_build_object('rejectionReason', trim(p_rejection_reason))
    );

    perform private.notify(
      p_workspace_id, 'Addendum Anggaran Ditolak',
      format('%s ditolak oleh %s. Alasan: %s', rev.revision_number, a.actor_name, trim(p_rejection_reason)),
      'warning', array['project_manager', 'quantity_surveyor']::public.app_role[], 'budget', rev.project_id
    );
  end if;

  res := jsonb_build_object(
    'success', true,
    'message', format('Revisi anggaran %s berstatus %s.', rev.revision_number, v_new),
    'data', jsonb_build_object('revId', rev.id, 'status', v_new)
  );
  perform private.idem_end(p_workspace_id, p_idempotency_key, res);
  return res;
end $$;

-- =============================================================================
-- PENYESUAIAN STOK (STOCK ADJUSTMENT / OPNAME FISIK)
-- =============================================================================
create or replace function public.create_stock_adjustment(
  p_workspace_id uuid, p_material_id uuid, p_physical_stock int, p_reason text,
  p_project_id uuid default null, p_evidence_ref text default '',
  p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a record; cached jsonb; m record; v_proj_code text; v_no text; v_id uuid; v_var int; res jsonb;
begin
  select * into a from private.require_actor(p_workspace_id);
  cached := private.idem_begin(p_workspace_id, p_idempotency_key);
  if cached is not null then return cached || jsonb_build_object('idempotentReplay', true); end if;

  if not private.has_perm(p_workspace_id, 'materials', 'create') and not private.has_perm(p_workspace_id, 'materials', 'submit') then
    raise exception 'Peran "%" tidak berhak mengajukan penyesuaian stok.', a.actor_role using errcode = '42501';
  end if;

  if p_reason not in ('Kerusakan Fisik di Site','Susut / Faktor Cuaca','Selisih Bongkar Muat','Retur Pekerjaan Subkon','Koreksi Opname Fisik') then
    raise exception 'Alasan penyesuaian stok tidak valid: %', p_reason;
  end if;
  if coalesce(p_physical_stock, -1) < 0 then
    raise exception 'Kuantitas stok fisik tidak boleh negatif.';
  end if;

  select * into m from public.materials where id = p_material_id and workspace_id = p_workspace_id;
  if not found then raise exception 'Material tidak ditemukan.' using errcode = 'P0002'; end if;

  if p_project_id is not null then
    if not private.is_assigned(p_workspace_id, p_project_id) then
      raise exception 'Akses ditolak: Anda tidak ditugaskan pada proyek terkait.' using errcode = '42501';
    end if;
    select code into v_proj_code from public.projects where id = p_project_id and workspace_id = p_workspace_id;
  end if;

  v_no := private.next_doc_number(p_workspace_id, 'ADJ', coalesce(v_proj_code, 'IND'));
  v_var := p_physical_stock - m.current_stock;

  insert into public.stock_adjustments (
    workspace_id, material_id, project_id, adjustment_no, previous_stock, physical_stock,
    reason, evidence_ref, status, submitted_by
  ) values (
    p_workspace_id, p_material_id, p_project_id, v_no, m.current_stock, p_physical_stock,
    p_reason, coalesce(p_evidence_ref, ''), 'Menunggu', a.uid
  ) returning id into v_id;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role, 'STOCK_ADJUSTMENT_SUBMITTED', 'material', v_id,
    p_project_id, format('Mengajukan Berita Acara Opname Stok %s untuk material %s (Selisih: %s %s)', v_no, m.name, v_var, m.unit),
    'None', 'Menunggu'
  );

  perform private.notify(
    p_workspace_id, 'Pengajuan Penyesuaian Stok Opname',
    format('%s diajukan oleh %s (%s).', v_no, a.actor_name, m.name),
    'info', array['warehouse', 'project_manager', 'owner']::public.app_role[], 'materials', p_project_id
  );

  res := jsonb_build_object(
    'success', true,
    'message', format('Penyesuaian stok %s berhasil diajukan.', v_no),
    'data', jsonb_build_object('id', v_id, 'adjustmentNo', v_no, 'status', 'Menunggu')
  );
  perform private.idem_end(p_workspace_id, p_idempotency_key, res);
  return res;
end $$;

create or replace function public.decide_stock_adjustment(
  p_workspace_id uuid, p_adjustment_id uuid, p_decision text,
  p_rejection_reason text default null, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a record; cached jsonb; adj record; m record; v_new text; v_new_status text; v_mut_id uuid; v_var int; res jsonb;
begin
  if p_decision not in ('approve', 'reject') then raise exception 'Keputusan harus approve atau reject.'; end if;
  select * into a from private.require_actor(p_workspace_id);
  cached := private.idem_begin(p_workspace_id, p_idempotency_key);
  if cached is not null then return cached || jsonb_build_object('idempotentReplay', true); end if;

  if not private.has_perm(p_workspace_id, 'materials', p_decision) then
    raise exception 'Peran "%" tidak memiliki hak % penyesuaian stok.', a.actor_role, p_decision using errcode = '42501';
  end if;

  select * into adj from public.stock_adjustments where id = p_adjustment_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'Penyesuaian stok tidak ditemukan.' using errcode = 'P0002'; end if;
  if adj.status <> 'Menunggu' then
    raise exception 'Transisi status tidak valid: dokumen berstatus "%". Hanya "Menunggu" yang dapat diproses.', adj.status;
  end if;

  if p_decision = 'approve' then
    if adj.submitted_by = a.uid then
      raise exception 'Segregation of Duties (SoD) dilanggar: pembuat berita acara opname tidak boleh menyetujui penyesuaian sendiri.' using errcode = '42501';
    end if;

    select * into m from public.materials where id = adj.material_id and workspace_id = p_workspace_id for update;
    if not found then raise exception 'Material terkait tidak ditemukan.' using errcode = 'P0002'; end if;

    v_new_status := private.material_status(adj.physical_stock, m.min_stock);
    update public.materials
       set current_stock = adj.physical_stock,
           status = v_new_status
     where id = m.id;

    v_var := adj.physical_stock - adj.previous_stock;
    insert into public.stock_mutations (
      workspace_id, material_id, material_name, type, quantity, unit, reference_no, project_id, handler, created_by
    ) values (
      p_workspace_id, m.id, m.name, case when v_var >= 0 then 'Masuk' else 'Keluar' end,
      abs(v_var), m.unit, adj.adjustment_no, adj.project_id, a.actor_name, a.uid
    ) returning id into v_mut_id;

    update public.stock_adjustments
       set status = 'Disetujui', reviewed_by = a.uid, reviewed_at = now()
     where id = adj.id;
    v_new := 'Disetujui';

    perform private.write_audit(
      p_workspace_id, a.uid, a.actor_name, a.actor_role, 'STOCK_ADJUSTMENT_APPROVED', 'material', adj.id,
      adj.project_id, format('Menyetujui Opname Stok %s: Stok %s diperbarui dari %s menjadi %s %s', adj.adjustment_no, m.name, adj.previous_stock, adj.physical_stock, m.unit),
      format('Stok: %s', adj.previous_stock), format('Stok: %s', adj.physical_stock),
      jsonb_build_object('materialId', m.id, 'varianceQuantity', v_var, 'mutationId', v_mut_id)
    );

    perform private.notify(
      p_workspace_id, 'Penyesuaian Stok Disetujui',
      format('Stok fisik %s telah disesuaikan menjadi %s %s oleh %s.', m.name, adj.physical_stock, m.unit, a.actor_name),
      'success', array['warehouse', 'project_manager', 'site_manager']::public.app_role[], 'materials', adj.project_id
    );
  else
    if coalesce(trim(p_rejection_reason), '') = '' then raise exception 'Alasan penolakan penyesuaian stok wajib disertakan.'; end if;
    update public.stock_adjustments
       set status = 'Ditolak', reviewed_by = a.uid, reviewed_at = now(), rejection_reason = trim(p_rejection_reason)
     where id = adj.id;
    v_new := 'Ditolak';

    perform private.write_audit(
      p_workspace_id, a.uid, a.actor_name, a.actor_role, 'STOCK_ADJUSTMENT_REJECTED', 'material', adj.id,
      adj.project_id, format('Menolak Opname Stok %s. Alasan: %s', adj.adjustment_no, trim(p_rejection_reason)),
      adj.status, 'Ditolak', jsonb_build_object('rejectionReason', trim(p_rejection_reason))
    );

    perform private.notify(
      p_workspace_id, 'Penyesuaian Stok Ditolak',
      format('%s ditolak oleh %s. Alasan: %s', adj.adjustment_no, a.actor_name, trim(p_rejection_reason)),
      'warning', array['warehouse', 'site_manager']::public.app_role[], 'materials', adj.project_id
    );
  end if;

  res := jsonb_build_object(
    'success', true,
    'message', format('Penyesuaian stok %s berstatus %s.', adj.adjustment_no, v_new),
    'data', jsonb_build_object('adjId', adj.id, 'status', v_new)
  );
  perform private.idem_end(p_workspace_id, p_idempotency_key, res);
  return res;
end $$;

-- =============================================================================
-- LAPORAN HARIAN PROYEK (FIELD REPORT / LHP)
-- =============================================================================
create or replace function public.create_field_report(
  p_workspace_id uuid, p_project_id uuid, p_report_date date,
  p_weather_morning text default 'Cerah', p_weather_afternoon text default 'Cerah',
  p_working_hours numeric default 8, p_workforce jsonb default '[]',
  p_completed_works jsonb default '[]', p_materials_used jsonb default '[]',
  p_equipment_used jsonb default '[]', p_blockers text default null,
  p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a record; cached jsonb; proj record; v_no text; v_id uuid; res jsonb;
begin
  select * into a from private.require_actor(p_workspace_id);
  cached := private.idem_begin(p_workspace_id, p_idempotency_key);
  if cached is not null then return cached || jsonb_build_object('idempotentReplay', true); end if;

  if not private.has_perm(p_workspace_id, 'field_reports', 'create') then
    raise exception 'Peran "%" tidak berhak membuat laporan harian.', a.actor_role using errcode = '42501';
  end if;

  select id, code, name into proj from public.projects where id = p_project_id and workspace_id = p_workspace_id;
  if not found then raise exception 'Proyek tidak ditemukan.' using errcode = 'P0002'; end if;
  if not private.is_assigned(p_workspace_id, p_project_id) then
    raise exception 'Akses ditolak: Anda tidak ditugaskan pada proyek "%".', proj.name using errcode = '42501';
  end if;

  if p_report_date is null then raise exception 'Tanggal laporan wajib diisi.'; end if;
  if p_weather_morning not in ('Cerah','Berawan','Hujan Ringan','Hujan Deras') then
    raise exception 'Cuaca pagi tidak valid: %', p_weather_morning;
  end if;
  if p_weather_afternoon not in ('Cerah','Berawan','Hujan Ringan','Hujan Deras') then
    raise exception 'Cuaca sore tidak valid: %', p_weather_afternoon;
  end if;

  v_no := private.next_doc_number(p_workspace_id, 'LHP', proj.code);

  insert into public.field_reports (
    workspace_id, project_id, report_number, report_date,
    weather_morning, weather_afternoon, working_hours,
    site_supervisor_id, site_supervisor_name,
    workforce, completed_works, materials_used, equipment_used, blockers,
    status, created_by
  ) values (
    p_workspace_id, p_project_id, v_no, p_report_date,
    p_weather_morning, p_weather_afternoon, coalesce(p_working_hours, 8),
    a.uid, a.actor_name,
    coalesce(p_workforce, '[]'::jsonb), coalesce(p_completed_works, '[]'::jsonb),
    coalesce(p_materials_used, '[]'::jsonb), coalesce(p_equipment_used, '[]'::jsonb),
    p_blockers, 'Draft', a.uid
  ) returning id into v_id;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role, 'FIELD_REPORT_SUBMITTED', 'field_report', v_id,
    p_project_id, format('Membuat Draft Laporan Harian Proyek %s (%s)', v_no, proj.name), 'None', 'Draft'
  );

  res := jsonb_build_object(
    'success', true,
    'message', format('Laporan harian %s berhasil dibuat sebagai Draft.', v_no),
    'data', jsonb_build_object('id', v_id, 'reportNumber', v_no, 'status', 'Draft')
  );
  perform private.idem_end(p_workspace_id, p_idempotency_key, res);
  return res;
end $$;

create or replace function public.verify_field_report(
  p_workspace_id uuid, p_report_id uuid, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a record; cached jsonb; rep record; res jsonb;
begin
  select * into a from private.require_actor(p_workspace_id);
  cached := private.idem_begin(p_workspace_id, p_idempotency_key);
  if cached is not null then return cached || jsonb_build_object('idempotentReplay', true); end if;

  select * into rep from public.field_reports where id = p_report_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'Laporan harian tidak ditemukan.' using errcode = 'P0002'; end if;
  if not private.is_assigned(p_workspace_id, rep.project_id) then
    raise exception 'Akses ditolak: Anda tidak ditugaskan pada proyek ini.' using errcode = '42501';
  end if;

  if rep.status not in ('Draft', 'Perlu Revisi') then
    raise exception 'Transisi status tidak valid: dokumen berstatus "%". Hanya "Draft" atau "Perlu Revisi" yang dapat diverifikasi.', rep.status;
  end if;

  update public.field_reports
     set status = 'Diverifikasi', verified_by = a.uid, verified_at = now()
   where id = rep.id;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role, 'FIELD_REPORT_VERIFIED', 'field_report', rep.id,
    rep.project_id, format('Memverifikasi data teknis Laporan Harian %s', rep.report_number), rep.status, 'Diverifikasi'
  );

  perform private.notify(
    p_workspace_id, 'Laporan Harian Telah Diverifikasi',
    format('%s diverifikasi oleh %s. Menunggu persetujuan PM.', rep.report_number, a.actor_name),
    'info', array['project_manager', 'owner']::public.app_role[], 'field_reports', rep.project_id
  );

  res := jsonb_build_object(
    'success', true,
    'message', format('Laporan harian %s berhasil diverifikasi.', rep.report_number),
    'data', jsonb_build_object('reportId', rep.id, 'status', 'Diverifikasi')
  );
  perform private.idem_end(p_workspace_id, p_idempotency_key, res);
  return res;
end $$;

create or replace function public.approve_field_report(
  p_workspace_id uuid, p_report_id uuid, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a record; cached jsonb; rep record; res jsonb;
begin
  select * into a from private.require_actor(p_workspace_id);
  cached := private.idem_begin(p_workspace_id, p_idempotency_key);
  if cached is not null then return cached || jsonb_build_object('idempotentReplay', true); end if;

  if not private.has_perm(p_workspace_id, 'field_reports', 'approve') then
    raise exception 'Peran "%" tidak berwenang menyetujui laporan harian.', a.actor_role using errcode = '42501';
  end if;

  select * into rep from public.field_reports where id = p_report_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'Laporan harian tidak ditemukan.' using errcode = 'P0002'; end if;
  if not private.is_assigned(p_workspace_id, rep.project_id) then
    raise exception 'Akses ditolak: Anda tidak ditugaskan pada proyek ini.' using errcode = '42501';
  end if;

  if rep.status <> 'Diverifikasi' then
    raise exception 'Transisi status tidak valid: dokumen berstatus "%". Laporan harus berstatus "Diverifikasi" sebelum disetujui.', rep.status;
  end if;

  if rep.site_supervisor_id = a.uid or rep.created_by = a.uid then
    raise exception 'Segregation of Duties (SoD) dilanggar: pengawas yang menyusun laporan tidak boleh menyetujui laporannya sendiri.' using errcode = '42501';
  end if;

  update public.field_reports
     set status = 'Disetujui', approved_by = a.uid, approved_at = now()
   where id = rep.id;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role, 'FIELD_REPORT_APPROVED', 'field_report', rep.id,
    rep.project_id, format('Menyetujui secara definitif Laporan Harian %s', rep.report_number), rep.status, 'Disetujui'
  );

  perform private.notify(
    p_workspace_id, 'Laporan Harian Disetujui',
    format('%s telah disetujui resmi oleh %s.', rep.report_number, a.actor_name),
    'success', array['site_manager', 'project_manager', 'auditor']::public.app_role[], 'field_reports', rep.project_id
  );

  res := jsonb_build_object(
    'success', true,
    'message', format('Laporan harian %s resmi disetujui.', rep.report_number),
    'data', jsonb_build_object('reportId', rep.id, 'status', 'Disetujui')
  );
  perform private.idem_end(p_workspace_id, p_idempotency_key, res);
  return res;
end $$;

create or replace function public.revise_field_report(
  p_workspace_id uuid, p_report_id uuid, p_reviewer_notes text, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a record; cached jsonb; rep record; res jsonb;
begin
  select * into a from private.require_actor(p_workspace_id);
  cached := private.idem_begin(p_workspace_id, p_idempotency_key);
  if cached is not null then return cached || jsonb_build_object('idempotentReplay', true); end if;

  if not private.has_perm(p_workspace_id, 'field_reports', 'approve') and not private.has_perm(p_workspace_id, 'field_reports', 'reject') then
    raise exception 'Peran "%" tidak berwenang mengembalikan laporan untuk revisi.', a.actor_role using errcode = '42501';
  end if;

  if coalesce(trim(p_reviewer_notes), '') = '' then
    raise exception 'Catatan instruksi perbaikan (alasan revisi) wajib disertakan.';
  end if;

  select * into rep from public.field_reports where id = p_report_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'Laporan harian tidak ditemukan.' using errcode = 'P0002'; end if;
  if not private.is_assigned(p_workspace_id, rep.project_id) then
    raise exception 'Akses ditolak: Anda tidak ditugaskan pada proyek ini.' using errcode = '42501';
  end if;

  update public.field_reports
     set status = 'Perlu Revisi', reviewer_notes = trim(p_reviewer_notes)
   where id = rep.id;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role, 'FIELD_REPORT_SUBMITTED', 'field_report', rep.id,
    rep.project_id, format('Mengembalikan Laporan %s untuk perbaikan. Catatan: %s', rep.report_number, trim(p_reviewer_notes)),
    rep.status, 'Perlu Revisi', jsonb_build_object('reviewerNotes', trim(p_reviewer_notes))
  );

  perform private.notify(
    p_workspace_id, 'Laporan Harian Memerlukan Revisi',
    format('%s dikembalikan oleh %s: "%s".', rep.report_number, a.actor_name, trim(p_reviewer_notes)),
    'warning', array['site_manager']::public.app_role[], 'field_reports', rep.project_id
  );

  res := jsonb_build_object(
    'success', true,
    'message', format('Laporan harian %s dikembalikan dengan status Perlu Revisi.', rep.report_number),
    'data', jsonb_build_object('reportId', rep.id, 'status', 'Perlu Revisi', 'reviewerNotes', trim(p_reviewer_notes))
  );
  perform private.idem_end(p_workspace_id, p_idempotency_key, res);
  return res;
end $$;

-- =============================================================================
-- PENGESAHAN MILESTONE (MILESTONE SIGN-OFF DENGAN BAST)
-- =============================================================================
create or replace function public.sign_off_milestone(
  p_workspace_id uuid, p_milestone_id uuid, p_bast_ref text,
  p_notes text default null, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a record; cached jsonb; ms record; proj record; v_completed int; res jsonb;
begin
  select * into a from private.require_actor(p_workspace_id);
  cached := private.idem_begin(p_workspace_id, p_idempotency_key);
  if cached is not null then return cached || jsonb_build_object('idempotentReplay', true); end if;

  if a.actor_role not in ('owner', 'project_manager') then
    raise exception 'Peran "%" tidak berwenang mengesahkan BAST milestone. Diperlukan peran Project Manager atau Owner / Director.', a.actor_role using errcode = '42501';
  end if;

  if coalesce(trim(p_bast_ref), '') = '' then
    raise exception 'Nomor Berita Acara Serah Terima (BAST Ref) wajib disertakan untuk sign-off milestone.';
  end if;

  select * into ms from public.milestones where id = p_milestone_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'Milestone tidak ditemukan.' using errcode = 'P0002'; end if;
  if not private.is_assigned(p_workspace_id, ms.project_id) then
    raise exception 'Akses ditolak: Anda tidak ditugaskan pada proyek ini.' using errcode = '42501';
  end if;

  if ms.status = 'Selesai' then
    raise exception 'Milestone "%" sudah disahkan sebelumnya (Status: Selesai).', ms.title;
  end if;

  select * into proj from public.projects where id = ms.project_id and workspace_id = p_workspace_id for update;
  v_completed := coalesce(proj.completed_milestones, 0) + 1;

  update public.projects
     set completed_milestones = v_completed
   where id = ms.project_id;

  update public.milestones
     set status = 'Selesai', progress = 100, signed_off_by = a.uid, signed_off_at = now(), bast_ref = trim(p_bast_ref)
   where id = ms.id;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role, 'MILESTONE_SIGNED_OFF', 'milestone', ms.id,
    ms.project_id, format('Pengesahan milestone: "%s" disahkan oleh %s (Ref: %s)', ms.title, a.actor_name, trim(p_bast_ref)),
    ms.status, 'Selesai', jsonb_build_object('bastRef', trim(p_bast_ref), 'notes', coalesce(p_notes, ''))
  );

  perform private.notify(
    p_workspace_id, 'Milestone Resmi Disahkan',
    format('Milestone "%s" telah disahkan oleh %s (BAST: %s).', ms.title, a.actor_name, trim(p_bast_ref)),
    'success', array['owner', 'project_manager', 'site_manager']::public.app_role[], 'schedule', ms.project_id
  );

  res := jsonb_build_object(
    'success', true,
    'message', format('Milestone "%s" berhasil disahkan.', ms.title),
    'data', jsonb_build_object('milestoneId', ms.id, 'status', 'Selesai', 'completedMilestones', v_completed)
  );
  perform private.idem_end(p_workspace_id, p_idempotency_key, res);
  return res;
end $$;

-- =============================================================================
-- HAK EKSEKUSI: hanya 'authenticated' untuk RPC publik; private.* tertutup kecuali helper RLS
-- =============================================================================
revoke execute on all functions in schema private from public, anon;
grant execute on function
  private.is_member(uuid), private.has_role(uuid, public.app_role[]), private.has_perm(uuid, text, text),
  private.is_assigned(uuid, uuid), private.shares_workspace(uuid), private.try_uuid(text)
  to authenticated;

revoke execute on function
  public.create_purchase_order(uuid, uuid, text, text, text, bigint, date, boolean, text),
  public.decide_purchase_order(uuid, uuid, text, text, text),
  public.advance_purchase_order(uuid, uuid, text, text),
  public.record_stock_mutation(uuid, uuid, text, int, text, uuid, text, text),
  public.create_petty_cash(uuid, uuid, bigint, text, text, text, text),
  public.decide_petty_cash(uuid, uuid, text, text, text),
  public.disburse_petty_cash(uuid, uuid, text),
  public.create_budget_revision(uuid, uuid, text, text, bigint, bigint, text, text),
  public.decide_budget_revision(uuid, uuid, text, text, text),
  public.create_stock_adjustment(uuid, uuid, int, text, uuid, text, text),
  public.decide_stock_adjustment(uuid, uuid, text, text, text),
  public.create_field_report(uuid, uuid, date, text, text, numeric, jsonb, jsonb, jsonb, jsonb, text, text),
  public.verify_field_report(uuid, uuid, text),
  public.approve_field_report(uuid, uuid, text),
  public.revise_field_report(uuid, uuid, text, text),
  public.sign_off_milestone(uuid, uuid, text, text, text),
  public.accept_invitation()
  from public, anon;

grant execute on function
  public.create_purchase_order(uuid, uuid, text, text, text, bigint, date, boolean, text),
  public.decide_purchase_order(uuid, uuid, text, text, text),
  public.advance_purchase_order(uuid, uuid, text, text),
  public.record_stock_mutation(uuid, uuid, text, int, text, uuid, text, text),
  public.create_petty_cash(uuid, uuid, bigint, text, text, text, text),
  public.decide_petty_cash(uuid, uuid, text, text, text),
  public.disburse_petty_cash(uuid, uuid, text),
  public.create_budget_revision(uuid, uuid, text, text, bigint, bigint, text, text),
  public.decide_budget_revision(uuid, uuid, text, text, text),
  public.create_stock_adjustment(uuid, uuid, int, text, uuid, text, text),
  public.decide_stock_adjustment(uuid, uuid, text, text, text),
  public.create_field_report(uuid, uuid, date, text, text, numeric, jsonb, jsonb, jsonb, jsonb, text, text),
  public.verify_field_report(uuid, uuid, text),
  public.approve_field_report(uuid, uuid, text),
  public.revise_field_report(uuid, uuid, text, text),
  public.sign_off_milestone(uuid, uuid, text, text, text),
  public.accept_invitation()
  to authenticated;



-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START: 20261012000004_maintenance.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- Indotek Pro — Migrasi Supabase 4/4: PEMELIHARAAN (opsional, aman dijalankan ulang)
-- Membersihkan idempotency_keys kedaluwarsa tiap jam via pg_cron (aktifkan extension pg_cron di Dashboard > Database > Extensions).
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('indotek-clean-idempotency')
      where exists (select 1 from cron.job where jobname = 'indotek-clean-idempotency');
    perform cron.schedule('indotek-clean-idempotency', '17 * * * *',
      $job$delete from public.idempotency_keys where expires_at < now()$job$);
  else
    raise notice 'pg_cron belum aktif: jadwal pembersihan idempotency_keys dilewati.';
  end if;
end $$;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START: 20261013000005_write_hardening.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- START: 20261013000006_client_write_rpc.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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

