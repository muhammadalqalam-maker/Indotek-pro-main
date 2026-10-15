// src/data/projects.ts
import { supabase } from '../lib/supabase';
import { Project } from '../types';
// UUID generation using built-in crypto

/**
 * Resolve the active workspace for the current authenticated user.
 * If the user belongs to multiple workspaces, the first match is returned.
 * This replaces the previous hard‑coded DEFAULT_WORKSPACE_ID / SLUG.
 */
export async function resolveCurrentWorkspaceId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const { data, error } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  if (error) throw new Error(`Unable to resolve workspace: ${error.message}`);
  return data.workspace_id as string;
}

/** Get all projects for the current workspace */
export async function getProjects(): Promise<Project[]> {
  const wsId = await resolveCurrentWorkspaceId();
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('workspace_id', wsId);
  if (error) throw new Error(error.message);
  return data as Project[];
}

/** Get a single project by its id (or legacy_id) */
export async function getProject(projectId: string): Promise<Project | null> {
  const wsId = await resolveCurrentWorkspaceId();
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('workspace_id', wsId)
    .or(`id.eq.${projectId},legacy_id.eq.${projectId}`)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Project | null;
}

/** Create a new project – uses RPC to ensure security‑definer logic */
export async function createProject(payload: Partial<Project>): Promise<string> {
  const wsId = await resolveCurrentWorkspaceId();
  const id = crypto.randomUUID();
  const { error } = await supabase.rpc('create_project', {
    p_workspace_id: wsId,
    p_project_id: id,
    p_name: payload.name ?? null,
    p_client: payload.client ?? null,
    p_category: payload.category ?? null,
    p_location: payload.location ?? null,
    p_project_manager: payload.projectManager ?? null,
    p_site_engineer: payload.siteEngineer ?? null,
    p_contract_value: payload.contractValue ?? null,
    p_start_date: payload.startDate ?? null,
    p_target_end_date: payload.targetEndDate ?? null,
    p_description: payload.description ?? null,
    p_image_url: (payload as any).image ?? null,
  });
  if (error) throw new Error(error.message);
  return id;
}

/** Update project metadata – only descriptive columns are allowed */
export async function updateProject(projectId: string, updates: Partial<Project>): Promise<void> {
  const wsId = await resolveCurrentWorkspaceId();
  // Resolve UUID if a legacy_id was supplied
  let pid = projectId;
  if (projectId.length !== 36) {
    const { data, error } = await supabase
      .from('projects')
      .select('id')
      .eq('workspace_id', wsId)
      .eq('legacy_id', projectId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) pid = data.id as string;
  }
  const { error } = await supabase.rpc('update_project_meta', {
    p_workspace_id: wsId,
    p_project_id: pid,
    p_name: updates.name ?? null,
    p_client: updates.client ?? null,
    p_category: updates.category ?? null,
    p_location: updates.location ?? null,
    p_project_manager: updates.projectManager ?? null,
    p_site_engineer: updates.siteEngineer ?? null,
    p_contract_value: updates.contractValue ?? null,
    p_start_date: updates.startDate ?? null,
    p_target_end_date: updates.targetEndDate ?? null,
    p_image_url: (updates as any).image ?? null,
    p_description: updates.description ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Delete a project – uses RPC to enforce RLS */
export async function deleteProject(projectId: string): Promise<void> {
  const wsId = await resolveCurrentWorkspaceId();
  const { error } = await supabase.rpc('delete_project', {
    p_workspace_id: wsId,
    p_project_id: projectId,
  });
  if (error) throw new Error(error.message);
}
