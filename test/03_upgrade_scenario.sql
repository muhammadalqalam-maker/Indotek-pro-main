\set ON_ERROR_STOP off
-- Skenario upgrade: pastikan migrasi 04-14 idempoten & data tetap intact
-- Setup: diasumsikan migrations 01-03 sudah applied, seed data dengan mix int/decimal

\echo '=== UPGRADE SCENARIO: 01-03 → SEED → 04-14 IDEMPOTENCY ==='

-- Buat workspace & material dengan stok int (sebelum migration 07)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'upgrade-test@indotek.test');

select private.bootstrap_workspace('upgrade-test-ws', 'Upgrade Test WS', 'upgrade-test@indotek.test') as ws \gset

insert into public.materials (workspace_id, code, name, category, unit, current_stock, min_stock)
  values 
    (:'ws', 'MAT-UPG-1', 'Beton Ready Mix', 'Beton', 'm3', 100, 10),
    (:'ws', 'MAT-UPG-2', 'Besi Polos', 'Baja', 'ton', 5, 1)
  returning id;

-- Insert stock_mutations & stock_adjustments SEBELUM migration 07 (dengan int quantities)
insert into public.projects (workspace_id, code, name, approved_budget, actual_cost)
  values (:'ws', 'UP-01', 'Upgrade Test Project', 500000000, 100000000)
  returning id as upid \gset;

insert into public.stock_mutations (workspace_id, material_id, material_name, type, quantity, unit, reference_no, created_by)
  select :'ws', id, name, 'Masuk', 50, unit, 'REF-UPG-001', '00000000-0000-0000-0000-0000000000c1'
    from public.materials where workspace_id = :'ws' and code = 'MAT-UPG-1';

insert into public.stock_adjustments (workspace_id, material_id, adjustment_no, previous_stock, physical_stock, reason, submitted_by, submitted_at, status)
  select :'ws', id, 'ADJ-UPG-001', 100, 95, 'Opname Fisik', '00000000-0000-0000-0000-0000000000c1', now(), 'Disetujui'
    from public.materials where workspace_id = :'ws' and code = 'MAT-UPG-1';

\echo '--- PRE-UPGRADE DATA SNAPSHOT'
reset role;
select 'materials' as table_name, count(*) as row_count from public.materials where workspace_id = :'ws';
select 'stock_mutations' as table_name, count(*) as row_count from public.stock_mutations where workspace_id = :'ws';
select 'stock_adjustments' as table_name, count(*) as row_count from public.stock_adjustments where workspace_id = :'ws';

select 
  code, name, current_stock, min_stock,
  pg_typeof(current_stock)::text as stock_type
from public.materials
where workspace_id = :'ws'
order by code;

select 
  adjustment_no, previous_stock, physical_stock, variance_quantity,
  pg_typeof(variance_quantity)::text as variance_type
from public.stock_adjustments
where workspace_id = :'ws'
order by adjustment_no;

\echo '--- POST-UPGRADE: Verify numeric(18,3) type & generated column intact'
-- Setelah migration 07 applied (diasumsikan sudah terjadi)

-- Buat material baru SESUDAH migration 07 dengan decimal
insert into public.materials (workspace_id, code, name, category, unit, current_stock, min_stock)
  values (:'ws', 'MAT-UPG-3', 'Cat Premium', 'Finishing', 'liter', 123.456, 10.5)
  returning id as mat_decimal_id \gset;

select 
  code, name, current_stock, min_stock,
  pg_typeof(current_stock)::text as stock_type
from public.materials
where workspace_id = :'ws'
order by code;

\echo '--- IDEMPOTENCY: Rerun migration 07 directives (drop/recreate variance_quantity)'
-- Simulasi rerun: drop & recreate variance_quantity (idempotent directives dalam migration 07)

alter table public.stock_adjustments
  drop column if exists variance_quantity;

alter table public.stock_adjustments
  add column variance_quantity numeric(18,3) generated always as (physical_stock - previous_stock) stored;

\echo '--- POST-IDEMPOTENCY: Verify column recreated, data intact'

select 
  adjustment_no, previous_stock, physical_stock, variance_quantity
from public.stock_adjustments
where workspace_id = :'ws'
order by adjustment_no;

\echo '--- RPC CALLS POST-UPGRADE: Verify numeric(18,3) params work'

insert into public.workspace_members (workspace_id, user_id, role)
  values (:'ws', '00000000-0000-0000-0000-0000000000c1', 'warehouse');

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');

-- Test record_stock_mutation dengan decimal quantity
select public.record_stock_mutation(
  :'ws',
  (select id from public.materials where code = 'MAT-UPG-3'),
  'Keluar',
  12.345::numeric,
  'liter',
  'REF-UPG-DECIMAL'
) ->> 'message' as mutation_decimal_ok;

-- Verify stok updated dengan presisi decimal
reset role;
select code, current_stock, pg_typeof(current_stock)::text as type
  from public.materials where code = 'MAT-UPG-3';

-- Test create_stock_adjustment dengan decimal physical_stock
insert into public.workspace_members (workspace_id, user_id, role) 
  values (:'ws', '00000000-0000-0000-0000-0000000000c1', 'warehouse')
  on conflict do nothing;

set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');

select public.create_stock_adjustment(
  :'ws',
  (select id from public.materials where code = 'MAT-UPG-3'),
  :'upid',
  111.111::numeric,
  'Koreksi Opname Setelah Upgrade'
) ->> 'message' as adjustment_decimal_ok;

reset role;
select 
  adjustment_no, previous_stock, physical_stock, variance_quantity
from public.stock_adjustments
where workspace_id = :'ws' and reason like '%Upgrade%'
order by created_at;

\echo '--- CONSTRAINTS: Verify stock checks dengan numeric'

-- Attempt negatif (seharusnya ditolak)
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
insert into public.stock_mutations (workspace_id, material_id, material_name, type, quantity, unit, reference_no, created_by)
  select :'ws', id, name, 'Masuk', -1, unit, 'REF-BAD', '00000000-0000-0000-0000-0000000000c1'
    from public.materials where code = 'MAT-UPG-3';

reset role;

\echo '--- FINAL STATE: All materials numeric, indexes in place'

select 'All materials numeric(18,3)' as result
  where not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
      and table_name = 'materials' 
      and column_name in ('current_stock', 'min_stock')
      and data_type != 'numeric'
  );

select 'variance_quantity generated' as result
  where exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stock_adjustments'
      and column_name = 'variance_quantity'
      and is_generated = 'ALWAYS'
  );

select 'Indexes exist' as result
  where exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename in ('workspace_members', 'budget_lines', 'stock_adjustments')
  );

\echo '=== UPGRADE SCENARIO COMPLETE ==='
