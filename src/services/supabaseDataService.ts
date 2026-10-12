/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Supabase Data Service
 * Client-side data provider directly querying Supabase PostgreSQL tables & Realtime channels.
 * Provides transparent drop-in compatibility for Indotek Pro enterprise domain entities.
 */

import { supabase } from '../lib/supabase';
import {
  Project,
  PurchaseOrder,
  MaterialItem,
  FieldReport,
  StockMutation,
  NotificationItem,
  ProjectActivity,
  TeamMember,
  AuditLogEntry,
  BudgetRevision,
  PettyCashEntry,
  StockAdjustment,
  BudgetLine,
  Milestone,
  WBSItem,
  BudgetVersion,
  AppRole,
} from '../types';
import { DB_ROLE_TO_APP_ROLE } from '../types/rbac';

export const DEFAULT_WORKSPACE_UUID = '5afb9797-5b33-48e6-ab33-e0c84d7c25f9';
export const DEFAULT_WORKSPACE_SLUG = 'indotek-jkt';

let cachedWorkspaceId = DEFAULT_WORKSPACE_UUID;

export function resolveWorkspaceId(wsId?: string): string {
  if (!wsId || wsId === DEFAULT_WORKSPACE_SLUG) {
    return cachedWorkspaceId;
  }
  // If it's a UUID, return directly
  if (wsId.includes('-') && wsId.length === 36) {
    cachedWorkspaceId = wsId;
    return wsId;
  }
  return cachedWorkspaceId;
}

// ---------------------------------------------------------------------------
// Entity Mappers: snake_case (Postgres) -> camelCase (TypeScript)
// ---------------------------------------------------------------------------

export function mapProject(row: any): Project {
  return {
    id: row.legacy_id || row.id,
    workspaceId: row.workspace_id,
    code: row.code,
    name: row.name,
    client: row.client || '',
    category: row.category || 'Komersial',
    location: row.location || '',
    projectManager: row.project_manager || '',
    siteEngineer: row.site_engineer || '',
    contractValue: Number(row.contract_value) || 0,
    approvedBudget: Number(row.approved_budget) || 0,
    actualCost: Number(row.actual_cost) || 0,
    startDate: row.start_date || '',
    targetEndDate: row.target_end_date || '',
    progressActual: Number(row.progress_actual) || 0,
    progressPlanned: Number(row.progress_planned) || 0,
    status: row.status || 'Pra-Konstruksi',
    scheduleStatus: row.schedule_status || 'Tepat Waktu',
    image: row.image_url || undefined,
    description: row.description || '',
    totalMilestones: row.total_milestones || 0,
    completedMilestones: row.completed_milestones || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapMaterial(row: any): MaterialItem {
  return {
    id: row.legacy_id || row.id,
    workspaceId: row.workspace_id,
    code: row.code,
    name: row.name,
    specification: row.specification || '',
    category: row.category,
    unit: row.unit,
    currentStock: Number(row.current_stock) ?? 0,
    minStock: Number(row.min_stock) ?? 0,
    allocatedProject: row.allocated_project_name || 'Semua Proyek',
    allocatedProjectId: row.allocated_project_id || undefined,
    warehouseLocation: row.warehouse_location || '',
    primarySupplier: row.primary_supplier || '',
    unitPrice: Number(row.unit_price) || 0,
    lastRestocked: row.last_restocked || '',
    status: row.status || 'Aman',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPurchaseOrder(row: any): PurchaseOrder {
  return {
    id: row.legacy_id || row.id,
    workspaceId: row.workspace_id,
    poNumber: row.po_number,
    sppNumber: row.spp_number || `SPP-${row.po_number || '001'}`,
    projectId: row.projects?.legacy_id || row.project_id,
    projectName: row.projects?.name || '',
    supplierName: row.supplier_name,
    itemDescription: row.item_description || '',
    quantitySummary: row.quantity_summary || '',
    totalCost: Number(row.total_cost) || 0,
    requestDate: row.created_at,
    targetDeliveryDate: row.target_delivery_date || row.created_at,
    status: row.status || 'Menunggu',
    requester: row.requester_name || 'Procurement',
    requesterUid: row.requester_id || 'usr',
    approvedBy: row.approved_by_name || undefined,
    approvedByUid: row.approved_by || undefined,
    approvedAt: row.approved_at || undefined,
    rejectionReason: row.rejection_reason || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapBudgetRevision(row: any): BudgetRevision {
  return {
    id: row.legacy_id || row.id,
    workspaceId: row.workspace_id,
    revisionNumber: row.revision_number,
    projectId: row.projects?.legacy_id || row.project_id,
    projectName: row.projects?.name || '',
    title: row.title,
    divisionName: row.division_name,
    originalAmount: Number(row.original_amount) || 0,
    proposedAmount: Number(row.proposed_amount) || 0,
    varianceAmount: Number(row.variance_amount) || 0,
    status: row.status || 'Menunggu',
    justification: row.justification || '',
    submittedBy: row.submitted_by_name || 'Estimator',
    submittedByUid: row.submitted_by || 'usr',
    submittedAt: row.submitted_at || row.created_at,
    reviewedBy: row.reviewed_by_name || undefined,
    reviewedByUid: row.reviewed_by || undefined,
    reviewedAt: row.reviewed_at || undefined,
    rejectionReason: row.rejection_reason || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPettyCash(row: any): PettyCashEntry {
  return {
    id: row.legacy_id || row.id,
    workspaceId: row.workspace_id,
    pettyCashNo: row.petty_cash_no,
    projectId: row.projects?.legacy_id || row.project_id,
    projectName: row.projects?.name || '',
    amount: Number(row.amount) || 0,
    category: row.category,
    purpose: row.purpose,
    receiptProof: row.receipt_path || '',
    status: row.status || 'Menunggu',
    requester: row.requester_name || 'Site Manager',
    requesterUid: row.requester_id || 'usr',
    submittedAt: row.submitted_at || row.created_at,
    reviewedBy: row.reviewed_by_name || undefined,
    reviewedByUid: row.reviewed_by || undefined,
    reviewedAt: row.reviewed_at || undefined,
    disbursedAt: row.disbursed_at || undefined,
    rejectionReason: row.rejection_reason || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapFieldReport(row: any): FieldReport {
  return {
    id: row.legacy_id || row.id,
    workspaceId: row.workspace_id,
    reportNumber: row.report_number,
    projectId: row.projects?.legacy_id || row.project_id,
    projectName: row.projects?.name || '',
    date: row.report_date,
    weatherMorning: row.weather_morning || 'Cerah',
    weatherAfternoon: row.weather_afternoon || 'Cerah',
    workingHours: Number(row.working_hours) || 8,
    status: row.status || 'Draft',
    siteSupervisor: row.site_supervisor_name || 'Site Supervisor',
    siteSupervisorUid: row.site_supervisor_id || 'usr',
    workforce: row.workforce || [],
    completedWorks: row.completed_works || [],
    materialsUsed: row.materials_used || [],
    equipmentUsed: row.equipment_used || [],
    blockers: row.blockers || '',
    photos: row.photos || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapMilestone(row: any): Milestone {
  return {
    id: row.legacy_id || row.id,
    workspaceId: row.workspace_id,
    projectId: row.projects?.legacy_id || row.project_id,
    title: row.title,
    wbsCode: row.wbs_code || '',
    plannedDate: row.planned_date || '',
    actualDate: row.actual_date || undefined,
    progress: Number(row.progress) || 0,
    status: row.status || 'Menunggu',
    weightPercent: Number(row.weight_percent) || 0,
    signedOffBy: row.signed_off_by ? 'Tervalidasi' : undefined,
    signedOffByUid: row.signed_off_by || undefined,
    signedOffAt: row.signed_off_at || undefined,
    bastRef: row.bast_ref || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapBudgetLine(row: any): BudgetLine {
  return {
    id: row.legacy_id || row.id,
    workspaceId: row.workspace_id,
    projectId: row.projects?.legacy_id || row.project_id,
    code: row.code,
    divisionName: row.division_name,
    category: row.category,
    plannedAmount: Number(row.planned_amount) || 0,
    actualAmount: Number(row.actual_amount) || 0,
    varianceAmount: Number(row.variance_amount) || 0,
    variancePercent: Number(row.variance_percent) || 0,
    unit: row.unit || '',
    volume: Number(row.volume) || 0,
    unitRate: Number(row.unit_rate) || 0,
    status: row.status || 'Aman',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapWbsItem(row: any): WBSItem {
  return {
    id: row.legacy_id || row.id,
    workspaceId: row.workspace_id,
    projectId: row.projects?.legacy_id || row.project_id,
    code: row.code,
    name: row.name,
    category: row.category || '',
    durationDays: Number(row.duration_days) || 0,
    startDate: row.start_date || '',
    endDate: row.end_date || '',
    plannedProgress: Number(row.planned_progress) || 0,
    actualProgress: Number(row.actual_progress) || 0,
    status: row.status || 'Belum Mulai',
    criticalPath: Boolean(row.critical_path),
    assignedTeam: row.assigned_team || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapStockMutation(row: any): StockMutation {
  return {
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
  };
}

export function mapStockAdjustment(row: any): StockAdjustment {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    adjustmentNo: row.adjustment_no,
    materialId: row.materials?.legacy_id || row.material_id,
    materialName: row.materials?.name || 'Material',
    materialCode: row.materials?.code || '',
    projectId: row.projects?.legacy_id || row.project_id || '',
    projectName: row.projects?.name || '',
    previousStock: Number(row.previous_stock) || 0,
    physicalStock: Number(row.physical_stock) || 0,
    varianceQuantity: Number(row.variance_quantity) || 0,
    unit: row.materials?.unit || 'unit',
    reason: row.reason,
    evidenceRef: row.evidence_ref || '',
    status: row.status || 'Menunggu',
    submittedBy: row.submitted_by_name || 'Warehouse Staff',
    submittedByUid: row.submitted_by || 'usr',
    submittedAt: row.submitted_at || row.created_at,
    reviewedBy: row.reviewed_by_name || undefined,
    reviewedByUid: row.reviewed_by || undefined,
    reviewedAt: row.reviewed_at || undefined,
    rejectionReason: row.rejection_reason || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapNotification(row: any): NotificationItem {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    message: row.message,
    type: row.type || 'info',
    timestamp: row.created_at,
    read: Boolean(row.read),
    targetScreen: row.target_screen || undefined,
    targetRoles: row.target_roles || undefined,
    projectId: row.project_id || undefined,
  };
}

export function mapAuditLog(row: any): AuditLogEntry {
  const dbRole = row.actor_role as string;
  const mappedRole = DB_ROLE_TO_APP_ROLE[dbRole] || (dbRole as AppRole);
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    action: row.action,
    actor: {
      uid: row.actor_id || 'usr',
      name: row.actor_name || 'User',
      email: row.actor_email || '',
      role: mappedRole,
    },
    recordType: row.record_type,
    recordId: row.record_id || '',
    details: row.details || '',
    timestamp: row.created_at,
    correlationId: row.correlation_id || `tx-${row.id}`,
    projectId: row.projects?.legacy_id || row.project_id || undefined,
    projectName: row.projects?.name || undefined,
  };
}

export function mapTeamMember(row: any): TeamMember {
  const profile = row.profiles || {};
  const dbRole = row.role as string;
  const mappedRole = DB_ROLE_TO_APP_ROLE[dbRole] || (dbRole as AppRole);
  return {
    id: row.user_id,
    workspaceId: row.workspace_id,
    name: profile.full_name || (profile.email ? profile.email.split('@')[0] : 'Anggota Tim'),
    email: profile.email || '',
    phone: profile.phone || '-',
    role: mappedRole,
    department: row.department || 'Operasional',
    nip: profile.nip || 'IND-001',
    status: row.status || 'Aktif',
    assignedProjects: row.all_projects ? ['*'] : [],
    lastActive: row.last_active || row.updated_at || row.created_at,
    permissions: {
      canViewBudget: true,
      canEditBudget: mappedRole === 'Owner / Director' || mappedRole === 'Quantity Surveyor / Estimator',
      canApprovePO: mappedRole === 'Owner / Director',
      canCreateFieldReport: true,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Supabase Data Service Client
// ---------------------------------------------------------------------------

export const supabaseDataService = {
  // 1. Projects
  async getProjects(wsId?: string): Promise<Project[]> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[Supabase getProjects Notice]:', error.message);
      return [];
    }
    return (data || []).map(mapProject);
  },

  subscribeProjects(callback: (items: Project[]) => void, wsId?: string): () => void {
    const ws = resolveWorkspaceId(wsId);
    this.getProjects(ws).then(callback);

    const channel = supabase
      .channel(`public:projects:${ws}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        this.getProjects(ws).then(callback);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  // 2. Project Subcollections (Milestones, Budget Lines, WBS, Budget Versions)
  async getProjectSubcollections(projectId: string, wsId?: string) {
    const ws = resolveWorkspaceId(wsId);

    // Resolve project UUID if legacy id
    let pid = projectId;
    const { data: pRow } = await supabase
      .from('projects')
      .select('id, legacy_id')
      .eq('workspace_id', ws)
      .or(`id.eq.${projectId.length === 36 ? projectId : '00000000-0000-0000-0000-000000000000'},legacy_id.eq.${projectId}`)
      .maybeSingle();

    if (pRow) {
      pid = pRow.id;
    }

    const [linesRes, msRes, wbsRes, verRes] = await Promise.all([
      supabase.from('budget_lines').select('*').eq('workspace_id', ws).eq('project_id', pid),
      supabase.from('milestones').select('*').eq('workspace_id', ws).eq('project_id', pid).order('planned_date', { ascending: true }),
      supabase.from('wbs_items').select('*').eq('workspace_id', ws).eq('project_id', pid).order('code', { ascending: true }),
      supabase.from('budget_versions').select('*').eq('workspace_id', ws).eq('project_id', pid).order('created_at', { ascending: true }),
    ]);

    return {
      budgetLines: (linesRes.data || []).map(mapBudgetLine),
      milestones: (msRes.data || []).map(mapMilestone),
      wbsList: (wbsRes.data || []).map(mapWbsItem),
      budgetVersions: (verRes.data || []).map((v: any) => ({
        id: v.legacy_id || v.id,
        projectId: v.project_id,
        versionNumber: v.version_number,
        effectiveDate: v.effective_date,
        approvedBy: v.approved_by_name || 'Direksi',
        approvedByUid: v.approved_by,
        totalPlannedAmount: Number(v.total_planned_amount) || 0,
        description: v.description || '',
        divisionAmounts: v.division_amounts || {},
        createdAt: v.created_at,
      })),
    };
  },

  // 3. Materials & Inventory
  async getMaterials(wsId?: string): Promise<MaterialItem[]> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .eq('workspace_id', ws)
      .order('code', { ascending: true });

    if (error) {
      console.warn('[Supabase getMaterials Notice]:', error.message);
      return [];
    }
    return (data || []).map(mapMaterial);
  },

  subscribeMaterials(callback: (items: MaterialItem[]) => void, wsId?: string): () => void {
    const ws = resolveWorkspaceId(wsId);
    this.getMaterials(ws).then(callback);

    const channel = supabase
      .channel(`public:materials:${ws}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'materials' }, () => {
        this.getMaterials(ws).then(callback);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  // 4. Purchase Orders
  async getPurchaseOrders(wsId?: string): Promise<PurchaseOrder[]> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*, projects(name, legacy_id)')
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[Supabase getPurchaseOrders Notice]:', error.message);
      return [];
    }
    return (data || []).map(mapPurchaseOrder);
  },

  subscribePurchaseOrders(callback: (items: PurchaseOrder[]) => void, wsId?: string): () => void {
    const ws = resolveWorkspaceId(wsId);
    this.getPurchaseOrders(ws).then(callback);

    const channel = supabase
      .channel(`public:purchase_orders:${ws}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders' }, () => {
        this.getPurchaseOrders(ws).then(callback);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  // 5. Budget Revisions
  async getBudgetRevisions(wsId?: string): Promise<BudgetRevision[]> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase
      .from('budget_revisions')
      .select('*, projects(name, legacy_id)')
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[Supabase getBudgetRevisions Notice]:', error.message);
      return [];
    }
    return (data || []).map(mapBudgetRevision);
  },

  subscribeBudgetRevisions(callback: (items: BudgetRevision[]) => void, wsId?: string): () => void {
    const ws = resolveWorkspaceId(wsId);
    this.getBudgetRevisions(ws).then(callback);

    const channel = supabase
      .channel(`public:budget_revisions:${ws}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_revisions' }, () => {
        this.getBudgetRevisions(ws).then(callback);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  // 6. Petty Cash
  async getPettyCash(wsId?: string): Promise<PettyCashEntry[]> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase
      .from('petty_cash')
      .select('*, projects(name, legacy_id)')
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[Supabase getPettyCash Notice]:', error.message);
      return [];
    }
    return (data || []).map(mapPettyCash);
  },

  subscribePettyCash(callback: (items: PettyCashEntry[]) => void, wsId?: string): () => void {
    const ws = resolveWorkspaceId(wsId);
    this.getPettyCash(ws).then(callback);

    const channel = supabase
      .channel(`public:petty_cash:${ws}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'petty_cash' }, () => {
        this.getPettyCash(ws).then(callback);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  // 7. Field Reports
  async getFieldReports(wsId?: string): Promise<FieldReport[]> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase
      .from('field_reports')
      .select('*, projects(name, legacy_id)')
      .eq('workspace_id', ws)
      .order('report_date', { ascending: false });

    if (error) {
      console.warn('[Supabase getFieldReports Notice]:', error.message);
      return [];
    }
    return (data || []).map(mapFieldReport);
  },

  subscribeFieldReports(callback: (items: FieldReport[]) => void, wsId?: string): () => void {
    const ws = resolveWorkspaceId(wsId);
    this.getFieldReports(ws).then(callback);

    const channel = supabase
      .channel(`public:field_reports:${ws}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'field_reports' }, () => {
        this.getFieldReports(ws).then(callback);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  // 8. Stock Adjustments & Mutations
  async getStockMutations(wsId?: string): Promise<StockMutation[]> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase
      .from('stock_mutations')
      .select('*, materials(name, legacy_id)')
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[Supabase getStockMutations Notice]:', error.message);
      return [];
    }
    return (data || []).map(mapStockMutation);
  },

  async getStockAdjustments(wsId?: string): Promise<StockAdjustment[]> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase
      .from('stock_adjustments')
      .select('*, materials(name, legacy_id)')
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[Supabase getStockAdjustments Notice]:', error.message);
      return [];
    }
    return (data || []).map(mapStockAdjustment);
  },

  subscribeStockAdjustments(callback: (items: StockAdjustment[]) => void, wsId?: string): () => void {
    const ws = resolveWorkspaceId(wsId);
    this.getStockAdjustments(ws).then(callback);

    const channel = supabase
      .channel(`public:stock_adjustments:${ws}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_adjustments' }, () => {
        this.getStockAdjustments(ws).then(callback);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  // 9. Team Members
  async getTeamMembers(wsId?: string): Promise<TeamMember[]> {
    const ws = resolveWorkspaceId(wsId);
    const { data: members, error } = await supabase
      .from('workspace_members')
      .select('*')
      .eq('workspace_id', ws);

    if (error || !members) {
      console.warn('[Supabase getTeamMembers Notice]:', error?.message);
      return [];
    }

    const userIds = members.map((m: any) => m.user_id);
    const { data: profiles } = userIds.length > 0
      ? await supabase.from('profiles').select('*').in('id', userIds)
      : { data: [] };

    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
    return members.map((m: any) => mapTeamMember({ ...m, profiles: profileMap.get(m.user_id) || {} }));
  },

  subscribeTeamMembers(callback: (items: TeamMember[]) => void, wsId?: string): () => void {
    const ws = resolveWorkspaceId(wsId);
    this.getTeamMembers(ws).then(callback);

    const channel = supabase
      .channel(`public:workspace_members:${ws}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_members' }, () => {
        this.getTeamMembers(ws).then(callback);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  // 10. Notifications
  async getNotifications(wsId?: string): Promise<NotificationItem[]> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[Supabase getNotifications Notice]:', error.message);
      return [];
    }
    return (data || []).map(mapNotification);
  },

  subscribeNotifications(callback: (items: NotificationItem[]) => void, wsId?: string): () => void {
    const ws = resolveWorkspaceId(wsId);
    this.getNotifications(ws).then(callback);

    const channel = supabase
      .channel(`public:notifications:${ws}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        this.getNotifications(ws).then(callback);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  // 11. Audit Logs
  async getAuditLogs(wsId?: string): Promise<AuditLogEntry[]> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.warn('[Supabase getAuditLogs Notice]:', error.message);
      return [];
    }
    return (data || []).map(mapAuditLog);
  },

  subscribeAuditLogs(callback: (items: AuditLogEntry[]) => void, wsId?: string): () => void {
    const ws = resolveWorkspaceId(wsId);
    this.getAuditLogs(ws).then(callback);

    const channel = supabase
      .channel(`public:audit_logs:${ws}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, () => {
        this.getAuditLogs(ws).then(callback);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  // 12. Corporate Settings
  async getSettings(wsId?: string) {
    const ws = resolveWorkspaceId(wsId);
    const { data } = await supabase
      .from('workspaces')
      .select('name, settings, updated_at')
      .eq('id', ws)
      .maybeSingle();

    return {
      companyName: data?.name || 'PT Indotek Karya Nusantara',
      companyAddress: data?.settings?.companyAddress || 'Wisma Indotek Lt. 8, Jl. TB Simatupang No. 18, Jakarta Selatan',
      taxNumberNPWP: data?.settings?.taxNumberNPWP || '01.234.567.8-012.000',
      tableDensity: data?.settings?.tableDensity || 'comfortable',
      currency: data?.settings?.currency || 'IDR',
      dateFormat: data?.settings?.dateFormat || 'DD/MM/YYYY',
      alertScheduleDeviation: data?.settings?.alertScheduleDeviation ?? true,
      alertCriticalStock: data?.settings?.alertCriticalStock ?? true,
      alertHighValuePO: data?.settings?.alertHighValuePO ?? true,
      language: data?.settings?.language || 'id',
      lastUpdated: data?.updated_at || new Date().toISOString(),
    };
  },

  async saveSettings(settings: any, wsId?: string) {
    const ws = resolveWorkspaceId(wsId);
    await supabase
      .from('workspaces')
      .update({
        name: settings.companyName,
        settings: {
          companyAddress: settings.companyAddress || settings.officeAddress,
          taxNumberNPWP: settings.taxNumberNPWP || settings.companyTaxId,
          tableDensity: settings.tableDensity,
          currency: settings.currency,
          dateFormat: settings.dateFormat,
          alertScheduleDeviation: settings.alertScheduleDeviation,
          alertCriticalStock: settings.alertCriticalStock,
          alertHighValuePO: settings.alertHighValuePO,
          language: settings.language,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', ws);
  },

  async logAuditEvent(logData: any, wsId?: string): Promise<string> {
    const ws = resolveWorkspaceId(wsId);
    const id = `aud-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    try {
      await supabase.from('audit_logs').insert({
        workspace_id: ws,
        action: logData.action,
        actor_id: logData.actor?.uid || null,
        actor_name: logData.actor?.name || 'User',
        actor_role: logData.actor?.role || 'owner',
        record_type: logData.recordType || 'system',
        record_id: logData.recordId || null,
        details: logData.details || '',
        previous_value: logData.previousValue ? { val: logData.previousValue } : null,
        new_value: logData.newValue ? { val: logData.newValue } : null,
        metadata: logData.metadata || {},
        created_at: now,
      });
    } catch (e) {
      console.warn('[Supabase logAuditEvent Notice]:', e);
    }
    return id;
  },
};

