// src/data/budgetLines.ts
import { supabase } from '../services/supabaseClient';
import { BudgetLine } from '../types'; // corrected import

// Reuse workspace resolution logic from projects
import { resolveCurrentWorkspaceId } from './projects';

/** Get budget lines for a specific project */
export async function getBudgetLines(projectId: string): Promise<BudgetLine[]> {
  const wsId = await resolveCurrentWorkspaceId();
  const { data, error } = await supabase
    .from('budget_lines')
    .select('*')
    .eq('workspace_id', wsId)
    .eq('project_id', projectId);
  if (error) throw new Error(error.message);
  return data as BudgetLine[];
}

/** Create a new budget line (descriptive fields only) */
export async function createBudgetLine(payload: Omit<BudgetLine, 'id'>): Promise<string> {
  const wsId = await resolveCurrentWorkspaceId();
  const { data, error } = await supabase
    .from('budget_lines')
    .insert({ ...payload, workspace_id: wsId })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return (data as any).id as string;
}

/** Update descriptive fields of a budget line via RPC */
export async function updateBudgetLineMeta(
  lineId: string,
  projectId: string,
  updates: Partial<BudgetLine>
): Promise<void> {
  const wsId = await resolveCurrentWorkspaceId();
  const { error } = await supabase.rpc('update_budget_line_meta', {
    p_workspace_id: wsId,
    p_project_id: projectId,
    p_line_id: lineId,
    p_code: updates.code ?? null,
    p_division_name: updates.divisionName ?? null,
    p_category: updates.category ?? null,
    p_unit: updates.unit ?? null,
    p_volume: updates.volume ?? null,
    p_unit_rate: updates.unitRate ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Delete a budget line via RPC (if a secure delete function exists) */
export async function deleteBudgetLine(lineId: string, projectId: string): Promise<void> {
  const wsId = await resolveCurrentWorkspaceId();
  const { error } = await supabase.rpc('delete_budget_line', {
    p_workspace_id: wsId,
    p_project_id: projectId,
    p_line_id: lineId,
  });
  if (error) throw new Error(error.message);
}
