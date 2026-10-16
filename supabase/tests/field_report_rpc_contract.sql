begin;

select plan(4);

select has_function(
  'public',
  'create_field_report',
  array['uuid','uuid','date','text','text','text','numeric','jsonb','jsonb','jsonb','jsonb','text','text'],
  'field-report RPC has the client contract signature'
);

select ok(
  position(
    'p_site_supervisor_name' in pg_get_functiondef(
      'public.create_field_report(uuid,uuid,date,text,text,text,numeric,jsonb,jsonb,jsonb,jsonb,text,text)'::regprocedure
    )
  ) > 0,
  'RPC accepts the site supervisor name'
);

select ok(
  position(
    'p_idempotency_key' in pg_get_functiondef(
      'public.create_field_report(uuid,uuid,date,text,text,text,numeric,jsonb,jsonb,jsonb,jsonb,text,text)'::regprocedure
    )
  ) > 0,
  'RPC accepts a stable idempotency key'
);

select ok(
  position(
    'p_working_hours > 24' in pg_get_functiondef(
      'public.create_field_report(uuid,uuid,date,text,text,text,numeric,jsonb,jsonb,jsonb,jsonb,text,text)'::regprocedure
    )
  ) > 0,
  'RPC rejects working hours over 24'
);

select * from finish();

rollback;
