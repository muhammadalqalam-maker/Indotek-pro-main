-- ============================================================================
-- INDOTEK PRO — MIGRATION 0007: DECIMAL STOCK QUANTITIES + RLS INDEXES
-- ============================================================================
-- Mengubah kolom kuantitas stok dari int ke numeric(18,3) agar mendukung
-- satuan desimal (m3 beton, kg, m, dst.).
-- Juga menambahkan indeks composite untuk mempercepat evaluasi policy RLS.
-- ============================================================================

-- 1. Ubah tipe kolom kuantitas di materials

alter table public.materials
  drop constraint if exists materials_current_stock_check;

alter table public.materials
  alter column current_stock type numeric(18,3) using current_stock::numeric(18,3),
  alter column current_stock set default 0,
  add constraint materials_current_stock_check check (current_stock >= 0);

alter table public.materials
  drop constraint if exists materials_min_stock_check;

alter table public.materials
  alter column min_stock type numeric(18,3) using min_stock::numeric(18,3),
  alter column min_stock set default 0,
  add constraint materials_min_stock_check check (min_stock >= 0);

-- 2. Ubah tipe kolom quantity di stock_mutations

alter table public.stock_mutations
  drop constraint if exists stock_mutations_quantity_check;

alter table public.stock_mutations
  alter column quantity type numeric(18,3) using quantity::numeric(18,3),
  add constraint stock_mutations_quantity_check check (quantity > 0);

-- 3. Ubah kolom di stock_adjustments
--    variance_quantity adalah GENERATED ALWAYS -- harus di-drop dan re-create

alter table public.stock_adjustments
  drop column variance_quantity;

alter table public.stock_adjustments
  drop constraint if exists stock_adjustments_previous_stock_check,
  drop constraint if exists stock_adjustments_physical_stock_check;

alter table public.stock_adjustments
  alter column previous_stock type numeric(18,3) using previous_stock::numeric(18,3),
  alter column physical_stock type numeric(18,3) using physical_stock::numeric(18,3);

alter table public.stock_adjustments
  add constraint stock_adjustments_physical_stock_check check (physical_stock >= 0);

alter table public.stock_adjustments
  add column variance_quantity numeric(18,3) generated always as (physical_stock - previous_stock) stored;

-- 4. Perbarui private.material_status -- parameter numeric

create or replace function private.material_status(
  p_current numeric,
  p_min     numeric
) returns text language sql immutable set search_path = '' as $$
  select case
    when p_current = 0           then 'Kritis'
    when p_current <= p_min      then 'Menipis'
    else                              'Aman'
  end;
$$;

-- 5. Perbarui RPC record_stock_mutation -- parameter p_quantity jadi numeric

create or replace function public.record_stock_mutation(
  p_workspace_id uuid,
  p_material_id  uuid,
  p_type         text,
  p_quantity     numeric,
  p_unit         text,
  p_reference_no text    default '',
  p_project_id   uuid    default null,
  p_handler      text    default ''
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a        record;
  mat      record;
  new_qty  numeric(18,3);
  new_id   uuid;
begin
  select * into a from private.require_actor(p_workspace_id);

  if a.actor_role not in ('owner', 'project_manager', 'site_manager', 'warehouse', 'procurement') then
    raise exception 'Peran "%" tidak berwenang mencatat mutasi stok.', a.actor_role using errcode = '42501';
  end if;

  if p_quantity <= 0 then
    raise exception 'Kuantitas mutasi harus lebih dari nol.' using errcode = '22003';
  end if;

  select * into mat
    from public.materials
   where id = p_material_id and workspace_id = p_workspace_id
     for update;

  if not found then
    raise exception 'Material tidak ditemukan.' using errcode = 'P0002';
  end if;

  if p_type = 'Keluar' and mat.current_stock < p_quantity then
    raise exception 'Stok tidak mencukupi: stok saat ini % %, dibutuhkan % %.',
      mat.current_stock, mat.unit, p_quantity, mat.unit using errcode = '22003';
  end if;

  new_qty := case p_type
    when 'Masuk'  then mat.current_stock + p_quantity
    when 'Keluar' then mat.current_stock - p_quantity
    else null
  end;

  if new_qty is null then
    raise exception 'Tipe mutasi tidak valid: %', p_type using errcode = '22023';
  end if;

  insert into public.stock_mutations (
    workspace_id, material_id, material_name, type, quantity, unit,
    reference_no, project_id, handler, created_by
  ) values (
    p_workspace_id, p_material_id, mat.name, p_type, p_quantity, p_unit,
    p_reference_no, p_project_id, p_handler, a.uid
  ) returning id into new_id;

  update public.materials
     set current_stock  = new_qty,
         last_restocked = case when p_type = 'Masuk' then now() else last_restocked end,
         status         = private.material_status(new_qty, mat.min_stock)
   where id = p_material_id;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    'STOCK_MUTATION', 'stock_mutation', new_id, p_project_id,
    format('Mutasi stok %s: %s %s %s oleh %s.',
      p_type, p_quantity, mat.unit, mat.name, a.actor_name),
    mat.current_stock::text, new_qty::text, '{}'
  );

  return jsonb_build_object(
    'success', true,
    'mutationId', new_id,
    'newStock', new_qty,
    'message', format('Mutasi %s %s %s untuk "%s" berhasil dicatat.', p_type, p_quantity, mat.unit, mat.name)
  );
end;
$$;

grant execute on function public.record_stock_mutation(uuid, uuid, text, numeric, text, text, uuid, text) to authenticated;


-- 6. Perbarui RPC create_stock_adjustment -- parameter numeric

create or replace function public.create_stock_adjustment(
  p_workspace_id   uuid,
  p_material_id    uuid,
  p_project_id     uuid    default null,
  p_physical_stock numeric default 0,
  p_reason         text    default 'Koreksi Opname Fisik',
  p_evidence_ref   text    default ''
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a      record;
  mat    record;
  adj_no text;
  new_id uuid;
begin
  select * into a from private.require_actor(p_workspace_id);

  if a.actor_role not in ('owner', 'warehouse', 'site_manager') then
    raise exception 'Peran "%" tidak berwenang mengajukan opname stok.', a.actor_role using errcode = '42501';
  end if;

  if p_physical_stock < 0 then
    raise exception 'Stok fisik tidak boleh negatif.' using errcode = '22003';
  end if;

  select * into mat
    from public.materials
   where id = p_material_id and workspace_id = p_workspace_id
     for update;

  if not found then
    raise exception 'Material tidak ditemukan.' using errcode = 'P0002';
  end if;

  adj_no := private.next_doc_number(p_workspace_id, 'OPNAME', 'ADJ');

  insert into public.stock_adjustments (
    workspace_id, material_id, project_id, adjustment_no,
    previous_stock, physical_stock, reason, evidence_ref,
    submitted_by, submitted_at
  ) values (
    p_workspace_id, p_material_id, p_project_id, adj_no,
    mat.current_stock, p_physical_stock, p_reason, p_evidence_ref,
    a.uid, now()
  ) returning id into new_id;

  perform private.write_audit(
    p_workspace_id, a.uid, a.actor_name, a.actor_role,
    'CREATE_STOCK_ADJUSTMENT', 'stock_adjustment', new_id, p_project_id,
    format('Opname stok %s diajukan: stok buku %s, stok fisik %s.',
      adj_no, mat.current_stock, p_physical_stock),
    '', '', '{}'
  );

  return jsonb_build_object(
    'success', true,
    'adjustmentId', new_id,
    'adjustmentNo', adj_no,
    'variance', p_physical_stock - mat.current_stock,
    'message', format('Opname stok %s berhasil diajukan untuk persetujuan.', adj_no)
  );
end;
$$;

grant execute on function public.create_stock_adjustment(uuid, uuid, uuid, numeric, text, text) to authenticated;


-- 7. Indeks composite untuk mempercepat evaluasi policy RLS

create index if not exists idx_workspace_members_ws_user_status
  on public.workspace_members (workspace_id, user_id, status);

create index if not exists idx_field_reports_ws_status
  on public.field_reports (workspace_id, status);

create index if not exists idx_petty_cash_ws_status
  on public.petty_cash (workspace_id, status);

create index if not exists idx_budget_lines_project
  on public.budget_lines (project_id);

create index if not exists idx_stock_adjustments_ws_status
  on public.stock_adjustments (workspace_id, status);

create index if not exists idx_audit_logs_ws_created
  on public.audit_logs (workspace_id, created_at desc);


-- 8. Assertions

do $$
declare
  col_type text;
begin
  select data_type into col_type
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'materials'
     and column_name  = 'current_stock';

  assert col_type = 'numeric',
    format('current_stock masih bertipe %s, bukan numeric!', col_type);

  select data_type into col_type
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'stock_mutations'
     and column_name  = 'quantity';

  assert col_type = 'numeric',
    format('stock_mutations.quantity masih bertipe %s, bukan numeric!', col_type);

  assert exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'stock_adjustments'
       and column_name  = 'variance_quantity'
  ), 'variance_quantity hilang dari stock_adjustments!';

  assert exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and tablename  = 'workspace_members'
       and indexname  = 'idx_workspace_members_ws_user_status'
  ), 'Indeks idx_workspace_members_ws_user_status tidak ada!';

  raise notice 'Migration 0007 assertions lulus: numeric(18,3) OK, indeks RLS OK.';
end;
$$;
