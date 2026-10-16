-- Enterprise release guards: shared audit and idempotency indexes.
-- Keep schema additive; no existing workflow data is rewritten.

create index if not exists idx_idempotency_keys_workspace_created_at
  on public.idempotency_keys (workspace_id, created_at desc);

create index if not exists idx_audit_logs_workspace_created_at
  on public.audit_logs (workspace_id, created_at desc);

comment on index public.idx_idempotency_keys_workspace_created_at is
  'Supports duplicate-command investigation and retention jobs.';
comment on index public.idx_audit_logs_workspace_created_at is
  'Supports audit trail retrieval and retention jobs.';
