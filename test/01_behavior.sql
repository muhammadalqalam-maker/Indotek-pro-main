\set ON_ERROR_STOP off
-- helper: jalankan sebagai user tertentu (meniru JWT Supabase)
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u::text, false); end $$;

-- Data awal (sebagai postgres / service role)
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000a1','owner@indotek.test'),
 ('00000000-0000-0000-0000-0000000000a2','proc@indotek.test'),
 ('00000000-0000-0000-0000-0000000000a3','fin@indotek.test'),
 ('00000000-0000-0000-0000-0000000000a4','wh@indotek.test'),
 ('00000000-0000-0000-0000-0000000000b1','outsider@other.test');
select private.bootstrap_workspace('indotek-jkt','Indotek Karya Nusantara','owner@indotek.test') as ws \gset
select private.bootstrap_workspace('other-co','Other Co','outsider@other.test') as ws2 \gset
insert into public.workspace_members (workspace_id,user_id,role) values
 (:'ws','00000000-0000-0000-0000-0000000000a2','procurement'),
 (:'ws','00000000-0000-0000-0000-0000000000a3','finance'),
 (:'ws','00000000-0000-0000-0000-0000000000a4','warehouse');
insert into public.projects (workspace_id, code, name, approved_budget, actual_cost)
 values (:'ws','GP-01','Gunung Pancur',1000000000, 900000000) returning id as pid \gset
insert into public.project_members (workspace_id, project_id, user_id) values (:'ws', :'pid', '00000000-0000-0000-0000-0000000000a2'), (:'ws', :'pid', '00000000-0000-0000-0000-0000000000a4');
insert into public.materials (workspace_id, code, name, category, unit, current_stock, min_stock)
 values (:'ws','MAT-1','Semen 50kg','Semen & Pasir','sak', 10, 8) returning id as mid \gset

\echo '--- T1 PO: procurement membuat PO (harus sukses, nomor PO-<tahun WITA>-GP01-0001)'
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select public.create_purchase_order(:'ws', :'pid', 'PT Semen', 'Semen', '100 sak', 50000000, null, true, 'idem-1') ->> 'message' as t1;
\echo '--- T2 idempotensi: kunci sama -> replay, tidak membuat PO kedua'
select (public.create_purchase_order(:'ws', :'pid', 'PT Semen', 'Semen', '100 sak', 50000000, null, true, 'idem-1') ->> 'idempotentReplay') as replay;
reset role; select count(*) as jumlah_po_seharusnya_1 from public.purchase_orders;

\echo '--- T3 SoD: pembuat PO (procurement) mencoba approve -> ditolak (tidak punya hak approve)'
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select public.decide_purchase_order(:'ws', (select id from public.purchase_orders limit 1), 'approve');
\echo '--- T4 SoD untuk Owner: Owner membuat PO lalu mencoba approve PO miliknya sendiri -> ditolak'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select public.create_purchase_order(:'ws', :'pid', 'CV Besi', 'Besi', '1 ton', 10000000, null, true, 'idem-own') ->> 'message';
select public.decide_purchase_order(:'ws', (select id from public.purchase_orders where supplier_name='CV Besi'), 'approve');

\echo '--- T5 Pagu: Finance approve PO 50jt (900+50 <= 1000jt) -> sukses; lalu PO 80jt (900+50 komitmen+80 > 1000jt) -> ditolak'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select public.decide_purchase_order(:'ws', (select id from public.purchase_orders where supplier_name='PT Semen'), 'approve') ->> 'message' as approve_ok;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select public.create_purchase_order(:'ws', :'pid', 'PT Mahal', 'Besar', 'x', 80000000, null, true, 'idem-big') ->> 'message';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select public.decide_purchase_order(:'ws', (select id from public.purchase_orders where supplier_name='PT Mahal'), 'approve');
\echo '--- T5b state machine: approve ulang PO yang sudah Disetujui -> ditolak'
select public.decide_purchase_order(:'ws', (select id from public.purchase_orders where supplier_name='PT Semen'), 'approve');

\echo '--- T6 Jalur tulis langsung ditutup: Owner UPDATE status PO via tabel, INSERT PO langsung, DELETE audit -> semua ditolak'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
update public.purchase_orders set status='Disetujui' where supplier_name='PT Mahal';
insert into public.purchase_orders (workspace_id,project_id,po_number,supplier_name,total_cost) values (:'ws',:'pid','X-1','Hack',1);
delete from public.audit_logs;
update public.projects set actual_cost = 0 where id = :'pid';
update public.materials set current_stock = 99999 where id = :'mid';

\echo '--- T7 Stok: keluar melebihi stok -> ditolak; keluar valid -> sukses; stok akhir 4 & status Kritis/Menipis'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
select public.record_stock_mutation(:'ws', :'mid', 'Keluar', 11, 'SJ-1', :'pid');
select public.record_stock_mutation(:'ws', :'mid', 'Keluar', 6, 'SJ-2', :'pid') ->> 'message';
reset role; select current_stock, status from public.materials where id = :'mid';

\echo '--- T8 Isolasi tenant: user workspace lain tidak melihat data indotek-jkt & tidak bisa memanggil RPC-nya'
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select count(*) as po_terlihat_outsider from public.purchase_orders;
select count(*) as proyek_terlihat_outsider from public.projects;
select count(*) as audit_terlihat_outsider from public.audit_logs;
select public.create_purchase_order(:'ws', :'pid', 'Intruder', 'x', 'x', 1000, null, true, null);

\echo '--- T9 Penugasan proyek: finance melihat semua proyek; warehouse (ditugaskan) melihat; pengguna tanpa penugasan tidak'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4'); select count(*) as warehouse_lihat_proyek from public.projects;
reset role; insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000a5','sm@indotek.test');
insert into public.workspace_members (workspace_id,user_id,role) values (:'ws','00000000-0000-0000-0000-0000000000a5','site_manager');
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a5'); select count(*) as site_manager_tanpa_penugasan from public.projects;

\echo '--- T10 Owner terakhir tidak boleh diturunkan'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
update public.workspace_members set role='auditor' where user_id='00000000-0000-0000-0000-0000000000a1';

\echo '--- T11 Kas kecil: ajukan (warehouse) -> approve (finance) -> cairkan (finance); SoD pemohon'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
select public.create_petty_cash(:'ws', :'pid', 250000, 'BBM & Logistik Ringan', 'Solar genset', null, 'kas-1') ->> 'message';
select public.decide_petty_cash(:'ws', (select id from public.petty_cash limit 1), 'approve');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select public.decide_petty_cash(:'ws', (select id from public.petty_cash limit 1), 'approve') ->> 'message';
select public.disburse_petty_cash(:'ws', (select id from public.petty_cash limit 1)) ->> 'message';

\echo '--- T12 Nomor dokumen berurutan & counter per tahun'
reset role; select doc_type, year, last_number from public.doc_counters order by doc_type;
select po_number from public.purchase_orders order by created_at;

\echo '--- T13 Audit log tercatat & WORM (UPDATE oleh superuser pun ditolak)'
select action, actor_name, actor_role from public.audit_logs order by created_at;
update public.audit_logs set details = 'x';

\echo '--- T14 Notifikasi: role procurement hanya melihat notifikasi untuk perannya'
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select title from public.notifications order by created_at;

\echo '--- T15 Anon tidak bisa apa-apa'
reset role; set role anon; select count(*) from public.projects;

\echo '--- T16 Revisi Anggaran: pengajuan -> SoD pemohon ditolak -> finance menyetujui -> pagu naik'
reset role;
insert into public.budget_lines (workspace_id, project_id, code, division_name, category, planned_amount)
 values (:'ws', :'pid', 'BL-01', 'Pekerjaan Struktur', 'Pekerjaan Struktur', 400000000);
insert into public.workspace_members (workspace_id, user_id, role)
 values (:'ws', '00000000-0000-0000-0000-0000000000a6', 'quantity_surveyor') on conflict do nothing;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a6', 'qs@indotek.test') on conflict do nothing;
insert into public.project_members (workspace_id, project_id, user_id)
 values (:'ws', :'pid', '00000000-0000-0000-0000-0000000000a6') on conflict do nothing;

set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a6');
select public.create_budget_revision(:'ws', :'pid', 'Addendum Besi', 'Pekerjaan Struktur', 400000000, 450000000, 'Kenaikan volume', 'rev-1') ->> 'message' as t16_create;
\echo '--- T16b SoD: QS mencoba approve addendum sendiri -> ditolak'
select public.decide_budget_revision(:'ws', (select id from public.budget_revisions limit 1), 'approve');
\echo '--- T16c Finance menyetujui -> sukses, pagu proyek naik'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select public.decide_budget_revision(:'ws', (select id from public.budget_revisions limit 1), 'approve') ->> 'message' as t16_approve;
reset role; select approved_budget from public.projects where id = :'pid';
select planned_amount from public.budget_lines where project_id = :'pid' and division_name = 'Pekerjaan Struktur';

\echo '--- T17 Opname Stok: Warehouse mengajukan -> SoD ditolak -> PM menyetujui -> stok & mutasi sinkron'
reset role;
insert into public.project_members (workspace_id, project_id, user_id)
 values (:'ws', :'pid', '00000000-0000-0000-0000-0000000000a5') on conflict do nothing;
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
select public.create_stock_adjustment(:'ws', :'mid', 15, 'Koreksi Opname Fisik', :'pid', 'BA-01', 'adj-1') ->> 'message' as t17_create;
\echo '--- T17b SoD opname: warehouse mencoba menyetujui opname sendiri -> ditolak'
select public.decide_stock_adjustment(:'ws', (select id from public.stock_adjustments limit 1), 'approve');
\echo '--- T17c Owner menyetujui opname -> sukses, stok material kini 15'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select public.decide_stock_adjustment(:'ws', (select id from public.stock_adjustments limit 1), 'approve') ->> 'message' as t17_approve;
reset role; select current_stock from public.materials where id = :'mid';

\echo '--- T18 Laporan Harian: Site manager membuat -> verifikasi -> SoD pembuat approve ditolak -> Owner menyetujui'
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a5');
select public.create_field_report(:'ws', :'pid', current_date, 'Cerah', 'Cerah', 8, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, null, 'lhp-1') ->> 'message' as t18_create;
select public.verify_field_report(:'ws', (select id from public.field_reports limit 1)) ->> 'message' as t18_verify;
\echo '--- T18b SoD laporan: pembuat mencoba approve -> ditolak'
select public.approve_field_report(:'ws', (select id from public.field_reports limit 1));
\echo '--- T18c Owner menyetujui laporan -> sukses'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select public.approve_field_report(:'ws', (select id from public.field_reports limit 1)) ->> 'message' as t18_approve;

\echo '--- T19 Milestone sign-off: BAST ref divalidasi, progress 100%, completed_milestones naik'
reset role;
insert into public.milestones (workspace_id, project_id, title, status, progress)
 values (:'ws', :'pid', 'Pondasi Tiang Pancang', 'Berjalan', 50) returning id as msid \gset
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select public.sign_off_milestone(:'ws', :'msid', 'BAST/2026/001', 'Pekerjaan pondasi selesai sempurna') ->> 'message' as t19_signoff;
reset role; select title, status, progress, bast_ref from public.milestones where id = :'msid';
select completed_milestones from public.projects where id = :'pid';

\echo '--- T20 Payment Terms: Finance Manager buat Uang Muka (40%), Termin 1 (35%), Retensi (25%) semua Draft'
reset role;
insert into public.payment_terms (workspace_id, project_id, jenis, urutan, label, persen, nominal, status)
 values 
  (:'ws', :'pid', 'Uang Muka', 1, 'Uang Muka 40%', 40, 400000000, 'Draft'),
  (:'ws', :'pid', 'Termin', 2, 'Termin 1 35%', 35, 350000000, 'Draft'),
  (:'ws', :'pid', 'Retensi', 3, 'Retensi 25%', 25, 250000000, 'Draft')
 returning id as ptid;

\echo '--- T20b Verify nominal calculated from persen (40% of 1000jt = 400jt)'
reset role; 
select jenis, urutan, label, persen, nominal, status 
from public.payment_terms 
where workspace_id = :'ws' and project_id = :'pid'
order by urutan;

\echo '--- T20c Finance Manager updates Uang Muka Draft -> Tagih, tanggal_tagih recorded'
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select public.update_payment_term_status(
  :'ws', :'pid', 
  (select id from public.payment_terms where jenis='Uang Muka' limit 1),
  'Tagih', current_date, 'Pengajuan tagihan UM'
) ->> 'message' as t20c_tagih_um;

\echo '--- T20d Verify Uang Muka status=Tagih with tanggal_tagih set'
reset role;
select jenis, status, tanggal_tagih, tanggal_lunas 
from public.payment_terms 
where jenis='Uang Muka' and workspace_id=:'ws' and project_id=:'pid';

\echo '--- T20e Procurement (non-Finance) attempts Tagih -> rejected (SoD: only Finance)'
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select public.update_payment_term_status(
  :'ws', :'pid',
  (select id from public.payment_terms where jenis='Termin' limit 1),
  'Tagih', current_date, 'Procurement tries'
);

\echo '--- T20f Finance updates Termin 1 Draft->Tagih->Lunas (2 sequential transitions)'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select public.update_payment_term_status(
  :'ws', :'pid',
  (select id from public.payment_terms where jenis='Termin' limit 1),
  'Tagih', '2026-10-15'::date, 'Termin 1 tagih'
) ->> 'message' as t20f_termin_tagih;

select public.update_payment_term_status(
  :'ws', :'pid',
  (select id from public.payment_terms where jenis='Termin' limit 1),
  'Lunas', '2026-10-20'::date, 'Termin 1 lunas'
) ->> 'message' as t20f_termin_lunas;

\echo '--- T20g Verify Termin 1 status=Lunas with both dates recorded'
reset role;
select jenis, status, tanggal_tagih, tanggal_lunas 
from public.payment_terms 
where jenis='Termin' and workspace_id=:'ws' and project_id=:'pid';

\echo '--- T20h Termin already Lunas cannot transition again'
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select public.update_payment_term_status(
  :'ws', :'pid',
  (select id from public.payment_terms where jenis='Termin' limit 1),
  'Tagih', current_date
);

\echo '--- T21 Audit logs record payment_term CREATE and UPDATE_STATUS actions'
reset role;
select action, resource_type, diff_json ->> 'jenis' as jenis_audit
from public.audit_logs
where resource_type='payment_terms' and action='CREATE'
order by created_at;

\echo '--- T21b Audit logs for status transitions'
select action, resource_type, diff_json ->> 'from_status' as from_status, diff_json ->> 'to_status' as to_status
from public.audit_logs
where resource_type='payment_terms' and action='UPDATE_STATUS'
order by created_at;

\echo '--- T22 get_payment_schedule RPC returns summary (total persen, total nominal, count by status)'
reset role;
select public.get_payment_schedule(:'ws', :'pid') ->> 'total_persen' as summary_persen,
       public.get_payment_schedule(:'ws', :'pid') ->> 'total_nominal' as summary_nominal;

\echo '--- T22b get_payment_schedule returns terms list with urutan and status'
reset role;
select jsonb_array_length(public.get_payment_schedule(:'ws', :'pid') -> 'terms') as jumlah_terms;

\echo '--- T23 Tenant isolation: user from different workspace cannot update payment terms'
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select public.update_payment_term_status(
  :'ws2', :'pid',
  (select id from public.payment_terms where jenis='Retensi' limit 1),
  'Tagih'
);

\echo '--- T24 Delete payment_term: only Draft allowed, Tagih/Lunas rejected'
reset role;
insert into public.payment_terms (workspace_id, project_id, jenis, urutan, label, persen, nominal, status)
 values (:'ws', :'pid', 'Bonus', 4, 'Bonus', 0, 0, 'Draft')
 returning id as bonus_id \gset

set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
delete from public.payment_terms where id = :'bonus_id' and status='Draft';

\echo '--- T24b Try delete Tagih/Lunas (should fail if policy enforced)'
select count(*) as draft_terms_remaining
from public.payment_terms
where workspace_id=:'ws' and project_id=:'pid' and status='Draft';
select count(*) as total_terms_final
from public.payment_terms
where workspace_id=:'ws' and project_id=:'pid';

\echo '--- T25 Resource Prices: Finance creates Bahan with wilayah filtering'
reset role;
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select public.upsert_resource_price(
  :'ws', 'Bahan', 'SM-001', 'Semen Portland PCC 50kg', 'sak', 75000, 'Jakarta', current_date, null, 'Tiga Roda'
) ->> 'message' as t25_create_bahan;

\echo '--- T25b Same kode different wilayah -> different record'
select public.upsert_resource_price(
  :'ws', 'Bahan', 'SM-001', 'Semen Portland PCC 50kg', 'sak', 72000, 'Bandung', current_date, null, 'Tiga Roda'
) ->> 'message' as t25_create_bandung;

reset role;
select count(*) as total_resource_prices_2 from public.resource_prices where workspace_id=:'ws' and kode='SM-001';
select wilayah, harga from public.resource_prices where workspace_id=:'ws' and kode='SM-001' order by wilayah;

\echo '--- T26 Resource Prices: Update existing by ID -> harga changes, audit logged'
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select public.upsert_resource_price(
  :'ws', 'Bahan', 'SM-001', 'Semen Portland PCC 50kg', 'sak', 76000, 'Jakarta', current_date, null, 'Tiga Roda',
  (select id from public.resource_prices where workspace_id=:'ws' and kode='SM-001' and wilayah='Jakarta' limit 1)
) ->> 'message' as t26_update_harga;

reset role;
select harga from public.resource_prices where workspace_id=:'ws' and kode='SM-001' and wilayah='Jakarta';
select count(*) as audit_update_resource from public.audit_logs where action='UPDATE_RESOURCE_PRICE' and resource_type='resource_price';

\echo '--- T27 Resource Prices: Role permission (warehouse cannot create) -> rejected'
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
select public.upsert_resource_price(
  :'ws', 'Upah', 'UP-001', 'Tukang Batu Ahli', 'OH', 150000, '', current_date
);

\echo '--- T28 Resource Prices: Batch import with validation (skip invalid rows)'
reset role;
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select public.import_resource_prices_batch(
  :'ws',
  '[
    {"jenis":"Bahan","kode":"PS-001","uraian":"Pasir Beton","satuan":"m3","harga":350000,"wilayah":"Jakarta"},
    {"jenis":"Alat","kode":"CT-001","uraian":"Concrete Mixer","satuan":"hari","harga":250000,"wilayah":""},
    {"jenis":"Invalid","kode":"","uraian":"Missing Kode","satuan":"unit","harga":1000},
    {"jenis":"Upah","kode":"UP-002","uraian":"Mandor","satuan":"OH","harga":-500}
  ]'::jsonb
) -> 'inserted' as t28_inserted,
  public.import_resource_prices_batch(
  :'ws',
  '[
    {"jenis":"Bahan","kode":"PS-001","uraian":"Pasir Beton","satuan":"m3","harga":350000,"wilayah":"Jakarta"},
    {"jenis":"Alat","kode":"CT-001","uraian":"Concrete Mixer","satuan":"hari","harga":250000,"wilayah":""},
    {"jenis":"Invalid","kode":"","uraian":"Missing Kode","satuan":"unit","harga":1000},
    {"jenis":"Upah","kode":"UP-002","uraian":"Mandor","satuan":"OH","harga":-500}
  ]'::jsonb
) -> 'skipped' as t28_skipped;

reset role;
select count(*) as valid_imported from public.resource_prices where workspace_id=:'ws' and kode in ('PS-001','CT-001');

\echo '--- T29 Resource Prices: Delete requires PM/Finance/Owner role'
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select public.delete_resource_price(
  :'ws',
  (select id from public.resource_prices where workspace_id=:'ws' and kode='CT-001' limit 1)
) ->> 'message' as t29_delete;

reset role;
select count(*) as ct001_after_delete from public.resource_prices where workspace_id=:'ws' and kode='CT-001';

\echo '--- T30 Resource Prices: Tenant isolation (outsider cannot see or modify)'
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select count(*) as outsider_see_resources from public.resource_prices where workspace_id=:'ws';
select public.upsert_resource_price(:'ws', 'Bahan', 'HACK', 'Intruder', 'kg', 1);

\echo '--- T31 Resource Prices: Direct write blocked (INSERT/UPDATE/DELETE via table)'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into public.resource_prices (workspace_id, jenis, kode, uraian, satuan, harga) values (:'ws', 'Bahan', 'DIRECT', 'Bypass', 'unit', 999);
update public.resource_prices set harga = 1 where kode='SM-001';
delete from public.resource_prices where kode='PS-001';

\echo '--- T32 AHSP Templates: Project Manager creates template with overhead'
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a7', 'pm@indotek.test') on conflict do nothing;
insert into public.workspace_members (workspace_id, user_id, role) values (:'ws', '00000000-0000-0000-0000-0000000000a7', 'project_manager') on conflict do nothing;

set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a7');
select public.upsert_ahsp_template(
  :'ws', 'AHSP-001', 'Pekerjaan 1m3 Beton K-300', 'm3', 'Struktur', 15.0
) ->> 'message' as t32_create_template;

reset role;
select kode, nama, satuan, overhead_profit_pct from public.ahsp_templates where workspace_id=:'ws' and kode='AHSP-001';

\echo '--- T33 AHSP Components: Add components to template (Bahan + Upah + Alat)'
reset role;
insert into public.resource_prices (workspace_id, jenis, kode, uraian, satuan, harga, wilayah)
values
  (:'ws', 'Bahan', 'SM-002', 'Semen PCC', 'sak', 75000, 'Jakarta'),
  (:'ws', 'Upah', 'TK-001', 'Tukang Batu', 'OH', 150000, ''),
  (:'ws', 'Alat', 'MX-001', 'Molen', 'hari', 200000, '')
returning id;

set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a7');
select public.upsert_ahsp_component(
  :'ws',
  (select id from public.ahsp_templates where workspace_id=:'ws' and kode='AHSP-001' limit 1),
  (select id from public.resource_prices where workspace_id=:'ws' and kode='SM-002' limit 1),
  7.5, 'Kebutuhan semen'
) ->> 'message' as t33_add_bahan;

select public.upsert_ahsp_component(
  :'ws',
  (select id from public.ahsp_templates where workspace_id=:'ws' and kode='AHSP-001' limit 1),
  (select id from public.resource_prices where workspace_id=:'ws' and kode='TK-001' limit 1),
  1.2, 'Tenaga tukang'
) ->> 'message' as t33_add_upah;

reset role;
select count(*) as total_components from public.ahsp_components
where ahsp_template_id=(select id from public.ahsp_templates where workspace_id=:'ws' and kode='AHSP-001' limit 1);

\echo '--- T34 AHSP: Calculate unit price with wilayah matching (Jakarta gets 75k, default gets 72k)'
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a7');
select public.calculate_ahsp_unit_price(
  (select id from public.ahsp_templates where workspace_id=:'ws' and kode='AHSP-001' limit 1),
  'Jakarta', :'ws'
) -> 'unit_price_without_overhead' as t34_price_jakarta;

select public.calculate_ahsp_unit_price(
  (select id from public.ahsp_templates where workspace_id=:'ws' and kode='AHSP-001' limit 1),
  'Bandung', :'ws'
) -> 'unit_price_without_overhead' as t34_price_bandung;

\echo '--- T35 AHSP: Delete template cascades to components'
reset role;
select count(*) as components_before from public.ahsp_components
where ahsp_template_id=(select id from public.ahsp_templates where workspace_id=:'ws' and kode='AHSP-001' limit 1);

set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a7');
select public.delete_ahsp_template(
  :'ws',
  (select id from public.ahsp_templates where workspace_id=:'ws' and kode='AHSP-001' limit 1)
) ->> 'message' as t35_delete_template;

reset role;
select count(*) as templates_after from public.ahsp_templates where workspace_id=:'ws' and kode='AHSP-001';
select count(*) as components_after from public.ahsp_components
where ahsp_template_id=(select id from public.ahsp_templates where workspace_id=:'ws' and kode='AHSP-001' limit 1);

\echo '--- T36 AHSP: Seed PUPR templates idempotent (20 items, replay same count)'
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select public.seed_pupr_ahsp_templates(:'ws') -> 'total' as t36_seed_first;
select public.seed_pupr_ahsp_templates(:'ws') -> 'total' as t36_seed_replay;

reset role;
select count(*) as pupr_templates_count from public.ahsp_templates where workspace_id=:'ws' and kode like 'PUPR-%';

\echo '--- T37 AHSP: Tenant isolation (outsider cannot create template)'
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select public.upsert_ahsp_template(:'ws', 'HACK-AHSP', 'Intruder Template', 'm2', 'Evil', 10);

\echo '--- T38 AHSP: Direct write blocked'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into public.ahsp_templates (workspace_id, kode, nama, satuan) values (:'ws', 'DIRECT-AHSP', 'Bypass', 'm2');
update public.ahsp_templates set overhead_profit_pct = 999 where kode like 'PUPR-%' limit 1;

\echo '--- T39 BOQ Items: Owner creates root item + child hierarchy'
reset role;
update public.projects set ppn_percent = 11 where id = :'pid';

set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select public.upsert_boq_item(
  :'ws', :'pid', null, 'BOQ-DIV-1', 'Pekerjaan Persiapan', 'Pekerjaan Struktur', '', 0, 0, null, null
) ->> 'id' as parent_boq_id \gset

select public.upsert_boq_item(
  :'ws', :'pid', :'parent_boq_id', 'BOQ-001', 'Galian Tanah 100m3', 'Pekerjaan Struktur', 'm3', 100, 50000, null, 'boq-gal'
) ->> 'message' as t39_create_child;

reset role;
select kode_item, uraian, volume, harga_satuan, jumlah_harga from public.boq_items
where workspace_id=:'ws' and project_id=:'pid' and kode_item='BOQ-001';

\echo '--- T40 BOQ: Auto-calculate bobot_persen from jumlah_harga'
reset role;
select public.upsert_boq_item(
  :'ws', :'pid', :'parent_boq_id', 'BOQ-002', 'Pasang Bekisting', 'm2', 50, 150000, null, 'boq-bek'
) ->> 'message';

select kode_item, jumlah_harga, bobot_persen from public.boq_items
where workspace_id=:'ws' and project_id=:'pid' and kode_item in ('BOQ-001', 'BOQ-002')
order by kode_item;

\echo '--- T40b Verify bobot sum matches budget_line proportion'
reset role;
select sum(bobot_persen) as total_bobot from public.boq_items
where workspace_id=:'ws' and project_id=:'pid' and parent_id=:'parent_boq_id';

\echo '--- T41 BOQ: Update progress triggers rollup to budget_lines'
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select public.update_boq_item_progress(
  :'ws', :'pid',
  (select id from public.boq_items where workspace_id=:'ws' and kode_item='BOQ-001' limit 1),
  60.0
) ->> 'message' as t41_update_progress;

reset role;
select progres_persen from public.boq_items where workspace_id=:'ws' and kode_item='BOQ-001';
select progres_fisik from public.budget_lines where workspace_id=:'ws' and project_id=:'pid' and code='BL-01';

\echo '--- T42 BOQ: get_project_boq_summary returns totals with PPN 11%'
reset role;
select public.get_project_boq_summary(:'ws', :'pid') -> 'total_before_ppn' as t42_total_before_ppn;
select public.get_project_boq_summary(:'ws', :'pid') -> 'ppn_amount' as t42_ppn_amount;
select public.get_project_boq_summary(:'ws', :'pid') -> 'grand_total' as t42_grand_total;

\echo '--- T43 BOQ: terbilang_rupiah function converts numbers to Indonesian words'
reset role;
select public.terbilang_rupiah(5000000) as t43_lima_juta;
select public.terbilang_rupiah(123456789) as t43_long_number;

\echo '--- T44 BOQ: Delete item cascades children, recalculates bobot'
reset role;
select count(*) as items_before from public.boq_items where workspace_id=:'ws' and project_id=:'pid';

set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select public.delete_boq_item(
  :'ws', :'pid',
  (select id from public.boq_items where workspace_id=:'ws' and kode_item='BOQ-002' limit 1)
) ->> 'message' as t44_delete_item;

reset role;
select count(*) as items_after from public.boq_items where workspace_id=:'ws' and project_id=:'pid';
select bobot_persen from public.boq_items where workspace_id=:'ws' and kode_item='BOQ-001';

\echo '--- T45 Storage: Attachment access by record_type (field_report assigned user can access)'
reset role;
insert into public.attachments (workspace_id, record_type, record_id, file_name, storage_path, file_size, uploader_id)
values (
  :'ws', 'field_report',
  (select id from public.field_reports where workspace_id=:'ws' limit 1),
  'daily_report.pdf', 'attachments/test.pdf', 102400,
  '00000000-0000-0000-0000-0000000000a5'
) returning id as att_id \gset

set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a5');
select count(*) as site_manager_see_own_attachment from public.attachments where id=:'att_id';

\echo '--- T45b Non-assigned user cannot see field_report attachment'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select count(*) as procurement_see_field_report_att from public.attachments where id=:'att_id';

\echo '--- T46 Storage: DELETE restricted to uploader or Owner'
reset role;
insert into public.attachments (workspace_id, record_type, record_id, file_name, storage_path, file_size, uploader_id)
values (
  :'ws', 'purchase_order',
  (select id from public.purchase_orders where workspace_id=:'ws' limit 1),
  'invoice.pdf', 'attachments/inv.pdf', 204800,
  '00000000-0000-0000-0000-0000000000a2'
) returning id as po_att_id \gset

\echo '--- T46b Non-uploader (warehouse) cannot delete procurement attachment'
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
delete from public.attachments where id=:'po_att_id';

\echo '--- T46c Owner can delete any attachment'
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
delete from public.attachments where id=:'po_att_id';

reset role;
select count(*) as po_attachment_after_owner_delete from public.attachments where id=:'po_att_id';

\echo '--- T47 Storage: Tenant isolation (outsider cannot see or upload attachments)'
set role authenticated; select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select count(*) as outsider_see_attachments from public.attachments where workspace_id=:'ws';
insert into public.attachments (workspace_id, record_type, record_id, file_name, storage_path, file_size, uploader_id)
values (:'ws', 'project', :'pid', 'hack.pdf', 'evil.pdf', 1024, '00000000-0000-0000-0000-0000000000b1');

\echo '=== All tests T1-T47 completed ==='
