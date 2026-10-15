-- Stub minimal lingkungan Supabase untuk menguji migrasi di Postgres biasa
do $$ begin
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
exception when duplicate_object then null; end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text unique,
  raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text,
  owner uuid, created_at timestamptz default now());
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
create publication supabase_realtime;
grant usage on schema auth, storage, public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant select, insert, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;

-- Helper untuk test negatif: verifikasi operasi gagal dengan error
create or replace function expect_error(sql_statement text, expected_sqlstate text default null)
returns text language plpgsql as $$
declare
  err_sqlstate text;
  err_message text;
begin
  execute sql_statement;
  raise exception 'Expected error but statement succeeded: %', sql_statement;
exception
  when others then
    get stacked diagnostics err_sqlstate = returned_sqlstate, err_message = message_text;
    if expected_sqlstate is not null and err_sqlstate != expected_sqlstate then
      raise exception 'Wrong SQLSTATE. Expected %, got % (%)', expected_sqlstate, err_sqlstate, err_message;
    end if;
    return format('OK: %s (%s)', err_message, err_sqlstate);
end;
$$;
