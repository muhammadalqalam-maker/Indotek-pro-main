/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Supabase Workflow Service
 * Provides typed bridges from backend API endpoints to Supabase PostgreSQL RPC functions.
 * Executes with user auth context when token is present, respecting DB RLS & permissions.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin, loadSupabaseServerConfig } from './supabaseAdmin';
import { TrustedActor } from './auth';

export function isSupabaseConfigured(): boolean {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  return Boolean(url && !url.includes('placeholder'));
}

export interface SupabaseWorkflowResult {
  success: boolean;
  message: string;
  data?: any;
  idempotentReplay?: boolean;
}

function getActorClient(actor: TrustedActor): SupabaseClient {
  if (actor.token) {
    const { supabaseUrl } = loadSupabaseServerConfig();
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
    return createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: {
          Authorization: `Bearer ${actor.token}`,
        },
      },
    });
  }
  return supabaseAdmin;
}

export const supabaseWorkflowService = {
  // 1. Purchase Orders
  async createPurchaseOrder(
    actor: TrustedActor,
    payload: {
      projectId: string;
      supplierName: string;
      itemDescription?: string;
      quantitySummary?: string;
      totalCost: number;
      targetDeliveryDate?: string | null;
      submit?: boolean;
      idempotencyKey?: string;
    }
  ): Promise<SupabaseWorkflowResult> {
    const client = getActorClient(actor);
    const { data, error } = await client.rpc('create_purchase_order', {
      p_workspace_id: actor.workspaceId,
      p_project_id: payload.projectId,
      p_supplier_name: payload.supplierName,
      p_item_description: payload.itemDescription || '',
      p_quantity_summary: payload.quantitySummary || '',
      p_total_cost: Math.round(payload.totalCost),
      p_target_delivery_date: payload.targetDeliveryDate || null,
      p_submit: payload.submit ?? true,
      p_idempotency_key: payload.idempotencyKey || null,
    });
    if (error) throw new Error(error.message);
    return data as SupabaseWorkflowResult;
  },

  async decidePurchaseOrder(
    actor: TrustedActor,
    payload: {
      poId: string;
      decision: 'approve' | 'reject';
      reason?: string;
      idempotencyKey?: string;
    }
  ): Promise<SupabaseWorkflowResult> {
    const client = getActorClient(actor);
    const { data, error } = await client.rpc('decide_purchase_order', {
      p_workspace_id: actor.workspaceId,
      p_po_id: payload.poId,
      p_decision: payload.decision,
      p_reason: payload.reason || null,
      p_idempotency_key: payload.idempotencyKey || null,
    });
    if (error) throw new Error(error.message);
    return data as SupabaseWorkflowResult;
  },

  async advancePurchaseOrder(
    actor: TrustedActor,
    payload: {
      poId: string;
      toStatus: 'Dikirim' | 'Selesai';
      idempotencyKey?: string;
    }
  ): Promise<SupabaseWorkflowResult> {
    const client = getActorClient(actor);
    const { data, error } = await client.rpc('advance_purchase_order', {
      p_workspace_id: actor.workspaceId,
      p_po_id: payload.poId,
      p_to_status: payload.toStatus,
      p_idempotency_key: payload.idempotencyKey || null,
    });
    if (error) throw new Error(error.message);
    return data as SupabaseWorkflowResult;
  },

  // 2. Budget Revisions
  async createBudgetRevision(
    actor: TrustedActor,
    payload: {
      projectId: string;
      title: string;
      divisionName: string;
      originalAmount: number;
      proposedAmount: number;
      justification?: string;
      idempotencyKey?: string;
    }
  ): Promise<SupabaseWorkflowResult> {
    const client = getActorClient(actor);
    const { data, error } = await client.rpc('create_budget_revision', {
      p_workspace_id: actor.workspaceId,
      p_project_id: payload.projectId,
      p_title: payload.title,
      p_division_name: payload.divisionName,
      p_original_amount: Math.round(payload.originalAmount),
      p_proposed_amount: Math.round(payload.proposedAmount),
      p_justification: payload.justification || '',
      p_idempotency_key: payload.idempotencyKey || null,
    });
    if (error) throw new Error(error.message);
    return data as SupabaseWorkflowResult;
  },

  async decideBudgetRevision(
    actor: TrustedActor,
    payload: {
      revId: string;
      decision: 'approve' | 'reject';
      reason?: string;
      idempotencyKey?: string;
    }
  ): Promise<SupabaseWorkflowResult> {
    const client = getActorClient(actor);
    const { data, error } = await client.rpc('decide_budget_revision', {
      p_workspace_id: actor.workspaceId,
      p_revision_id: payload.revId,
      p_decision: payload.decision,
      p_rejection_reason: payload.reason || null,
      p_idempotency_key: payload.idempotencyKey || null,
    });
    if (error) throw new Error(error.message);
    return data as SupabaseWorkflowResult;
  },

  // 3. Stock Adjustments
  async createStockAdjustment(
    actor: TrustedActor,
    payload: {
      materialId: string;
      physicalStock: number;
      reason: string;
      projectId?: string;
      evidenceRef?: string;
      idempotencyKey?: string;
    }
  ): Promise<SupabaseWorkflowResult> {
    const client = getActorClient(actor);
    const { data, error } = await client.rpc('create_stock_adjustment', {
      p_workspace_id: actor.workspaceId,
      p_material_id: payload.materialId,
      p_physical_stock: Math.round(payload.physicalStock),
      p_reason: payload.reason,
      p_project_id: payload.projectId || null,
      p_evidence_ref: payload.evidenceRef || '',
      p_idempotency_key: payload.idempotencyKey || null,
    });
    if (error) throw new Error(error.message);
    return data as SupabaseWorkflowResult;
  },

  async decideStockAdjustment(
    actor: TrustedActor,
    payload: {
      adjId: string;
      decision: 'approve' | 'reject';
      reason?: string;
      idempotencyKey?: string;
    }
  ): Promise<SupabaseWorkflowResult> {
    const client = getActorClient(actor);
    const { data, error } = await client.rpc('decide_stock_adjustment', {
      p_workspace_id: actor.workspaceId,
      p_adjustment_id: payload.adjId,
      p_decision: payload.decision,
      p_rejection_reason: payload.reason || null,
      p_idempotency_key: payload.idempotencyKey || null,
    });
    if (error) throw new Error(error.message);
    return data as SupabaseWorkflowResult;
  },

  // 4. Stock Mutations
  async recordStockMutation(
    actor: TrustedActor,
    payload: {
      materialId: string;
      type: 'Masuk' | 'Keluar';
      quantity: number;
      referenceNo: string;
      projectId?: string;
      handler?: string;
      idempotencyKey?: string;
    }
  ): Promise<SupabaseWorkflowResult> {
    const client = getActorClient(actor);
    const { data, error } = await client.rpc('record_stock_mutation', {
      p_workspace_id: actor.workspaceId,
      p_material_id: payload.materialId,
      p_type: payload.type,
      p_quantity: payload.quantity,
      p_reference_no: payload.referenceNo,
      p_project_id: payload.projectId || null,
      p_handler: payload.handler || actor.name,
      p_idempotency_key: payload.idempotencyKey || null,
    });
    if (error) throw new Error(error.message);
    return data as SupabaseWorkflowResult;
  },

  // 5. Petty Cash
  async createPettyCash(
    actor: TrustedActor,
    payload: {
      projectId: string;
      amount: number;
      category: string;
      purpose: string;
      receiptPath?: string;
      idempotencyKey?: string;
    }
  ): Promise<SupabaseWorkflowResult> {
    const client = getActorClient(actor);
    const { data, error } = await client.rpc('create_petty_cash', {
      p_workspace_id: actor.workspaceId,
      p_project_id: payload.projectId,
      p_amount: Math.round(payload.amount),
      p_category: payload.category,
      p_purpose: payload.purpose,
      p_receipt_path: payload.receiptPath || null,
      p_idempotency_key: payload.idempotencyKey || null,
    });
    if (error) throw new Error(error.message);
    return data as SupabaseWorkflowResult;
  },

  async decidePettyCash(
    actor: TrustedActor,
    payload: {
      pettyCashId: string;
      decision: 'approve' | 'reject';
      reason?: string;
      idempotencyKey?: string;
    }
  ): Promise<SupabaseWorkflowResult> {
    const client = getActorClient(actor);
    const { data, error } = await client.rpc('decide_petty_cash', {
      p_workspace_id: actor.workspaceId,
      p_petty_cash_id: payload.pettyCashId,
      p_decision: payload.decision,
      p_reason: payload.reason || null,
      p_idempotency_key: payload.idempotencyKey || null,
    });
    if (error) throw new Error(error.message);
    return data as SupabaseWorkflowResult;
  },

  async disbursePettyCash(
    actor: TrustedActor,
    payload: {
      pettyCashId: string;
      idempotencyKey?: string;
    }
  ): Promise<SupabaseWorkflowResult> {
    const client = getActorClient(actor);
    const { data, error } = await client.rpc('disburse_petty_cash', {
      p_workspace_id: actor.workspaceId,
      p_petty_cash_id: payload.pettyCashId,
      p_idempotency_key: payload.idempotencyKey || null,
    });
    if (error) throw new Error(error.message);
    return data as SupabaseWorkflowResult;
  },

  // 6. Field Reports
  async createFieldReport(
    actor: TrustedActor,
    payload: {
      projectId: string;
      reportDate: string;
      weatherMorning?: string;
      weatherAfternoon?: string;
      workingHours?: number;
      workforce?: any[];
      completedWorks?: any[];
      materialsUsed?: any[];
      equipmentUsed?: any[];
      blockers?: string;
      idempotencyKey?: string;
    }
  ): Promise<SupabaseWorkflowResult> {
    const client = getActorClient(actor);
    const { data, error } = await client.rpc('create_field_report', {
      p_workspace_id: actor.workspaceId,
      p_project_id: payload.projectId,
      p_report_date: payload.reportDate,
      p_weather_morning: payload.weatherMorning || 'Cerah',
      p_weather_afternoon: payload.weatherAfternoon || 'Cerah',
      p_working_hours: payload.workingHours ?? 8,
      p_workforce: payload.workforce || [],
      p_completed_works: payload.completedWorks || [],
      p_materials_used: payload.materialsUsed || [],
      p_equipment_used: payload.equipmentUsed || [],
      p_blockers: payload.blockers || null,
      p_idempotency_key: payload.idempotencyKey || null,
    });
    if (error) throw new Error(error.message);
    return data as SupabaseWorkflowResult;
  },

  async verifyFieldReport(
    actor: TrustedActor,
    payload: { reportId: string; idempotencyKey?: string }
  ): Promise<SupabaseWorkflowResult> {
    const client = getActorClient(actor);
    const { data, error } = await client.rpc('verify_field_report', {
      p_workspace_id: actor.workspaceId,
      p_report_id: payload.reportId,
      p_idempotency_key: payload.idempotencyKey || null,
    });
    if (error) throw new Error(error.message);
    return data as SupabaseWorkflowResult;
  },

  async approveFieldReport(
    actor: TrustedActor,
    payload: { reportId: string; idempotencyKey?: string }
  ): Promise<SupabaseWorkflowResult> {
    const client = getActorClient(actor);
    const { data, error } = await client.rpc('approve_field_report', {
      p_workspace_id: actor.workspaceId,
      p_report_id: payload.reportId,
      p_idempotency_key: payload.idempotencyKey || null,
    });
    if (error) throw new Error(error.message);
    return data as SupabaseWorkflowResult;
  },

  async reviseFieldReport(
    actor: TrustedActor,
    payload: { reportId: string; reviewerNotes: string; idempotencyKey?: string }
  ): Promise<SupabaseWorkflowResult> {
    const client = getActorClient(actor);
    const { data, error } = await client.rpc('revise_field_report', {
      p_workspace_id: actor.workspaceId,
      p_report_id: payload.reportId,
      p_reviewer_notes: payload.reviewerNotes,
      p_idempotency_key: payload.idempotencyKey || null,
    });
    if (error) throw new Error(error.message);
    return data as SupabaseWorkflowResult;
  },

  // 7. Milestone Sign-off
  async signOffMilestone(
    actor: TrustedActor,
    payload: { milestoneId: string; bastRef: string; notes?: string; idempotencyKey?: string }
  ): Promise<SupabaseWorkflowResult> {
    const client = getActorClient(actor);
    const { data, error } = await client.rpc('sign_off_milestone', {
      p_workspace_id: actor.workspaceId,
      p_milestone_id: payload.milestoneId,
      p_bast_ref: payload.bastRef,
      p_notes: payload.notes || null,
      p_idempotency_key: payload.idempotencyKey || null,
    });
    if (error) throw new Error(error.message);
    return data as SupabaseWorkflowResult;
  },

  // 8. Document Number Generator
  async generateDocumentNumber(
    actor: TrustedActor,
    type: 'PO' | 'ADD-REV' | 'LHP' | 'KAS' | 'ADJ',
    projectCodeOrAbbr = 'IND',
    year?: string | number
  ): Promise<string> {
    const yr = Number(year) || new Date().getFullYear();
    const cleanCode = (projectCodeOrAbbr || 'IND').replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'IND';

    const { data: existing } = await supabaseAdmin
      .from('doc_counters')
      .select('last_number')
      .eq('workspace_id', actor.workspaceId)
      .eq('year', yr)
      .eq('doc_type', type)
      .maybeSingle();

    const nextNum = (existing?.last_number || 0) + 1;

    const { error: upsertErr } = await supabaseAdmin
      .from('doc_counters')
      .upsert({
        workspace_id: actor.workspaceId,
        year: yr,
        doc_type: type,
        last_number: nextNum,
        updated_at: new Date().toISOString(),
      });

    if (upsertErr) throw upsertErr;

    const pad = (n: number, width: number) => String(n).padStart(width, '0');
    if (type === 'PO') return `PO-${yr}-${cleanCode}-${pad(nextNum, 4)}`;
    if (type === 'ADD-REV') return `ADD-REV-${pad(nextNum, 2)}/${cleanCode}/${yr}`;
    if (type === 'LHP') return `LHP-${yr}-${pad(nextNum, 4)}`;
    if (type === 'KAS') return `KAS-${cleanCode}-${yr}-${pad(nextNum, 4)}`;
    return `ADJ-${cleanCode}-${yr}-${pad(nextNum, 4)}`;
  },
};
