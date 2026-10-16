/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Supabase Data Service
 * Client-side data provider directly querying Supabase PostgreSQL tables & Realtime channels.
 * Provides transparent drop-in compatibility for Indotek Pro enterprise domain entities.
 *
 * ATURAN PENULISAN DATA:
 * - Klien TIDAK boleh menulis langsung kolom uang (planned_amount, actual_amount, contract_value,
 *   approved_budget, actual_cost), status workflow, atau nilai turunan (variance_*, progress_*,
 *   completed_milestones, total_milestones, updated_at).
 * - Semua mutasi sensitif wajib lewat RPC security definer.
 * - Setiap error Supabase wajib dilempar (throw), bukan console.warn lalu lanjut.
 */

import { supabase } from '../lib/supabase';
import { getWitaDateISO } from '../utils/formatters';
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
  ResourcePrice,
  ResourceType,
  AHSPTemplate,
  AHSPComponent,
  AHSPUnitPriceCalculation,
  BOQItem,
  BOQSummary,
  DivisionCategory,
  PaymentTerm,
  PaymentSchedule,
  AttachmentItem,
  AttachmentRecordType,
} from '../types';
import { DB_ROLE_TO_APP_ROLE } from '../types/rbac';

export interface ActorInfo {
  actorName: string;
  actorRole: AppRole;
}

export interface AppSettings {
  companyName: string;
  companyAddress: string;
  taxNumberNPWP: string;
  tableDensity: 'compact' | 'comfortable' | 'spacious';
  currency: string;
  dateFormat: string;
  alertScheduleDeviation: boolean;
  alertCriticalStock: boolean;
  alertHighValuePO: boolean;
  language: string;
  lastUpdated: string;
}

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
    currentStock: Number(row.current_stock) || 0,
    minStock: Number(row.min_stock) || 0,
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

export function mapResourcePrice(row: any): ResourcePrice {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    jenis: row.jenis as ResourceType,
    kode: row.kode,
    uraian: row.uraian,
    satuan: row.satuan,
    harga: Number(row.harga) || 0,
    wilayah: row.wilayah || '',
    berlakuMulai: row.berlaku_mulai || '',
    berlakuSampai: row.berlaku_sampai || null,
    spesifikasi: row.spesifikasi || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAHSPComponent(row: any): AHSPComponent {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    templateId: row.template_id,
    resourceId: row.resource_id || null,
    jenis: row.jenis,
    kodeSumberDaya: row.kode_sumber_daya,
    uraian: row.uraian,
    satuan: row.satuan,
    koefisien: Number(row.koefisien) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAHSPTemplate(row: any): AHSPTemplate {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    kode: row.kode,
    nama: row.nama,
    satuan: row.satuan,
    kategori: row.kategori || 'Umum',
    overheadProfitPct: Number(row.overhead_profit_pct) || 10,
    dasarHukum: row.dasar_hukum || 'Permen PUPR No. 8 Tahun 2023',
    keterangan: row.keterangan || null,
    components: (row.ahsp_components || []).map(mapAHSPComponent),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapBOQItem(row: any): BOQItem {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    parentId: row.parent_id || null,
    ahspId: row.ahsp_id || null,
    divisionCategory: row.division_category as DivisionCategory,
    kode: row.kode,
    uraian: row.uraian,
    satuan: row.satuan,
    volume: Number(row.volume) || 0,
    hargaSatuan: Number(row.harga_satuan) || 0,
    jumlahHarga: Number(row.jumlah_harga) || 0,
    bobotPersen: Number(row.bobot_persen) || 0,
    progresPersen: Number(row.progres_persen) || 0,
    urutan: Number(row.urutan) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

    if (error) throw new Error(`[getProjects] ${error.message}`);
    return (data || []).map(mapProject);
  },

  /** Projects tidak ada di supabase_realtime publication — one-shot fetch, invalidasi setelah mutasi di context. */
  subscribeProjects(callback: (items: Project[]) => void, wsId?: string): () => void {
    const ws = resolveWorkspaceId(wsId);
    this.getProjects(ws).then(callback).catch((err: any) => {
      console.error(`[subscribeProjects] ${err.message}`);
    });
    return () => {}; // no channel to clean up
  },

  // 2. Project Subcollections (Milestones, Budget Lines, WBS, Budget Versions)
  async getProjectSubcollections(projectId: string, wsId?: string) {
    const ws = resolveWorkspaceId(wsId);

    // Resolve project UUID if legacy id
    let pid = projectId;
    const { data: pRow, error: projectLookupError } = await supabase
      .from('projects')
      .select('id, legacy_id')
      .eq('workspace_id', ws)
      .or(`id.eq.${projectId.length === 36 ? projectId : '00000000-0000-0000-0000-000000000000'},legacy_id.eq.${projectId}`)
      .maybeSingle();
    if (projectLookupError) throw new Error(`[getProjectSubcollections/project] ${projectLookupError.message}`);

    if (pRow) {
      pid = pRow.id;
    }

    const [linesRes, msRes, wbsRes, verRes] = await Promise.all([
      supabase.from('budget_lines').select('*').eq('workspace_id', ws).eq('project_id', pid),
      supabase.from('milestones').select('*').eq('workspace_id', ws).eq('project_id', pid).order('planned_date', { ascending: true }),
      supabase.from('wbs_items').select('*').eq('workspace_id', ws).eq('project_id', pid).order('code', { ascending: true }),
      supabase.from('budget_versions').select('*').eq('workspace_id', ws).eq('project_id', pid).order('created_at', { ascending: true }),
    ]);

    if (linesRes.error) throw new Error(`[getBudgetLines] ${linesRes.error.message}`);
    if (msRes.error) throw new Error(`[getMilestones] ${msRes.error.message}`);
    if (wbsRes.error) throw new Error(`[getWbsItems] ${wbsRes.error.message}`);
    if (verRes.error) throw new Error(`[getBudgetVersions] ${verRes.error.message}`);

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

    if (error) throw new Error(`[getMaterials] ${error.message}`);
    return (data || []).map(mapMaterial);
  },

  /** Materials tidak ada di supabase_realtime publication — one-shot fetch. */
  subscribeMaterials(callback: (items: MaterialItem[]) => void, wsId?: string): () => void {
    const ws = resolveWorkspaceId(wsId);
    this.getMaterials(ws).then(callback);
    return () => {};
  },

  // 4. Purchase Orders
  async getPurchaseOrders(wsId?: string): Promise<PurchaseOrder[]> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*, projects(name, legacy_id)')
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`[getPurchaseOrders] ${error.message}`);
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

    if (error) throw new Error(`[getBudgetRevisions] ${error.message}`);
    return (data || []).map(mapBudgetRevision);
  },

  /** budget_revisions tidak ada di supabase_realtime publication — one-shot fetch. */
  subscribeBudgetRevisions(callback: (items: BudgetRevision[]) => void, wsId?: string): () => void {
    const ws = resolveWorkspaceId(wsId);
    this.getBudgetRevisions(ws).then(callback);
    return () => {};
  },

  // 6. Petty Cash
  async getPettyCash(wsId?: string): Promise<PettyCashEntry[]> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase
      .from('petty_cash')
      .select('*, projects(name, legacy_id)')
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`[getPettyCash] ${error.message}`);
    return (data || []).map(mapPettyCash);
  },

  /** petty_cash tidak ada di supabase_realtime publication — one-shot fetch. */
  subscribePettyCash(callback: (items: PettyCashEntry[]) => void, wsId?: string): () => void {
    const ws = resolveWorkspaceId(wsId);
    this.getPettyCash(ws).then(callback);
    return () => {};
  },

  // 7. Field Reports
  async getFieldReports(wsId?: string): Promise<FieldReport[]> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase
      .from('field_reports')
      .select('*, projects(name, legacy_id)')
      .eq('workspace_id', ws)
      .order('report_date', { ascending: false });

    if (error) throw new Error(`[getFieldReports] ${error.message}`);
    return (data || []).map(mapFieldReport);
  },

  /** field_reports tidak ada di supabase_realtime publication — one-shot fetch. */
  subscribeFieldReports(callback: (items: FieldReport[]) => void, wsId?: string): () => void {
    const ws = resolveWorkspaceId(wsId);
    this.getFieldReports(ws).then(callback);
    return () => {};
  },

  // 8. Stock Adjustments & Mutations
  async getStockMutations(wsId?: string): Promise<StockMutation[]> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase
      .from('stock_mutations')
      .select('*, materials(name, legacy_id)')
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`[getStockMutations] ${error.message}`);
    return (data || []).map(mapStockMutation);
  },

  async getStockAdjustments(wsId?: string): Promise<StockAdjustment[]> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase
      .from('stock_adjustments')
      .select('*, materials(name, code, unit, legacy_id)')
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`[getStockAdjustments] ${error.message}`);
    const adjustments = data || [];
    const projectIds = [...new Set(adjustments.map((row) => row.project_id).filter(Boolean))];
    const projectsById = new Map<string, { name: string; legacy_id?: string | null }>();
    if (projectIds.length > 0) {
      const { data: projects, error: projectsError } = await supabase
        .from('projects')
        .select('id, name, legacy_id')
        .in('id', projectIds);
      if (projectsError) throw new Error(`[getStockAdjustments] ${projectsError.message}`);
      for (const project of projects || []) projectsById.set(project.id, project);
    }
    return adjustments.map((row) => mapStockAdjustment({
      ...row,
      projects: row.project_id ? projectsById.get(row.project_id) || null : null,
    }));
  },

  /** stock_adjustments tidak ada di supabase_realtime publication — one-shot fetch. */
  subscribeStockAdjustments(callback: (items: StockAdjustment[]) => void, wsId?: string): () => void {
    const ws = resolveWorkspaceId(wsId);
    this.getStockAdjustments(ws).then(callback);
    return () => {};
  },

  // 9. Team Members
  async getTeamMembers(wsId?: string): Promise<TeamMember[]> {
    const ws = resolveWorkspaceId(wsId);
    const { data: members, error } = await supabase
      .from('workspace_members')
      .select('*')
      .eq('workspace_id', ws);

    if (error) throw new Error(`[getTeamMembers] ${error.message}`);
    if (!members) return [];

    const userIds = members.map((m: any) => m.user_id);
    const { data: profiles, error: profErr } = userIds.length > 0
      ? await supabase.from('profiles').select('*').in('id', userIds)
      : { data: [], error: null };

    if (profErr) throw new Error(`[getTeamMembers/profiles] ${profErr.message}`);

    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
    return members.map((m: any) => mapTeamMember({ ...m, profiles: profileMap.get(m.user_id) || {} }));
  },

  /** workspace_members tidak ada di supabase_realtime publication — one-shot fetch. */
  subscribeTeamMembers(callback: (items: TeamMember[]) => void, wsId?: string): () => void {
    const ws = resolveWorkspaceId(wsId);
    this.getTeamMembers(ws).then(callback);
    return () => {};
  },

  // 10. Notifications
  async getNotifications(wsId?: string): Promise<NotificationItem[]> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`[getNotifications] ${error.message}`);
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

    if (error) throw new Error(`[getAuditLogs] ${error.message}`);
    return (data || []).map(mapAuditLog);
  },

  /** audit_logs tidak ada di supabase_realtime publication — one-shot fetch. */
  subscribeAuditLogs(callback: (items: AuditLogEntry[]) => void, wsId?: string): () => void {
    const ws = resolveWorkspaceId(wsId);
    this.getAuditLogs(ws).then(callback);
    return () => {};
  },

  /** Transform recent audit logs to ProjectActivity format for dashboard */
  async getActivities(limit = 20, wsId?: string): Promise<ProjectActivity[]> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`[getActivities] ${error.message}`);
    
    return (data || []).map((log: any): ProjectActivity => {
      // Map audit action types to activity types
      let type: 'progress' | 'cost' | 'material' | 'report' | 'milestone' = 'progress';
      if (log.action_type?.includes('budget') || log.action_type?.includes('petty_cash')) {
        type = 'cost';
      } else if (log.action_type?.includes('material') || log.action_type?.includes('stock')) {
        type = 'material';
      } else if (log.action_type?.includes('field_report')) {
        type = 'report';
      } else if (log.action_type?.includes('milestone')) {
        type = 'milestone';
      }

      return {
        id: log.id || '',
        workspaceId: log.workspace_id || '',
        projectId: log.project_id || '',
        projectName: log.project_name || 'Unknown Project',
        user: log.performed_by || 'System',
        action: log.description || log.action_type || 'Activity',
        timestamp: log.created_at || new Date().toISOString(),
        type,
        createdAt: log.created_at || new Date().toISOString(),
        updatedAt: log.created_at || new Date().toISOString(),
      };
    });
  },

  // 12. Corporate Settings
  async getSettings(wsId?: string) {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase
      .from('workspaces')
      .select('name, settings, updated_at')
      .eq('id', ws)
      .maybeSingle();

    if (error) throw new Error(`[getSettings] ${error.message}`);

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

  /**
   * Menyimpan pengaturan perusahaan via RPC security definer.
   * Klien tidak boleh menulis updated_at langsung ke tabel workspaces.
   */
  async saveSettings(settings: any, wsId?: string): Promise<void> {
    const ws = resolveWorkspaceId(wsId);
    const { error } = await supabase.rpc('save_workspace_settings', {
      p_workspace_id: ws,
      p_name: settings.companyName || null,
      p_settings: {
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
    });

    if (error) throw new Error(`[saveSettings] ${error.message}`);
  },

  /**
   * Mencatat audit log via RPC security definer.
   * Klien tidak boleh insert langsung ke audit_logs — semua lewat RPC.
   * Kolom previous_value / new_value bertipe text; kirim sebagai string.
   */
  async logAuditEvent(logData: any, wsId?: string): Promise<string> {
    const ws = resolveWorkspaceId(wsId);

    const { data, error } = await supabase.rpc('log_audit_event', {
      p_workspace_id: ws,
      p_action: logData.action,
      p_record_type: logData.recordType || 'system',
      p_record_id: logData.recordId && logData.recordId.length === 36 ? logData.recordId : null,
      p_project_id: logData.projectId && logData.projectId.length === 36 ? logData.projectId : null,
      p_details: logData.details || '',
      p_previous: typeof logData.previousValue === 'string'
        ? logData.previousValue
        : logData.previousValue != null ? JSON.stringify(logData.previousValue) : '',
      p_new: typeof logData.newValue === 'string'
        ? logData.newValue
        : logData.newValue != null ? JSON.stringify(logData.newValue) : '',
      p_metadata: logData.metadata && typeof logData.metadata === 'object' ? logData.metadata : {},
    });

    if (error) throw new Error(`[logAuditEvent] ${error.message}`);
    return String(data || '');
  },

  // ---------------------------------------------------------------------------
  // Write operations: RPC wrappers for client-side workflow calls
  // All write operations use security definer RPCs to enforce authorization
  // ---------------------------------------------------------------------------

  // Projects
  async addProject(
    projectData: Omit<Project, 'id' | 'totalMilestones' | 'completedMilestones'>,
    wsId?: string
  ): Promise<string> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase.rpc('create_project', {
      p_workspace_id: ws,
      p_name: projectData.name,
      p_code: projectData.code,
      p_client: projectData.client,
      p_category: projectData.category,
      p_location: projectData.location,
      p_project_manager: projectData.projectManager,
      p_site_engineer: projectData.siteEngineer,
      p_contract_value: projectData.contractValue,
      p_approved_budget: projectData.approvedBudget,
      p_start_date: projectData.startDate,
      p_target_end_date: projectData.targetEndDate,
      p_status: projectData.status,
      p_image_url: projectData.image || null,
      p_description: projectData.description || '',
    });
    if (error) throw new Error(`[addProject] ${error.message}`);
    if (!data || typeof data !== 'object' || !('id' in data) || typeof data.id !== 'string') {
      throw new Error('[addProject] RPC returned an invalid project result.');
    }
    return data.id;
  },

  async updateProject(
    projectId: string,
    updates: Partial<Project>,
    actorInfo: ActorInfo,
    wsId?: string
  ): Promise<void> {
    const ws = resolveWorkspaceId(wsId);
    const { error } = await supabase.rpc('update_project', {
      p_project_id: projectId,
      p_workspace_id: ws,
      p_updates: updates,
      p_actor_name: actorInfo.actorName,
      p_actor_role: actorInfo.actorRole,
    });
    if (error) throw new Error(`[updateProject] ${error.message}`);
  },

  async addProjectBudgetLine(
    projectId: string,
    lineData: Omit<BudgetLine, 'id'>,
    actorInfo: ActorInfo,
    wsId?: string
  ): Promise<string> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase.rpc('add_budget_line', {
      p_project_id: projectId,
      p_workspace_id: ws,
      p_line_data: lineData,
      p_actor_name: actorInfo.actorName,
      p_actor_role: actorInfo.actorRole,
    });
    if (error) throw new Error(`[addProjectBudgetLine] ${error.message}`);
    return String(data);
  },

  async updateProjectBudgetLine(
    projectId: string,
    lineId: string,
    updates: Partial<BudgetLine>,
    actorInfo: ActorInfo,
    wsId?: string
  ): Promise<void> {
    const ws = resolveWorkspaceId(wsId);
    const { error } = await supabase.rpc('update_budget_line', {
      p_project_id: projectId,
      p_line_id: lineId,
      p_workspace_id: ws,
      p_updates: updates,
      p_actor_name: actorInfo.actorName,
      p_actor_role: actorInfo.actorRole,
    });
    if (error) throw new Error(`[updateProjectBudgetLine] ${error.message}`);
  },

  async signOffProjectMilestone(
    projectId: string,
    milestoneId: string,
    signOffData: { notes?: string; attachments?: string[] },
    actorInfo: ActorInfo,
    wsId?: string
  ): Promise<void> {
    const ws = resolveWorkspaceId(wsId);
    const { error } = await supabase.rpc('sign_off_milestone', {
      p_project_id: projectId,
      p_milestone_id: milestoneId,
      p_workspace_id: ws,
      p_notes: signOffData.notes || '',
      p_attachments: signOffData.attachments || [],
      p_actor_name: actorInfo.actorName,
      p_actor_role: actorInfo.actorRole,
    });
    if (error) throw new Error(`[signOffProjectMilestone] ${error.message}`);
  },

  async updateProjectWBSProgress(
    projectId: string,
    wbsId: string,
    progressPersen: number,
    actorInfo: ActorInfo,
    wsId?: string
  ): Promise<void> {
    const ws = resolveWorkspaceId(wsId);
    const { error } = await supabase.rpc('update_wbs_progress', {
      p_project_id: projectId,
      p_wbs_id: wbsId,
      p_workspace_id: ws,
      p_progress_persen: progressPersen,
      p_actor_name: actorInfo.actorName,
      p_actor_role: actorInfo.actorRole,
    });
    if (error) throw new Error(`[updateProjectWBSProgress] ${error.message}`);
  },

  // Team
  // DEPRECATED: Use /api/invite-member endpoint instead
  async addTeamMember(
    memberData: Omit<TeamMember, 'id' | 'lastActive' | 'permissions'>,
    actorInfo: ActorInfo,
    wsId?: string
  ): Promise<string> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase.rpc('add_team_member', {
      p_workspace_id: ws,
      p_name: memberData.name,
      p_email: memberData.email,
      p_role: memberData.role,
      p_assigned_projects: memberData.assignedProjects || [],
      p_status: memberData.status,
      p_actor_name: actorInfo.actorName,
      p_actor_role: actorInfo.actorRole,
    });
    if (error) throw new Error(`[addTeamMember] ${error.message}`);
    return String(data);
  },

  async updateTeamMember(
    memberId: string,
    updates: Partial<TeamMember>,
    actorInfo: ActorInfo,
    wsId?: string
  ): Promise<void> {
    const ws = resolveWorkspaceId(wsId);
    const { error } = await supabase.rpc('update_team_member', {
      p_member_id: memberId,
      p_workspace_id: ws,
      p_updates: updates,
      p_actor_name: actorInfo.actorName,
      p_actor_role: actorInfo.actorRole,
    });
    if (error) throw new Error(`[updateTeamMember] ${error.message}`);
  },

  // Budget Revisions
  async submitBudgetRevision(
    revData: Omit<BudgetRevision, 'id' | 'revisionNumber' | 'status' | 'submittedAt'>,
    actorInfo: ActorInfo,
    wsId?: string
  ): Promise<string> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase.rpc('create_budget_revision', {
      p_workspace_id: ws,
      p_project_id: revData.projectId,
      p_division_name: revData.divisionName,
      p_original_amount: revData.originalAmount,
      p_revised_amount: revData.proposedAmount,
      p_reason: revData.justification,
      p_submitted_by: revData.submittedBy,
      p_actor_name: actorInfo.actorName,
      p_actor_role: actorInfo.actorRole,
    });
    if (error) throw new Error(`[submitBudgetRevision] ${error.message}`);
    return String(data);
  },

  async approveBudgetRevision(
    revisionId: string,
    approverName: string,
    actorInfo: ActorInfo,
    wsId?: string
  ): Promise<void> {
    const ws = resolveWorkspaceId(wsId);
    const { error } = await supabase.rpc('decide_budget_revision', {
      p_revision_id: revisionId,
      p_workspace_id: ws,
      p_decision: 'approved',
      p_approver_name: approverName,
      p_reason: null,
      p_actor_name: actorInfo.actorName,
      p_actor_role: actorInfo.actorRole,
    });
    if (error) throw new Error(`[approveBudgetRevision] ${error.message}`);
  },

  async rejectBudgetRevision(
    revisionId: string,
    rejectorName: string,
    reason: string,
    actorInfo: ActorInfo,
    wsId?: string
  ): Promise<void> {
    const ws = resolveWorkspaceId(wsId);
    const { error } = await supabase.rpc('decide_budget_revision', {
      p_revision_id: revisionId,
      p_workspace_id: ws,
      p_decision: 'rejected',
      p_approver_name: rejectorName,
      p_reason: reason,
      p_actor_name: actorInfo.actorName,
      p_actor_role: actorInfo.actorRole,
    });
    if (error) throw new Error(`[rejectBudgetRevision] ${error.message}`);
  },

  // Petty Cash
  async addPettyCash(
    cashData: Omit<PettyCashEntry, 'id' | 'pettyCashNo' | 'status' | 'submittedAt' | 'createdAt' | 'updatedAt'>,
    actorInfo: ActorInfo,
    wsId?: string
  ): Promise<string> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase.rpc('create_petty_cash', {
      p_workspace_id: ws,
      p_project_id: cashData.projectId,
      p_category: cashData.category,
      p_description: cashData.purpose,
      p_amount: cashData.amount,
      p_requested_by: cashData.requester,
      p_actor_name: actorInfo.actorName,
      p_actor_role: actorInfo.actorRole,
    });
    if (error) throw new Error(`[addPettyCash] ${error.message}`);
    return String(data);
  },

  async approvePettyCash(
    cashId: string,
    approverName: string,
    actorInfo: ActorInfo,
    wsId?: string
  ): Promise<void> {
    const ws = resolveWorkspaceId(wsId);
    const { error } = await supabase.rpc('decide_petty_cash', {
      p_cash_id: cashId,
      p_workspace_id: ws,
      p_decision: 'approved',
      p_approver_name: approverName,
      p_reason: null,
      p_actor_name: actorInfo.actorName,
      p_actor_role: actorInfo.actorRole,
    });
    if (error) throw new Error(`[approvePettyCash] ${error.message}`);
  },

  async rejectPettyCash(
    cashId: string,
    rejectorName: string,
    reason: string,
    actorInfo: ActorInfo,
    wsId?: string
  ): Promise<void> {
    const ws = resolveWorkspaceId(wsId);
    const { error } = await supabase.rpc('decide_petty_cash', {
      p_cash_id: cashId,
      p_workspace_id: ws,
      p_decision: 'rejected',
      p_approver_name: rejectorName,
      p_reason: reason,
      p_actor_name: actorInfo.actorName,
      p_actor_role: actorInfo.actorRole,
    });
    if (error) throw new Error(`[rejectPettyCash] ${error.message}`);
  },

  async disbursePettyCash(
    cashId: string,
    disburserName: string,
    actorInfo: ActorInfo,
    wsId?: string
  ): Promise<void> {
    const ws = resolveWorkspaceId(wsId);
    const { error } = await supabase.rpc('disburse_petty_cash', {
      p_cash_id: cashId,
      p_workspace_id: ws,
      p_disburser_name: disburserName,
      p_actor_name: actorInfo.actorName,
      p_actor_role: actorInfo.actorRole,
    });
    if (error) throw new Error(`[disbursePettyCash] ${error.message}`);
  },

  // Procurement
  async addPurchaseOrder(
    poData: Omit<PurchaseOrder, 'id' | 'poNumber' | 'status' | 'requestDate'>,
    actorInfo: ActorInfo,
    wsId?: string
  ): Promise<string> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase.rpc('create_purchase_order', {
      p_workspace_id: ws,
      p_spp_number: poData.sppNumber,
      p_supplier_name: poData.supplierName,
      p_item_description: poData.itemDescription,
      p_quantity_summary: poData.quantitySummary,
      p_total_cost: poData.totalCost,
      p_target_delivery_date: poData.targetDeliveryDate,
      p_requester_name: poData.requester,
      p_project_id: poData.projectId,
      p_actor_name: actorInfo.actorName,
      p_actor_role: actorInfo.actorRole,
    });
    if (error) throw new Error(`[addPurchaseOrder] ${error.message}`);
    return String(data);
  },

  async approvePurchaseOrder(
    poId: string,
    approverName: string,
    overrideReason: string | undefined,
    actorInfo: ActorInfo,
    wsId?: string
  ): Promise<void> {
    const ws = resolveWorkspaceId(wsId);
    const { error } = await supabase.rpc('decide_purchase_order', {
      p_po_id: poId,
      p_workspace_id: ws,
      p_decision: 'approved',
      p_approver_name: approverName,
      p_reason: overrideReason || null,
      p_actor_name: actorInfo.actorName,
      p_actor_role: actorInfo.actorRole,
    });
    if (error) throw new Error(`[approvePurchaseOrder] ${error.message}`);
  },

  async rejectPurchaseOrder(
    poId: string,
    rejectorName: string,
    reason: string,
    actorInfo: ActorInfo,
    wsId?: string
  ): Promise<void> {
    const ws = resolveWorkspaceId(wsId);
    const { error } = await supabase.rpc('decide_purchase_order', {
      p_po_id: poId,
      p_workspace_id: ws,
      p_decision: 'rejected',
      p_approver_name: rejectorName,
      p_reason: reason,
      p_actor_name: actorInfo.actorName,
      p_actor_role: actorInfo.actorRole,
    });
    if (error) throw new Error(`[rejectPurchaseOrder] ${error.message}`);
  },

  // Field Reports
  async addFieldReport(
    reportData: Omit<FieldReport, 'id' | 'reportNumber' | 'status' | 'createdAt' | 'updatedAt'>,
    actorInfo: ActorInfo,
    wsId?: string,
    idempotencyKey: string = crypto.randomUUID()
  ): Promise<string> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase.rpc('create_field_report', {
      p_workspace_id: ws,
      p_project_id: reportData.projectId,
      p_report_date: reportData.date,
      p_site_supervisor_name: reportData.siteSupervisor.trim(),
      p_weather_morning: reportData.weatherMorning,
      p_weather_afternoon: reportData.weatherAfternoon,
      p_working_hours: reportData.workingHours,
      p_workforce: reportData.workforce,
      p_completed_works: reportData.completedWorks,
      p_materials_used: reportData.materialsUsed,
      p_equipment_used: reportData.equipmentUsed,
      p_blockers: reportData.blockers || null,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw new Error(`[addFieldReport] ${error.message}`);
    const reportId = data?.data?.id;
    if (typeof reportId !== 'string' || !reportId) {
      throw new Error('[addFieldReport] RPC tidak mengembalikan ID laporan yang valid.');
    }
    return reportId;
  },

  async reviewFieldReport(
    reportId: string,
    decision: 'approved' | 'rejected',
    reviewerName: string,
    notes: string | undefined,
    actorInfo: ActorInfo,
    wsId?: string
  ): Promise<void> {
    const ws = resolveWorkspaceId(wsId);
    const rpcName = decision === 'approved' ? 'approve_field_report' : 'revise_field_report';
    const { error } = await supabase.rpc(rpcName, {
      p_report_id: reportId,
      p_workspace_id: ws,
      p_reviewer_name: reviewerName,
      p_notes: notes || '',
      p_actor_name: actorInfo.actorName,
      p_actor_role: actorInfo.actorRole,
    });
    if (error) throw new Error(`[reviewFieldReport] ${error.message}`);
  },

  // Materials
  async addStockMutation(
    mutationData: Omit<StockMutation, 'id'>,
    actorInfo: ActorInfo,
    wsId?: string
  ): Promise<string> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase.rpc('record_stock_mutation', {
      p_workspace_id: ws,
      p_material_id: mutationData.materialId,
      p_material_name: mutationData.materialName,
      p_mutation_type: mutationData.type,
      p_quantity: mutationData.quantity,
      p_unit_of_measure: mutationData.unit,
      p_reference_doc: mutationData.referenceNo,
      p_project_id: mutationData.projectId,
      p_notes: mutationData.handler,
      p_actor_name: actorInfo.actorName,
      p_actor_role: actorInfo.actorRole,
    });
    if (error) throw new Error(`[addStockMutation] ${error.message}`);
    return String(data);
  },

  async submitStockAdjustment(
    adjData: Omit<StockAdjustment, 'id' | 'status' | 'submittedAt'>,
    actorInfo: ActorInfo,
    wsId?: string
  ): Promise<string> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase.rpc('create_stock_adjustment', {
      p_workspace_id: ws,
      p_material_id: adjData.materialId,
      p_material_name: adjData.materialName,
      p_adjustment_type: adjData.reason,
      p_quantity_before: adjData.previousStock,
      p_quantity_after: adjData.physicalStock,
      p_reason: adjData.reason,
      p_submitted_by: adjData.submittedBy,
      p_actor_name: actorInfo.actorName,
      p_actor_role: actorInfo.actorRole,
    });
    if (error) throw new Error(`[submitStockAdjustment] ${error.message}`);
    return String(data);
  },

  async approveStockAdjustment(
    adjId: string,
    approverName: string,
    actorInfo: ActorInfo,
    wsId?: string
  ): Promise<void> {
    const ws = resolveWorkspaceId(wsId);
    const { error } = await supabase.rpc('decide_stock_adjustment', {
      p_adjustment_id: adjId,
      p_workspace_id: ws,
      p_decision: 'approved',
      p_approver_name: approverName,
      p_reason: null,
      p_actor_name: actorInfo.actorName,
      p_actor_role: actorInfo.actorRole,
    });
    if (error) throw new Error(`[approveStockAdjustment] ${error.message}`);
  },

  async rejectStockAdjustment(
    adjId: string,
    rejectorName: string,
    reason: string,
    actorInfo: ActorInfo,
    wsId?: string
  ): Promise<void> {
    const ws = resolveWorkspaceId(wsId);
    const { error } = await supabase.rpc('decide_stock_adjustment', {
      p_adjustment_id: adjId,
      p_workspace_id: ws,
      p_decision: 'rejected',
      p_approver_name: rejectorName,
      p_reason: reason,
      p_actor_name: actorInfo.actorName,
      p_actor_role: actorInfo.actorRole,
    });
    if (error) throw new Error(`[rejectStockAdjustment] ${error.message}`);
  },

  // Notifications
  async markNotificationAsRead(
    notificationId: string,
    wsId?: string
  ): Promise<void> {
    const ws = resolveWorkspaceId(wsId);
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId)
      .eq('workspace_id', ws);
    if (error) throw new Error(`[markNotificationAsRead] ${error.message}`);
  },

  async markAllNotificationsRead(wsId?: string): Promise<void> {
    const ws = resolveWorkspaceId(wsId);
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('workspace_id', ws)
      .eq('read', false);
    if (error) throw new Error(`[markAllNotificationsRead] ${error.message}`);
  },

  // ---------------------------------------------------------------------------
  // Paginated list helpers (server-side, no select('*') on large tables)
  // PAGE_SIZE = 50 per request. Caller passes page (0-indexed).
  // ---------------------------------------------------------------------------

  /** Daftar PO dengan paginasi, filter status/proyek, dan pencarian. */
  async getPurchaseOrdersPaged(opts: {
    page?: number;
    pageSize?: number;
    status?: string;
    projectId?: string;
    search?: string;
    wsId?: string;
  }): Promise<{ items: PurchaseOrder[]; total: number }> {
    const ws = resolveWorkspaceId(opts.wsId);
    const page = opts.page ?? 0;
    const size = opts.pageSize ?? 50;
    const from = page * size;
    const to = from + size - 1;

    let q = supabase
      .from('purchase_orders')
      .select(
        'id,po_number,spp_number,supplier_name,item_description,quantity_summary,total_cost,request_date,target_delivery_date,status,requester_name,approved_by_name,approved_at,rejected_at,rejection_reason,created_at,projects(name,legacy_id)',
        { count: 'exact' }
      )
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (opts.status && opts.status !== 'Semua') q = q.eq('status', opts.status);
    if (opts.projectId) q = q.eq('project_id', opts.projectId);
    if (opts.search) {
      q = q.or(
        `po_number.ilike.%${opts.search}%,supplier_name.ilike.%${opts.search}%,item_description.ilike.%${opts.search}%`
      );
    }

    const { data, error, count } = await q;
    if (error) throw new Error(`[getPurchaseOrdersPaged] ${error.message}`);
    return { items: (data || []).map(mapPurchaseOrder), total: count ?? 0 };
  },

  /** Daftar mutasi stok dengan paginasi. */
  async getStockMutationsPaged(opts: {
    page?: number;
    pageSize?: number;
    materialId?: string;
    type?: 'Masuk' | 'Keluar';
    wsId?: string;
  }): Promise<{ items: StockMutation[]; total: number }> {
    const ws = resolveWorkspaceId(opts.wsId);
    const page = opts.page ?? 0;
    const size = opts.pageSize ?? 50;
    const from = page * size;
    const to = from + size - 1;

    let q = supabase
      .from('stock_mutations')
      .select(
        'id,material_id,material_name,type,quantity,unit,reference_no,project_id,handler,created_at,materials(legacy_id)',
        { count: 'exact' }
      )
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (opts.materialId) q = q.eq('material_id', opts.materialId);
    if (opts.type) q = q.eq('type', opts.type);

    const { data, error, count } = await q;
    if (error) throw new Error(`[getStockMutationsPaged] ${error.message}`);
    return { items: (data || []).map(mapStockMutation), total: count ?? 0 };
  },

  /** Daftar kas kecil dengan paginasi dan filter status. */
  async getPettyCashPaged(opts: {
    page?: number;
    pageSize?: number;
    status?: string;
    projectId?: string;
    wsId?: string;
  }): Promise<{ items: PettyCashEntry[]; total: number }> {
    const ws = resolveWorkspaceId(opts.wsId);
    const page = opts.page ?? 0;
    const size = opts.pageSize ?? 50;
    const from = page * size;
    const to = from + size - 1;

    let q = supabase
      .from('petty_cash')
      .select(
        'id,workspace_id,legacy_id,petty_cash_no,project_id,category,purpose,receipt_path,amount,status,requester_id,requester_name,reviewed_by,reviewed_at,disbursed_by,disbursed_at,submitted_at,created_at,updated_at,rejection_reason,projects(name,legacy_id)',
        { count: 'exact' }
      )
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (opts.status && opts.status !== 'Semua') q = q.eq('status', opts.status);
    if (opts.projectId) q = q.eq('project_id', opts.projectId);

    const { data, error, count } = await q;
    if (error) throw new Error(`[getPettyCashPaged] ${error.message}`);
    return { items: (data || []).map(mapPettyCash), total: count ?? 0 };
  },

  /** Daftar laporan harian dengan paginasi dan filter status. */
  async getFieldReportsPaged(opts: {
    page?: number;
    pageSize?: number;
    status?: string;
    projectId?: string;
    search?: string;
    wsId?: string;
  }): Promise<{ items: FieldReport[]; total: number }> {
    const ws = resolveWorkspaceId(opts.wsId);
    const page = opts.page ?? 0;
    const size = opts.pageSize ?? 50;
    const from = page * size;
    const to = from + size - 1;

    let q = supabase
      .from('field_reports')
      .select(
        'id,report_date,project_id,reporter_name,weather,overall_progress,status,submitted_at,verified_by_name,approved_at,rejection_reason,created_at,projects(name,legacy_id)',
        { count: 'exact' }
      )
      .eq('workspace_id', ws)
      .order('report_date', { ascending: false })
      .range(from, to);

    if (opts.status && opts.status !== 'Semua') q = q.eq('status', opts.status);
    if (opts.projectId) q = q.eq('project_id', opts.projectId);
    if (opts.search) {
      q = q.or(
        `reporter_name.ilike.%${opts.search}%,project_id.eq.${opts.search}`
      );
    }

    const { data, error, count } = await q;
    if (error) throw new Error(`[getFieldReportsPaged] ${error.message}`);
    return { items: (data || []).map(mapFieldReport), total: count ?? 0 };
  },

  /** Audit log dengan paginasi — kolom spesifik, bukan select('*'). */
  async getAuditLogsPaged(opts: {
    page?: number;
    pageSize?: number;
    action?: string;
    recordType?: string;
    wsId?: string;
  }): Promise<{ items: AuditLogEntry[]; total: number }> {
    const ws = resolveWorkspaceId(opts.wsId);
    const page = opts.page ?? 0;
    const size = opts.pageSize ?? 50;
    const from = page * size;
    const to = from + size - 1;

    let q = supabase
      .from('audit_logs')
      .select(
        'id,action,actor_name,actor_role,record_type,record_id,project_id,details,previous_value,new_value,created_at',
        { count: 'exact' }
      )
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (opts.action) q = q.eq('action', opts.action);
    if (opts.recordType) q = q.eq('record_type', opts.recordType);

    const { data, error, count } = await q;
    if (error) throw new Error(`[getAuditLogsPaged] ${error.message}`);
    return { items: (data || []).map(mapAuditLog), total: count ?? 0 };
  },

  /** Mengambil daftar harga satuan dasar (resource_prices) */
  async getResourcePrices(opts?: {
    jenis?: string;
    search?: string;
    wilayah?: string;
    wsId?: string;
  }): Promise<ResourcePrice[]> {
    const ws = resolveWorkspaceId(opts?.wsId);
    let q = supabase
      .from('resource_prices')
      .select('id,workspace_id,jenis,kode,uraian,satuan,harga,wilayah,berlaku_mulai,berlaku_sampai,spesifikasi,created_at,updated_at')
      .eq('workspace_id', ws)
      .order('kode', { ascending: true });

    if (opts?.jenis && opts.jenis !== 'Semua') {
      q = q.eq('jenis', opts.jenis);
    }
    if (opts?.wilayah && opts.wilayah !== 'Semua') {
      q = q.eq('wilayah', opts.wilayah);
    }
    if (opts?.search) {
      q = q.or(`kode.ilike.%${opts.search}%,uraian.ilike.%${opts.search}%`);
    }

    const { data, error } = await q;
    if (error) throw new Error(`[getResourcePrices] ${error.message}`);
    return (data || []).map(mapResourcePrice);
  },

  /** Upsert item harga dasar via RPC security definer */
  async upsertResourcePrice(payload: {
    workspaceId?: string;
    jenis: string;
    kode: string;
    uraian: string;
    satuan: string;
    harga: number;
    wilayah?: string;
    berlakuMulai?: string;
    berlakuSampai?: string | null;
    spesifikasi?: string | null;
    id?: string;
  }): Promise<{ success: boolean; id: string; message: string }> {
    const ws = resolveWorkspaceId(payload.workspaceId);
    const { data, error } = await supabase.rpc('upsert_resource_price', {
      p_workspace_id: ws,
      p_jenis: payload.jenis,
      p_kode: payload.kode,
      p_uraian: payload.uraian,
      p_satuan: payload.satuan,
      p_harga: Math.round(payload.harga),
      p_wilayah: payload.wilayah ?? '',
      p_berlaku_mulai: payload.berlakuMulai || getWitaDateISO(),
      p_berlaku_sampai: payload.berlakuSampai || null,
      p_spesifikasi: payload.spesifikasi || null,
      p_id: payload.id || null,
    });
    if (error) throw new Error(`[upsertResourcePrice] ${error.message}`);
    return data;
  },

  /** Hapus item harga dasar via RPC security definer */
  async deleteResourcePrice(id: string, workspaceId?: string): Promise<{ success: boolean; message: string }> {
    const ws = resolveWorkspaceId(workspaceId);
    const { data, error } = await supabase.rpc('delete_resource_price', {
      p_workspace_id: ws,
      p_id: id,
    });
    if (error) throw new Error(`[deleteResourcePrice] ${error.message}`);
    return data;
  },

  /** Batch import item harga dasar via RPC security definer */
  async importResourcePricesBatch(
    rows: Array<{
      jenis?: string;
      kode: string;
      uraian: string;
      satuan: string;
      harga: number;
      wilayah?: string;
      berlaku_mulai?: string;
      spesifikasi?: string;
    }>,
    workspaceId?: string
  ): Promise<{ success: boolean; total: number; inserted: number; updated: number; skipped: number; message: string }> {
    const ws = resolveWorkspaceId(workspaceId);
    const { data, error } = await supabase.rpc('import_resource_prices_batch', {
      p_workspace_id: ws,
      p_rows: rows,
    });
    if (error) throw new Error(`[importResourcePricesBatch] ${error.message}`);
    return data;
  },

  /** Mengambil daftar template AHSP dengan komponennya */
  async getAHSPTemplates(opts?: {
    kategori?: string;
    search?: string;
    wsId?: string;
  }): Promise<AHSPTemplate[]> {
    const ws = resolveWorkspaceId(opts?.wsId);
    let q = supabase
      .from('ahsp_templates')
      .select('*, ahsp_components(*)')
      .eq('workspace_id', ws)
      .order('kode', { ascending: true });

    if (opts?.kategori && opts.kategori !== 'Semua') {
      q = q.eq('kategori', opts.kategori);
    }
    if (opts?.search) {
      q = q.or(`kode.ilike.%${opts.search}%,nama.ilike.%${opts.search}%`);
    }

    const { data, error } = await q;
    if (error) throw new Error(`[getAHSPTemplates] ${error.message}`);
    return (data || []).map(mapAHSPTemplate);
  },

  /** Mengambil kalkulasi harga satuan AHSP breakdown */
  async calculateAHSPUnitPrice(templateId: string, wilayah?: string, wsId?: string): Promise<AHSPUnitPriceCalculation> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase.rpc('calculate_ahsp_unit_price', {
      p_workspace_id: ws,
      p_template_id: templateId,
      p_wilayah: wilayah || '',
    });
    if (error) throw new Error(`[calculateAHSPUnitPrice] ${error.message}`);
    return data;
  },

  /** Upsert template AHSP */
  async upsertAHSPTemplate(payload: {
    workspaceId?: string;
    kode: string;
    nama: string;
    satuan: string;
    kategori?: string;
    overheadProfitPct?: number;
    keterangan?: string | null;
    id?: string;
  }): Promise<{ success: boolean; id: string; message: string }> {
    const ws = resolveWorkspaceId(payload.workspaceId);
    const { data, error } = await supabase.rpc('upsert_ahsp_template', {
      p_workspace_id: ws,
      p_kode: payload.kode,
      p_nama: payload.nama,
      p_satuan: payload.satuan,
      p_kategori: payload.kategori || 'Umum',
      p_overhead_profit_pct: payload.overheadProfitPct ?? 10.0,
      p_keterangan: payload.keterangan || null,
      p_id: payload.id || null,
    });
    if (error) throw new Error(`[upsertAHSPTemplate] ${error.message}`);
    return data;
  },

  /** Hapus template AHSP */
  async deleteAHSPTemplate(id: string, workspaceId?: string): Promise<{ success: boolean; message: string }> {
    const ws = resolveWorkspaceId(workspaceId);
    const { data, error } = await supabase.rpc('delete_ahsp_template', {
      p_workspace_id: ws,
      p_id: id,
    });
    if (error) throw new Error(`[deleteAHSPTemplate] ${error.message}`);
    return data;
  },

  /** Upsert komponen AHSP */
  async upsertAHSPComponent(payload: {
    workspaceId?: string;
    templateId: string;
    jenis: string;
    kodeSumberDaya: string;
    uraian: string;
    satuan: string;
    koefisien: number;
    resourceId?: string | null;
    id?: string;
  }): Promise<{ success: boolean; id: string; message: string }> {
    const ws = resolveWorkspaceId(payload.workspaceId);
    const { data, error } = await supabase.rpc('upsert_ahsp_component', {
      p_workspace_id: ws,
      p_template_id: payload.templateId,
      p_jenis: payload.jenis,
      p_kode_sumber_daya: payload.kodeSumberDaya,
      p_uraian: payload.uraian,
      p_satuan: payload.satuan,
      p_koefisien: payload.koefisien,
      p_resource_id: payload.resourceId || null,
      p_id: payload.id || null,
    });
    if (error) throw new Error(`[upsertAHSPComponent] ${error.message}`);
    return data;
  },

  /** Hapus komponen AHSP */
  async deleteAHSPComponent(id: string, workspaceId?: string): Promise<{ success: boolean; message: string }> {
    const ws = resolveWorkspaceId(workspaceId);
    const { data, error } = await supabase.rpc('delete_ahsp_component', {
      p_workspace_id: ws,
      p_id: id,
    });
    if (error) throw new Error(`[deleteAHSPComponent] ${error.message}`);
    return data;
  },

  /** Seed 20 item standar PUPR Permen PUPR 8/2023 */
  async seedPUPRAHSPTemplates(workspaceId?: string): Promise<{ success: boolean; total: number; message: string }> {
    const ws = resolveWorkspaceId(workspaceId);
    const { data, error } = await supabase.rpc('seed_pupr_ahsp_templates', {
      p_workspace_id: ws,
    });
    if (error) throw new Error(`[seedPUPRAHSPTemplates] ${error.message}`);
    return data;
  },

  /** Mengambil daftar item BOQ untuk proyek tertentu */
  async getBOQItems(projectId: string, wsId?: string): Promise<BOQItem[]> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase
      .from('boq_items')
      .select('*')
      .eq('workspace_id', ws)
      .eq('project_id', projectId)
      .order('urutan', { ascending: true })
      .order('kode', { ascending: true });

    if (error) throw new Error(`[getBOQItems] ${error.message}`);
    return (data || []).map(mapBOQItem);
  },

  /** Mengambil rekapitulasi BOQ (Subtotal, PPN, Grand Total, Terbilang, Divisi) */
  async getProjectBOQSummary(projectId: string, wsId?: string): Promise<BOQSummary> {
    const ws = resolveWorkspaceId(wsId);
    const { data, error } = await supabase.rpc('get_project_boq_summary', {
      p_workspace_id: ws,
      p_project_id: projectId,
    });
    if (error) throw new Error(`[getProjectBOQSummary] ${error.message}`);
    return data;
  },

  /** Upsert item BOQ via RPC */
  async upsertBOQItem(payload: {
    workspaceId?: string;
    projectId: string;
    kode: string;
    uraian: string;
    satuan?: string;
    volume: number;
    hargaSatuan: number;
    divisionCategory: string;
    ahspId?: string | null;
    parentId?: string | null;
    urutan?: number;
    id?: string;
  }): Promise<{ success: boolean; id: string; message: string }> {
    const ws = resolveWorkspaceId(payload.workspaceId);
    const { data, error } = await supabase.rpc('upsert_boq_item', {
      p_workspace_id: ws,
      p_project_id: payload.projectId,
      p_kode: payload.kode,
      p_uraian: payload.uraian,
      p_satuan: payload.satuan || 'ls',
      p_volume: payload.volume,
      p_harga_satuan: Math.round(payload.hargaSatuan),
      p_division_category: payload.divisionCategory,
      p_ahsp_id: payload.ahspId || null,
      p_parent_id: payload.parentId || null,
      p_urutan: payload.urutan || 0,
      p_id: payload.id || null,
    });
    if (error) throw new Error(`[upsertBOQItem] ${error.message}`);
    return data;
  },

  /** Hapus item BOQ via RPC */
  async deleteBOQItem(projectId: string, id: string, workspaceId?: string): Promise<{ success: boolean; message: string }> {
    const ws = resolveWorkspaceId(workspaceId);
    const { data, error } = await supabase.rpc('delete_boq_item', {
      p_workspace_id: ws,
      p_project_id: projectId,
      p_id: id,
    });
    if (error) throw new Error(`[deleteBOQItem] ${error.message}`);
    return data;
  },

  /** Update progres fisik item BOQ via RPC */
  async updateBOQItemProgress(projectId: string, id: string, progresPersen: number, workspaceId?: string): Promise<{ success: boolean; message: string }> {
    const ws = resolveWorkspaceId(workspaceId);
    const { data, error } = await supabase.rpc('update_boq_item_progress', {
      p_workspace_id: ws,
      p_project_id: projectId,
      p_id: id,
      p_progres_persen: progresPersen,
    });
    if (error) throw new Error(`[updateBOQItemProgress] ${error.message}`);
    return data;
  },

  /** Update persentase PPN proyek */
  async updateProjectPPN(projectId: string, ppnPercent: number, workspaceId?: string): Promise<{ success: boolean; message: string }> {
    const ws = resolveWorkspaceId(workspaceId);
    const { data, error } = await supabase.rpc('update_project_ppn', {
      p_workspace_id: ws,
      p_project_id: projectId,
      p_ppn_percent: ppnPercent,
    });
    if (error) throw new Error(`[updateProjectPPN] ${error.message}`);
    return data;
  },

  // ─── Phase F: Payment Terms ──────────────────────────────────

  /** Ambil jadwal termin lengkap untuk satu proyek */
  async getPaymentSchedule(projectId: string, workspaceId?: string): Promise<PaymentSchedule> {
    const ws = resolveWorkspaceId(workspaceId);
    const { data, error } = await supabase.rpc('get_payment_schedule', {
      p_workspace_id: ws,
      p_project_id: projectId,
    });
    if (error) throw new Error(`[getPaymentSchedule] ${error.message}`);
    const terms: PaymentTerm[] = (data?.terms || []).map((r: any): PaymentTerm => ({
      id: r.id,
      workspaceId: ws,
      projectId,
      jenis: r.jenis,
      urutan: r.urutan,
      label: r.label,
      persen: Number(r.persen),
      nominal: Number(r.nominal),
      milestoneId: r.milestone_id || null,
      milestoneTitle: r.milestone_title || null,
      masaPemeliharaanHari: r.masa_pemeliharaan_hari ?? null,
      status: r.status,
      tanggalTagih: r.tanggal_tagih || null,
      tanggalLunas: r.tanggal_lunas || null,
      keterangan: r.keterangan || null,
      createdAt: r.created_at,
      updatedAt: r.created_at,
    }));
    const s = data?.summary || {};
    return {
      terms,
      summary: {
        totalPersen: Number(s.total_persen || 0),
        totalNominal: Number(s.total_nominal || 0),
        totalTagih: Number(s.total_tagih || 0),
        totalLunas: Number(s.total_lunas || 0),
        countDraft: Number(s.count_draft || 0),
        countTagih: Number(s.count_tagih || 0),
        countLunas: Number(s.count_lunas || 0),
      },
    };
  },

  /** Buat atau perbarui satu baris termin */
  async upsertPaymentTerm(payload: {
    workspaceId?: string;
    projectId: string;
    id?: string;
    jenis: 'UangMuka' | 'Termin' | 'Retensi';
    urutan: number;
    label?: string;
    persen: number;
    milestoneId?: string | null;
    masaPemeliharaanHari?: number | null;
    keterangan?: string | null;
  }): Promise<{ id: string; nominal: number; message: string }> {
    const ws = resolveWorkspaceId(payload.workspaceId);
    const { data, error } = await supabase.rpc('upsert_payment_term', {
      p_workspace_id: ws,
      p_project_id: payload.projectId,
      p_id: payload.id || null,
      p_jenis: payload.jenis,
      p_urutan: payload.urutan,
      p_label: payload.label || '',
      p_persen: payload.persen,
      p_milestone_id: payload.milestoneId || null,
      p_masa_pemeliharaan_hari: payload.masaPemeliharaanHari || null,
      p_keterangan: payload.keterangan || null,
    });
    if (error) throw new Error(`[upsertPaymentTerm] ${error.message}`);
    return data;
  },

  /** Hapus satu baris termin (hanya jika Draft) */
  async deletePaymentTerm(projectId: string, id: string, workspaceId?: string): Promise<{ message: string }> {
    const ws = resolveWorkspaceId(workspaceId);
    const { data, error } = await supabase.rpc('delete_payment_term', {
      p_workspace_id: ws,
      p_project_id: projectId,
      p_id: id,
    });
    if (error) throw new Error(`[deletePaymentTerm] ${error.message}`);
    return data;
  },

  /** Ubah status termin (Finance Manager / Owner only) */
  async updatePaymentTermStatus(payload: {
    workspaceId?: string;
    projectId: string;
    id: string;
    status: 'Tagih' | 'Lunas';
    tanggal?: string;
    keterangan?: string;
  }): Promise<{ message: string }> {
    const ws = resolveWorkspaceId(payload.workspaceId);
    const { data, error } = await supabase.rpc('update_payment_term_status', {
      p_workspace_id: ws,
      p_project_id: payload.projectId,
      p_id: payload.id,
      p_status: payload.status,
      p_tanggal: payload.tanggal || getWitaDateISO(),
      p_keterangan: payload.keterangan || null,
    });
    if (error) throw new Error(`[updatePaymentTermStatus] ${error.message}`);
    return data;
  },

  // -------------------------------------------------------------------------
  // Lampiran / Storage (Attachments & Compressed Photos)
  // -------------------------------------------------------------------------

  /** Unggah lampiran foto/dokumen ke bucket storage 'attachments' dan simpan record ke tabel attachments */
  async uploadAttachment(payload: {
    workspaceId?: string;
    recordType: AttachmentRecordType;
    recordId: string;
    fileBlob: Blob | File;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    caption?: string;
    userId?: string;
  }): Promise<AttachmentItem> {
    const ws = resolveWorkspaceId(payload.workspaceId);
    const fileExt = payload.fileName.split('.').pop() || 'jpg';
    const fileUuid = crypto.randomUUID();
    const storagePath = `${ws}/${payload.recordType}/${payload.recordId}/${fileUuid}.${fileExt}`;

    // 1. Upload ke Storage Supabase
    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(storagePath, payload.fileBlob, {
        contentType: payload.mimeType,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`[uploadAttachment] Gagal mengunggah file ke storage: ${uploadError.message}`);
    }

    // 2. Simpan baris ke public.attachments
    const { data: rowData, error: dbError } = await supabase
      .from('attachments')
      .insert({
        workspace_id: ws,
        record_type: payload.recordType,
        record_id: payload.recordId,
        storage_path: storagePath,
        caption: payload.caption || '',
        mime_type: payload.mimeType,
        size_bytes: payload.sizeBytes,
        uploaded_by: payload.userId || null,
      })
      .select()
      .single();

    if (dbError) {
      // Rollback file jika insert database gagal
      await supabase.storage.from('attachments').remove([storagePath]);
      throw new Error(`[uploadAttachment] Gagal menyimpan data lampiran: ${dbError.message}`);
    }

    // 3. Buat signed URL (60 detik)
    const { data: signedData } = await supabase.storage
      .from('attachments')
      .createSignedUrl(storagePath, 60);

    return {
      id: rowData.id,
      workspace_id: rowData.workspace_id,
      record_type: rowData.record_type,
      record_id: rowData.record_id,
      storage_path: rowData.storage_path,
      caption: rowData.caption,
      mime_type: rowData.mime_type,
      size_bytes: rowData.size_bytes,
      uploaded_by: rowData.uploaded_by,
      created_at: rowData.created_at,
      signed_url: signedData?.signedUrl || '',
    };
  },

  /** Mengambil daftar lampiran untuk record tertentu dan menghasilkan signed URL (60 detik) */
  async getAttachments(payload: {
    workspaceId?: string;
    recordType: AttachmentRecordType;
    recordId: string;
  }): Promise<AttachmentItem[]> {
    const ws = resolveWorkspaceId(payload.workspaceId);
    const { data, error } = await supabase
      .from('attachments')
      .select('*')
      .eq('workspace_id', ws)
      .eq('record_type', payload.recordType)
      .eq('record_id', payload.recordId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`[getAttachments] Gagal memuat lampiran: ${error.message}`);
    }

    if (!data || data.length === 0) return [];

    // Hasilkan signed URL untuk setiap lampiran
    const itemsWithUrls = await Promise.all(
      data.map(async (row) => {
        const { data: signedData } = await supabase.storage
          .from('attachments')
          .createSignedUrl(row.storage_path, 60);

        return {
          id: row.id,
          workspace_id: row.workspace_id,
          record_type: row.record_type,
          record_id: row.record_id,
          storage_path: row.storage_path,
          caption: row.caption,
          mime_type: row.mime_type,
          size_bytes: row.size_bytes,
          uploaded_by: row.uploaded_by,
          created_at: row.created_at,
          signed_url: signedData?.signedUrl || '',
        };
      })
    );

    return itemsWithUrls;
  },

  /** Menghapus lampiran dari database dan bucket storage */
  async deleteAttachment(payload: {
    id: string;
    storagePath: string;
  }): Promise<{ message: string }> {
    const { error: dbError } = await supabase
      .from('attachments')
      .delete()
      .eq('id', payload.id);

    if (dbError) {
      throw new Error(`[deleteAttachment] Gagal menghapus record lampiran: ${dbError.message}`);
    }

    await supabase.storage.from('attachments').remove([payload.storagePath]);

    return { message: 'Lampiran berhasil dihapus.' };
  },
};
