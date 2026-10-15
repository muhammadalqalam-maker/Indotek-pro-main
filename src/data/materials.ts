// src/data/materials.ts
import { supabase } from '../lib/supabase';
import { MaterialItem, StockMutation, StockAdjustment } from '../types';
import { resolveCurrentWorkspaceId } from './projects';

/** Get all material catalog entries */
export async function getMaterials(): Promise<MaterialItem[]> {
  const wsId = await resolveCurrentWorkspaceId();
  const { data, error } = await supabase
    .from('materials')
    .select('*')
    .eq('workspace_id', wsId)
    .order('code', { ascending: true });
  if (error) throw new Error(error.message);
  return data as MaterialItem[];
}

/** Create a new material (descriptive fields only) */
export async function addMaterial(payload: Omit<MaterialItem, 'id'>): Promise<string> {
  const wsId = await resolveCurrentWorkspaceId();
  const { data, error } = await supabase
    .from('materials')
    .insert({ ...payload, workspace_id: wsId })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return (data as any).id as string;
}

/** Update descriptive fields of a material via RPC */
export async function updateMaterialMeta(
  materialId: string,
  updates: Partial<MaterialItem>
): Promise<void> {
  const wsId = await resolveCurrentWorkspaceId();
  const { error } = await supabase.rpc('update_material_meta', {
    p_workspace_id: wsId,
    p_material_id: materialId,
    p_code: updates.code ?? null,
    p_name: updates.name ?? null,
    p_specification: updates.specification ?? null,
    p_category: updates.category ?? null,
    p_unit: updates.unit ?? null,
    p_min_stock: updates.minStock ?? null,
    p_warehouse_location: updates.warehouseLocation ?? null,
    p_primary_supplier: updates.primarySupplier ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Retrieve stock mutations (no pagination for simplicity) */
export async function getStockMutations(): Promise<StockMutation[]> {
  const wsId = await resolveCurrentWorkspaceId();
  const { data, error } = await supabase
    .from('stock_mutations')
    .select('*, materials(name, legacy_id)')
    .eq('workspace_id', wsId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((row: any) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    materialId: row.materials?.legacy_id || row.material_id,
    materialName: row.materials?.name || 'Material',
    type: row.type,
    quantity: Number(row.quantity) || 0,
    unit: row.materials?.unit || row.unit || 'unit',
    date: row.created_at,
    referenceNo: row.reference_no,
    project: row.projects?.name || '',
    projectId: row.projects?.legacy_id || row.project_id || undefined,
    handler: row.handler || '',
    createdAt: row.created_at,
  } as StockMutation));
}

/** Record a stock mutation via RPC */
export async function createStockMutation(
  materialId: string,
  type: 'IN' | 'OUT',
  quantity: number,
  referenceNo: string
): Promise<void> {
  const wsId = await resolveCurrentWorkspaceId();
  const { error } = await supabase.rpc('create_stock_mutation', {
    p_workspace_id: wsId,
    p_material_id: materialId,
    p_type: type,
    p_quantity: quantity,
    p_reference_no: referenceNo,
  });
  if (error) throw new Error(error.message);
}

/** Submit a stock‑adjustment request via RPC */
export async function createStockAdjustment(
  materialId: string,
  physicalStock: number,
  reason: string,
  projectId?: string
): Promise<void> {
  const wsId = await resolveCurrentWorkspaceId();
  const { error } = await supabase.rpc('create_stock_adjustment', {
    p_workspace_id: wsId,
    p_material_id: materialId,
    p_physical_stock: physicalStock,
    p_reason: reason,
    p_project_id: projectId ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Approve or reject a pending stock adjustment via RPC */
export async function decideStockAdjustment(
  adjustmentId: string,
  decision: 'approve' | 'reject',
  notes?: string
): Promise<void> {
  const wsId = await resolveCurrentWorkspaceId();
  const { error } = await supabase.rpc('decide_stock_adjustment', {
    p_workspace_id: wsId,
    p_adjustment_id: adjustmentId,
    p_decision: decision,
    p_notes: notes ?? null,
  });
  if (error) throw new Error(error.message);
}
