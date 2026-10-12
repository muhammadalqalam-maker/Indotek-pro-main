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

