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
