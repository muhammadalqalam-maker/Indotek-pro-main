-- ============================================================
-- INDOTEK PRO — Payment Term Audit Logging Fix
-- Migration: 20261014_fix_payment_term_audit.sql
-- Purpose: Ensure comprehensive audit logging for payment_term status transitions
-- ============================================================

-- 1. FUNCTION: Audit payment_term status changes
CREATE OR REPLACE FUNCTION public.audit_payment_term_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_diff jsonb;
BEGIN
  -- Get current authenticated user or system user
  v_actor_id := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  
  -- Only log status changes and important field updates
  IF (NEW.status IS DISTINCT FROM OLD.status) OR
     (NEW.tanggal_tagih IS DISTINCT FROM OLD.tanggal_tagih) OR
     (NEW.tanggal_lunas IS DISTINCT FROM OLD.tanggal_lunas) THEN
    
    v_diff := jsonb_build_object(
      'status_from', OLD.status,
      'status_to', NEW.status,
      'tanggal_tagih_from', OLD.tanggal_tagih,
      'tanggal_tagih_to', NEW.tanggal_tagih,
      'tanggal_lunas_from', OLD.tanggal_lunas,
      'tanggal_lunas_to', NEW.tanggal_lunas,
      'keterangan', NEW.keterangan
    );
    
    INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, diff_json)
    VALUES (NEW.workspace_id, v_actor_id, 'UPDATE', 'payment_terms', NEW.id, v_diff)
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 2. TRIGGER: Automatic audit on payment_term updates
CREATE TRIGGER trg_audit_payment_term_update
AFTER UPDATE ON public.payment_terms
FOR EACH ROW
EXECUTE FUNCTION public.audit_payment_term_change();

-- 3. FUNCTION: Log payment_term creation
CREATE OR REPLACE FUNCTION public.audit_payment_term_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
BEGIN
  v_actor_id := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  
  INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, diff_json)
  VALUES (NEW.workspace_id, v_actor_id, 'CREATE', 'payment_terms', NEW.id,
    jsonb_build_object(
      'jenis', NEW.jenis,
      'urutan', NEW.urutan,
      'label', NEW.label,
      'persen', NEW.persen,
      'nominal', NEW.nominal,
      'status', NEW.status
    ))
  ON CONFLICT DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- 4. TRIGGER: Automatic audit on payment_term insert
CREATE TRIGGER trg_audit_payment_term_insert
AFTER INSERT ON public.payment_terms
FOR EACH ROW
EXECUTE FUNCTION public.audit_payment_term_insert();

-- 5. FUNCTION: Log payment_term deletion
CREATE OR REPLACE FUNCTION public.audit_payment_term_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
BEGIN
  v_actor_id := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  
  INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, diff_json)
  VALUES (OLD.workspace_id, v_actor_id, 'DELETE', 'payment_terms', OLD.id,
    jsonb_build_object(
      'jenis', OLD.jenis,
      'label', OLD.label,
      'status', OLD.status,
      'nominal', OLD.nominal
    ))
  ON CONFLICT DO NOTHING;
  
  RETURN OLD;
END;
$$;

-- 6. TRIGGER: Automatic audit on payment_term delete
CREATE TRIGGER trg_audit_payment_term_delete
BEFORE DELETE ON public.payment_terms
FOR EACH ROW
EXECUTE FUNCTION public.audit_payment_term_delete();

-- 7. ENHANCED RPC: update_payment_term_status with full audit context
CREATE OR REPLACE FUNCTION public.update_payment_term_status(
  p_workspace_id uuid, p_project_id uuid, p_id uuid,
  p_status text, p_tanggal date DEFAULT CURRENT_DATE, p_keterangan text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_current_status text;
  v_actor_id uuid;
BEGIN
  v_actor_id := auth.uid();
  PERFORM private.check_payment_terms_access(p_workspace_id, p_project_id, 'Finance Manager');
  
  IF p_status NOT IN ('Tagih','Lunas') THEN
    RAISE EXCEPTION 'Status tidak valid. Pilihan: Tagih atau Lunas.';
  END IF;
  
  SELECT status INTO v_current_status FROM public.payment_terms
  WHERE id = p_id AND workspace_id = p_workspace_id AND project_id = p_project_id;
  
  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Termin tidak ditemukan.';
  END IF;
  
  IF v_current_status = 'Lunas' THEN
    RAISE EXCEPTION 'Termin yang sudah lunas tidak dapat diubah.';
  END IF;
  
  IF v_current_status = 'Tagih' AND p_status = 'Tagih' THEN
    RAISE EXCEPTION 'Termin sudah berstatus Tagih.';
  END IF;

  -- Update with explicit audit logging
  UPDATE public.payment_terms SET
    status = p_status,
    tanggal_tagih = CASE WHEN p_status = 'Tagih' THEN p_tanggal ELSE tanggal_tagih END,
    tanggal_lunas = CASE WHEN p_status = 'Lunas' THEN p_tanggal ELSE tanggal_lunas END,
    keterangan = COALESCE(p_keterangan, keterangan),
    updated_at = now()
  WHERE id = p_id AND workspace_id = p_workspace_id AND project_id = p_project_id;

  -- Explicit audit log with full context (redundant with trigger but ensures logging)
  INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, diff_json)
  VALUES (p_workspace_id, v_actor_id, 'UPDATE_STATUS', 'payment_terms', p_id,
    jsonb_build_object(
      'from_status', v_current_status,
      'to_status', p_status,
      'tanggal', p_tanggal,
      'keterangan', p_keterangan
    ))
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('message', 'Status termin diperbarui ke ' || p_status || '.');
END;
$$;

-- 8. DB ASSERTIONS
DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM pg_proc WHERE proname='audit_payment_term_change'),
    'FAIL: audit_payment_term_change function missing';
  ASSERT EXISTS (SELECT 1 FROM pg_proc WHERE proname='audit_payment_term_insert'),
    'FAIL: audit_payment_term_insert function missing';
  ASSERT EXISTS (SELECT 1 FROM pg_proc WHERE proname='audit_payment_term_delete'),
    'FAIL: audit_payment_term_delete function missing';
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname='trg_audit_payment_term_update' AND tgrelid='public.payment_terms'::regclass
  ), 'FAIL: trg_audit_payment_term_update trigger missing';
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname='trg_audit_payment_term_insert' AND tgrelid='public.payment_terms'::regclass
  ), 'FAIL: trg_audit_payment_term_insert trigger missing';
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname='trg_audit_payment_term_delete' AND tgrelid='public.payment_terms'::regclass
  ), 'FAIL: trg_audit_payment_term_delete trigger missing';
  RAISE NOTICE '✅ All payment_term audit logging assertions passed';
END$$;
