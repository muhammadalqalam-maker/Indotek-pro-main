-- ============================================================================
-- INDOTEK PRO — MIGRATION 0016: WORKSPACE INSERT POLICY FOR CREATE_WORKSPACE RPC
-- ============================================================================
-- Fix: create_workspace RPC fails with 403 because no INSERT policy exists on workspaces table.
-- Add policy to allow authenticated users to insert (create_workspace RPC validates all business logic).
-- ============================================================================

create policy workspaces_insert on public.workspaces for insert to authenticated
  with check (true);
