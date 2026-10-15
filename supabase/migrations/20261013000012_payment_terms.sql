-- ============================================================
-- INDOTEK PRO — PHASE F: Payment Terms (Termin, Uang Muka, Retensi)
-- Migration: 20261013000012_payment_terms.sql
-- ============================================================

-- 1. TABLE
CREATE TABLE IF NOT EXISTS public.payment_terms (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  jenis            text NOT NULL CHECK (jenis IN ('UangMuka', 'Termin', 'Retensi')),
  urutan           integer NOT NULL DEFAULT 1,
  label            text NOT NULL,
  persen           numeric(6,2) NOT NULL DEFAULT 0 CHECK (persen >= 0 AND persen <= 100),
  nominal          bigint NOT NULL DEFAULT 0 CHECK (nominal >= 0),
  milestone_id     uuid REFERENCES public.milestones(id) ON DELETE SET NULL,
  masa_pemeliharaan_hari integer DEFAULT NULL,
  status           text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Tagih', 'Lunas')),
  tanggal_tagih    date DEFAULT NULL,
  tanggal_lunas    date DEFAULT NULL,
  keterangan       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_terms_workspace ON public.payment_terms(workspace_id);
CREATE INDEX IF NOT EXISTS idx_payment_terms_project   ON public.payment_terms(project_id);
CREATE INDEX IF NOT EXISTS idx_payment_terms_milestone ON public.payment_terms(milestone_id);
CREATE INDEX IF NOT EXISTS idx_payment_terms_status    ON public.payment_terms(status);

-- 2. TRIGGER updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_payment_terms_updated_at'
    AND tgrelid = 'public.payment_terms'::regclass
  ) THEN
    CREATE TRIGGER trg_payment_terms_updated_at
      BEFORE UPDATE ON public.payment_terms
      FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();
  END IF;
END$$;

-- 3. RLS
ALTER TABLE public.payment_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_terms_select ON public.payment_terms FOR SELECT USING (
  workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND status = 'Aktif')
);
CREATE POLICY payment_terms_insert ON public.payment_terms FOR INSERT WITH CHECK (false);
CREATE POLICY payment_terms_update ON public.payment_terms FOR UPDATE USING (false);
CREATE POLICY payment_terms_delete ON public.payment_terms FOR DELETE USING (false);
-- 4. HELPER: check_payment_terms_access
CREATE OR REPLACE FUNCTION private.check_payment_terms_access(
  p_workspace_id uuid,
  p_project_id   uuid,
  p_require_role text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public
AS $$
DECLARE v_member_role text;
BEGIN
  SELECT role INTO v_member_role FROM public.workspace_members
  WHERE user_id = auth.uid() AND workspace_id = p_workspace_id AND status = 'Aktif';
  IF v_member_role IS NULL THEN RAISE EXCEPTION 'Akses ditolak: bukan anggota aktif workspace.' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND workspace_id = p_workspace_id) THEN
    RAISE EXCEPTION 'Proyek tidak ditemukan dalam workspace ini.' USING ERRCODE = 'P0002';
  END IF;
  IF p_require_role IS NOT NULL THEN
    IF NOT (
      v_member_role IN ('owner', 'Owner / Director') OR
      v_member_role = p_require_role OR
      (p_require_role IN ('finance', 'Finance Manager', 'Finance / Accounting') AND v_member_role IN ('finance', 'Finance / Accounting', 'Finance Manager'))
    ) THEN
      RAISE EXCEPTION 'Akses ditolak: peran % diperlukan.', p_require_role USING ERRCODE = '42501';
    END IF;
  END IF;
END;
$$;

-- 5. RPC: upsert_payment_term
CREATE OR REPLACE FUNCTION public.upsert_payment_term(
  p_workspace_id   uuid,
  p_project_id     uuid,
  p_id             uuid DEFAULT NULL,
  p_jenis          text DEFAULT 'Termin',
  p_urutan         integer DEFAULT 1,
  p_label          text DEFAULT '',
  p_persen         numeric DEFAULT 0,
  p_milestone_id   uuid DEFAULT NULL,
  p_masa_pemeliharaan_hari integer DEFAULT NULL,
  p_keterangan     text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_contract_value bigint;
  v_nominal        bigint;
  v_result_id      uuid;
  v_existing_sum   numeric;
BEGIN
  PERFORM private.check_payment_terms_access(p_workspace_id, p_project_id);
  IF p_persen < 0 OR p_persen > 100 THEN RAISE EXCEPTION 'Persen harus antara 0-100.' USING ERRCODE = '22003'; END IF;

  SELECT COALESCE(SUM(persen), 0) INTO v_existing_sum
  FROM public.payment_terms
  WHERE project_id = p_project_id AND workspace_id = p_workspace_id
    AND (p_id IS NULL OR id <> p_id);
  IF v_existing_sum + p_persen > 100.0 THEN
    RAISE EXCEPTION 'Total persen termin melebihi 100%%. Tersisa: %', (100 - v_existing_sum) USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(CAST(planned_amount AS numeric)), 0)::bigint INTO v_contract_value
  FROM public.budget_lines WHERE project_id = p_project_id AND workspace_id = p_workspace_id;

  v_nominal := ROUND((p_persen / 100.0) * v_contract_value);

  IF p_id IS NOT NULL THEN
    UPDATE public.payment_terms SET
      jenis = p_jenis, urutan = p_urutan,
      label = COALESCE(NULLIF(p_label,''), p_jenis||' '||p_urutan),
      persen = p_persen, nominal = v_nominal,
      milestone_id = p_milestone_id,
      masa_pemeliharaan_hari = p_masa_pemeliharaan_hari,
      keterangan = p_keterangan, updated_at = now()
    WHERE id = p_id AND project_id = p_project_id AND workspace_id = p_workspace_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Termin tidak ditemukan.' USING ERRCODE = 'P0002'; END IF;
    v_result_id := p_id;
  ELSE
    INSERT INTO public.payment_terms (workspace_id, project_id, jenis, urutan, label, persen, nominal, milestone_id, masa_pemeliharaan_hari, keterangan, status)
    VALUES (p_workspace_id, p_project_id, p_jenis, p_urutan,
      COALESCE(NULLIF(p_label,''), p_jenis||' '||p_urutan),
      p_persen, v_nominal, p_milestone_id, p_masa_pemeliharaan_hari, p_keterangan, 'Draft')
    RETURNING id INTO v_result_id;
  END IF;

  RETURN jsonb_build_object('id', v_result_id, 'nominal', v_nominal, 'message', 'Termin berhasil disimpan.');
END;
$$;

-- 6. RPC: delete_payment_term
CREATE OR REPLACE FUNCTION public.delete_payment_term(
  p_workspace_id uuid, p_project_id uuid, p_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM private.check_payment_terms_access(p_workspace_id, p_project_id);
  IF EXISTS (SELECT 1 FROM public.payment_terms WHERE id = p_id AND status IN ('Tagih','Lunas')) THEN
    RAISE EXCEPTION 'Termin yang sudah ditagih/lunas tidak dapat dihapus.' USING ERRCODE = '23503';
  END IF;
  DELETE FROM public.payment_terms WHERE id = p_id AND project_id = p_project_id AND workspace_id = p_workspace_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Termin tidak ditemukan.' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('message', 'Termin berhasil dihapus.');
END;
$$;

-- 7. RPC: update_payment_term_status (SoD: Finance Manager only)
CREATE OR REPLACE FUNCTION public.update_payment_term_status(
  p_workspace_id uuid, p_project_id uuid, p_id uuid,
  p_status text, p_tanggal date DEFAULT CURRENT_DATE, p_keterangan text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_current_status text;
BEGIN
  PERFORM private.check_payment_terms_access(p_workspace_id, p_project_id, 'Finance Manager');
  IF p_status NOT IN ('Tagih','Lunas') THEN RAISE EXCEPTION 'Status tidak valid. Pilihan: Tagih atau Lunas.' USING ERRCODE = '22023'; END IF;
  SELECT status INTO v_current_status FROM public.payment_terms
  WHERE id = p_id AND workspace_id = p_workspace_id AND project_id = p_project_id;
  IF v_current_status IS NULL THEN RAISE EXCEPTION 'Termin tidak ditemukan.' USING ERRCODE = 'P0002'; END IF;
  IF v_current_status = 'Lunas' THEN RAISE EXCEPTION 'Termin yang sudah lunas tidak dapat diubah.' USING ERRCODE = '23503'; END IF;
  IF v_current_status = 'Tagih' AND p_status = 'Tagih' THEN RAISE EXCEPTION 'Termin sudah berstatus Tagih.' USING ERRCODE = '23505'; END IF;

  UPDATE public.payment_terms SET
    status = p_status,
    tanggal_tagih = CASE WHEN p_status = 'Tagih' THEN p_tanggal ELSE tanggal_tagih END,
    tanggal_lunas = CASE WHEN p_status = 'Lunas' THEN p_tanggal ELSE tanggal_lunas END,
    keterangan = COALESCE(p_keterangan, keterangan), updated_at = now()
  WHERE id = p_id AND workspace_id = p_workspace_id AND project_id = p_project_id;

  INSERT INTO public.audit_logs (workspace_id, actor_id, action, record_type, record_id, metadata)
  VALUES (p_workspace_id, auth.uid(), 'UPDATE_STATUS', 'payment_terms', p_id,
    jsonb_build_object('from', v_current_status, 'to', p_status, 'tanggal', p_tanggal))
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('message', 'Status termin diperbarui ke '||p_status||'.');
END;
$$;

-- 8. RPC: get_payment_schedule
CREATE OR REPLACE FUNCTION public.get_payment_schedule(p_workspace_id uuid, p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_terms jsonb; v_summary jsonb;
BEGIN
  PERFORM private.check_payment_terms_access(p_workspace_id, p_project_id);
  SELECT jsonb_agg(jsonb_build_object(
    'id', pt.id, 'jenis', pt.jenis, 'urutan', pt.urutan, 'label', pt.label,
    'persen', pt.persen, 'nominal', pt.nominal, 'status', pt.status,
    'milestone_id', pt.milestone_id, 'milestone_title', ms.title,
    'masa_pemeliharaan_hari', pt.masa_pemeliharaan_hari,
    'tanggal_tagih', pt.tanggal_tagih, 'tanggal_lunas', pt.tanggal_lunas,
    'keterangan', pt.keterangan, 'created_at', pt.created_at
  ) ORDER BY pt.urutan)
  INTO v_terms FROM public.payment_terms pt
  LEFT JOIN public.milestones ms ON ms.id = pt.milestone_id
  WHERE pt.project_id = p_project_id AND pt.workspace_id = p_workspace_id;

  SELECT jsonb_build_object(
    'total_persen', COALESCE(SUM(persen),0),
    'total_nominal', COALESCE(SUM(nominal),0),
    'total_tagih', COALESCE(SUM(CASE WHEN status IN ('Tagih','Lunas') THEN nominal ELSE 0 END),0),
    'total_lunas', COALESCE(SUM(CASE WHEN status = 'Lunas' THEN nominal ELSE 0 END),0),
    'count_draft', COUNT(*) FILTER (WHERE status='Draft'),
    'count_tagih', COUNT(*) FILTER (WHERE status='Tagih'),
    'count_lunas', COUNT(*) FILTER (WHERE status='Lunas')
  ) INTO v_summary FROM public.payment_terms
  WHERE project_id = p_project_id AND workspace_id = p_workspace_id;

  RETURN jsonb_build_object('terms', COALESCE(v_terms,'[]'::jsonb), 'summary', COALESCE(v_summary,'{}'::jsonb));
END;
$$;

-- 9. DB ASSERTIONS
DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payment_terms'),
    'FAIL: payment_terms table missing';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE relname='payment_terms' AND relnamespace='public'::regnamespace) = true,
    'FAIL: RLS not enabled on payment_terms';
  ASSERT EXISTS (SELECT 1 FROM pg_proc WHERE proname='upsert_payment_term'),   'FAIL: upsert_payment_term missing';
  ASSERT EXISTS (SELECT 1 FROM pg_proc WHERE proname='delete_payment_term'),   'FAIL: delete_payment_term missing';
  ASSERT EXISTS (SELECT 1 FROM pg_proc WHERE proname='update_payment_term_status'), 'FAIL: update_payment_term_status missing';
  ASSERT EXISTS (SELECT 1 FROM pg_proc WHERE proname='get_payment_schedule'),  'FAIL: get_payment_schedule missing';
  RAISE NOTICE '✅ All Phase F assertions passed: payment_terms OK';
END$$;
