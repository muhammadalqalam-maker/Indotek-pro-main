-- Restore production RPC contract and relationship metadata used by Supabase PostgREST.
-- Safe for databases where migration 20261016000018 already exists.

create or replace function public.create_field_report(
  p_workspace_id uuid,
  p_project_id uuid,
  p_report_date date,
  p_site_supervisor_name text,
  p_weather_morning text default 'Cerah',
  p_weather_afternoon text default 'Cerah',
  p_working_hours numeric default 8,
  p_workforce jsonb default '[]'::jsonb,
  p_completed_works jsonb default '[]'::jsonb,
  p_materials_used jsonb default '[]'::jsonb,
  p_equipment_used jsonb default '[]'::jsonb,
  p_blockers text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
  cached jsonb;
  proj record;
  v_no text;
  v_id uuid;
  res jsonb;
begin
  select * into a from private.require_actor(p_workspace_id);
  cached := private.idem_begin(p_workspace_id, p_idempotency_key);
  if cached is not null then
    return cached || jsonb_build_object('idempotentReplay', true);
  end if;
  if not private.has_perm(p_workspace_id, 'field_reports', 'create') then
    raise exception 'Peran "%" tidak berhak membuat laporan harian.', a.actor_role using errcode = '42501';
  end if;
  select id, code, name into proj from public.projects
   where id = p_project_id and workspace_id = p_workspace_id;
  if not found then raise exception 'Proyek tidak ditemukan.' using errcode = 'P0002'; end if;
  if not private.is_assigned(p_workspace_id, p_project_id) then
    raise exception 'Akses ditolak: Anda tidak ditugaskan pada proyek "%".', proj.name using errcode = '42501';
  end if;
  if p_report_date is null then raise exception 'Tanggal laporan wajib diisi.'; end if;
  if nullif(trim(p_site_supervisor_name), '') is null then raise exception 'Nama pengawas lapangan wajib diisi.'; end if;
  if p_working_hours is null or p_working_hours <= 0 or p_working_hours > 24 then raise exception 'Jam kerja harus lebih dari 0 sampai 24 jam.'; end if;
  if p_weather_morning not in ('Cerah', 'Berawan', 'Hujan Ringan', 'Hujan Deras') then raise exception 'Cuaca pagi tidak valid: %', p_weather_morning; end if;
  if p_weather_afternoon not in ('Cerah', 'Berawan', 'Hujan Ringan', 'Hujan Deras') then raise exception 'Cuaca sore tidak valid: %', p_weather_afternoon; end if;
  v_no := private.next_doc_number(p_workspace_id, 'LHP', proj.code);
  insert into public.field_reports (
    workspace_id, project_id, report_number, report_date, weather_morning, weather_afternoon,
    working_hours, site_supervisor_id, site_supervisor_name, workforce, completed_works,
    materials_used, equipment_used, blockers, status, created_by
  ) values (
    p_workspace_id, p_project_id, v_no, p_report_date, p_weather_morning, p_weather_afternoon,
    p_working_hours, case when lower(trim(p_site_supervisor_name)) = lower(a.actor_name) then a.uid else null end,
    trim(p_site_supervisor_name), coalesce(p_workforce, '[]'::jsonb), coalesce(p_completed_works, '[]'::jsonb),
    coalesce(p_materials_used, '[]'::jsonb), coalesce(p_equipment_used, '[]'::jsonb), p_blockers, 'Draft', a.uid
  ) returning id into v_id;
  perform private.write_audit(p_workspace_id, a.uid, a.actor_name, a.actor_role, 'FIELD_REPORT_SUBMITTED', 'field_report', v_id, p_project_id, format('Membuat Draft Laporan Harian Proyek %s (%s)', v_no, proj.name), 'None', 'Draft');
  res := jsonb_build_object('success', true, 'message', format('Laporan harian %s berhasil dibuat sebagai Draft.', v_no), 'data', jsonb_build_object('id', v_id, 'reportNumber', v_no, 'status', 'Draft'));
  perform private.idem_end(p_workspace_id, p_idempotency_key, res);
  return res;
end
$$;

revoke all on function public.create_field_report(uuid, uuid, date, text, text, text, numeric, jsonb, jsonb, jsonb, jsonb, text, text) from public, anon;
grant execute on function public.create_field_report(uuid, uuid, date, text, text, text, numeric, jsonb, jsonb, jsonb, jsonb, text, text) to authenticated;

-- PostgREST needs FK metadata to resolve projects(...) embedding.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'stock_adjustments_project_id_fkey'
      and conrelid = 'public.stock_adjustments'::regclass
  ) then
    alter table public.stock_adjustments
      add constraint stock_adjustments_project_id_fkey
      foreign key (project_id) references public.projects(id) on delete set null;
  end if;
end
$$;
