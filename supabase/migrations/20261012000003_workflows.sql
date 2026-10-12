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

