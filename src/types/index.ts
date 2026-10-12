/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface BaseEntity {
  id: string;
  workspaceId?: string;
  createdAt?: string; // ISO 8601 UTC
  createdBy?: string; // User UID
  updatedAt?: string; // ISO 8601 UTC
  updatedBy?: string; // User UID
  schemaVersion?: number; // e.g. 2
}

export type ProjectCategory = 'Komersial' | 'Infrastruktur' | 'Residensial' | 'Industri';
export type ProjectStatus = 'Berjalan' | 'Selesai' | 'Tertunda' | 'Pra-Konstruksi';
export type ScheduleHealth = 'Tepat Waktu' | 'Kritis' | 'Terlambat' | 'Mendahului';
export type ProjectScheduleStatus = ScheduleHealth;

export interface Project extends BaseEntity {
  code: string;
  name: string;
  client: string;
  category: ProjectCategory;
  location: string;
  projectManager: string;
  siteEngineer: string;
  contractValue: number; // Integer Rupiah
  approvedBudget: number; // Integer Rupiah
  actualCost: number; // Integer Rupiah
  startDate: string; // ISO 8601 UTC
  targetEndDate: string; // ISO 8601 UTC
  progressActual: number;
  progressPlanned: number;
  status: ProjectStatus;
  scheduleStatus: ScheduleHealth;
  image?: string;
  description: string;
  totalMilestones: number;
  completedMilestones: number;
}

export interface Milestone extends BaseEntity {
  projectId: string;
  title: string;
  wbsCode: string;
  plannedDate: string; // ISO 8601 UTC
  actualDate?: string; // ISO 8601 UTC
  progress: number;
  status: 'Selesai' | 'Berjalan' | 'Menunggu' | 'Terlambat';
  weightPercent: number;
  signedOffBy?: string;
  signedOffByUid?: string;
  signedOffAt?: string; // ISO 8601 UTC
  bastRef?: string;
}

export interface WBSItem extends BaseEntity {
  projectId: string;
  code: string;
  name: string;
  category: string;
  durationDays: number;
  startDate: string; // ISO 8601 UTC
  endDate: string; // ISO 8601 UTC
  plannedProgress: number;
  actualProgress: number;
  status: 'Selesai' | 'Berjalan' | 'Terlambat' | 'Belum Mulai';
  criticalPath: boolean;
  assignedTeam: string;
}

export interface BudgetLine extends BaseEntity {
  projectId: string;
  code: string;
  divisionName: string;
  category:
    | 'Pekerjaan Struktur'
    | 'Pekerjaan Arsitektur'
    | 'Pekerjaan MEP'
    | 'Pekerjaan Persiapan'
    | 'Manajemen & Overhead';
  plannedAmount: number; // Integer Rupiah
  actualAmount: number; // Integer Rupiah
  unit: string;
  volume: number;
  unitRate: number; // Integer Rupiah
  varianceAmount: number; // Integer Rupiah
  variancePercent: number;
  status: 'Aman' | 'Peringatan' | 'Overbudget';
}

export interface BudgetVersion extends BaseEntity {
  projectId: string;
  versionNumber: string; // e.g. "v0 Kontrak Induk", "v1 Addendum 1"
  effectiveDate: string;
  approvedBy: string;
  approvedByUid?: string;
  revisionId?: string;
  revisionNumber?: string;
  totalPlannedAmount: number;
  description: string;
  divisionAmounts: Record<string, number>;
  notes?: string;
}

export interface MaterialItem extends BaseEntity {
  code: string;
  name: string;
  specification: string;
  category: 'Semen & Pasir' | 'Besi & Baja' | 'Beton Readymix' | 'Arsitektural' | 'MEP & Utilitas';
  unit: string;
  currentStock: number; // Integer
  minStock: number; // Integer
  allocatedProject: string;
  allocatedProjectId?: string;
  warehouseLocation: string;
  primarySupplier: string;
  unitPrice: number; // Integer Rupiah
  lastRestocked: string; // ISO 8601 UTC
  status: 'Aman' | 'Menipis' | 'Kritis';
}

export interface StockMutation extends BaseEntity {
  materialId: string;
  materialName: string;
  date: string; // ISO 8601 UTC
  type: 'Masuk' | 'Keluar';
  quantity: number; // Integer
  unit: string;
  referenceNo: string;
  projectId?: string;
  project: string;
  handler: string;
}

export type StockAdjustmentStatus = 'Menunggu' | 'Disetujui' | 'Ditolak';

export interface StockAdjustment extends BaseEntity {
  adjustmentNo: string;
  materialId: string;
  materialName: string;
  materialCode: string;
  projectId: string;
  projectName: string;
  previousStock: number; // Integer
  physicalStock: number; // Integer
  varianceQuantity: number; // Integer
  unit: string;
  reason:
    | 'Kerusakan Fisik di Site'
    | 'Susut / Faktor Cuaca'
    | 'Selisih Bongkar Muat'
    | 'Retur Pekerjaan Subkon'
    | 'Koreksi Opname Fisik';
  evidenceRef: string;
  submittedBy: string;
  submittedByUid?: string;
  submittedAt: string; // ISO 8601 UTC
  status: StockAdjustmentStatus;
  reviewedBy?: string;
  reviewedByUid?: string;
  reviewedAt?: string; // ISO 8601 UTC
  rejectionReason?: string;
}

export type POStatus = 'Draft' | 'Menunggu' | 'Disetujui' | 'Ditolak' | 'Dikirim' | 'Selesai';

export interface PurchaseOrder extends BaseEntity {
  poNumber: string;
  sppNumber: string;
  projectId: string;
  projectName: string;
  supplierName: string;
  itemDescription: string;
  quantitySummary: string;
  totalCost: number; // Integer Rupiah
  requestDate: string; // ISO 8601 UTC
  targetDeliveryDate: string; // ISO 8601 UTC
  status: POStatus;
  approvedBy?: string;
  approvedByUid?: string;
  approvedAt?: string; // ISO 8601 UTC
  rejectedBy?: string;
  rejectedByUid?: string;
  rejectedAt?: string; // ISO 8601 UTC
  rejectionReason?: string;
  requester: string;
  requesterUid?: string;
}

export interface WorkforceEntry {
  role: string;
  count: number;
}

export type FieldReportStatus = 'Draft' | 'Diverifikasi' | 'Disetujui' | 'Perlu Revisi';

export interface FieldReport extends BaseEntity {
  projectId: string;
  projectName: string;
  reportNumber: string;
  date: string; // ISO 8601 UTC
  weatherMorning: 'Cerah' | 'Berawan' | 'Hujan Ringan' | 'Hujan Deras';
  weatherAfternoon: 'Cerah' | 'Berawan' | 'Hujan Ringan' | 'Hujan Deras';
  workingHours: number;
  siteSupervisor: string;
  siteSupervisorUid?: string;
  workforce: WorkforceEntry[];
  completedWorks: string[];
  materialsUsed: { name: string; quantity: string }[];
  equipmentUsed: { name: string; hours: number }[];
  blockers?: string;
  status: FieldReportStatus;
  verifiedBy?: string;
  verifiedByUid?: string;
  verifiedAt?: string; // ISO 8601 UTC
  approvedBy?: string;
  approvedByUid?: string;
  approvedAt?: string; // ISO 8601 UTC
  reviewerNotes?: string;
  photos: { url: string; caption: string }[];
}

export interface BudgetRevision extends BaseEntity {
  projectId: string;
  projectName: string;
  revisionNumber: string;
  title: string;
  divisionName: string;
  originalAmount: number; // Integer Rupiah
  proposedAmount: number; // Integer Rupiah
  varianceAmount: number; // Integer Rupiah
  justification: string;
  status: 'Draft' | 'Menunggu' | 'Disetujui' | 'Ditolak';
  submittedBy: string;
  submittedByUid?: string;
  submittedAt: string; // ISO 8601 UTC
  reviewedBy?: string;
  reviewedByUid?: string;
  reviewedAt?: string; // ISO 8601 UTC
  rejectionReason?: string;
}

export type PettyCashCategory =
  | 'Konsumsi & Lembur'
  | 'BBM & Logistik Ringan'
  | 'K3 & Obat P3K'
  | 'Perkakas Kecil & Baut'
  | 'Lain-lain';

export type PettyCashStatus = 'Draft' | 'Menunggu' | 'Disetujui' | 'Ditolak' | 'Dicairkan';

export interface PettyCashEntry extends BaseEntity {
  pettyCashNo: string;
  projectId: string;
  projectName: string;
  requester: string;
  requesterUid?: string;
  amount: number; // Integer Rupiah
  category: PettyCashCategory;
  purpose: string;
  receiptProof: string;
  status: PettyCashStatus;
  submittedAt: string; // ISO 8601 UTC
  reviewedBy?: string;
  reviewedByUid?: string;
  reviewedAt?: string; // ISO 8601 UTC
  disbursedBy?: string;
  disbursedByUid?: string;
  disbursedAt?: string; // ISO 8601 UTC
  rejectionReason?: string;
}

export interface TeamMember extends BaseEntity {
  name: string;
  nip: string;
  role: string;
  department: string;
  email: string;
  phone: string;
  assignedProjectIds?: string[]; // Standard array ID proyek (e.g. ['prj-001', 'prj-002'] or ['*'])
  assignedProjects?: string[]; // Backward compatibility accessor
  status: 'Aktif' | 'Di Lapangan' | 'Cuti' | 'Nonaktif';
  lastActive: string; // ISO 8601 UTC
  permissions: {
    canViewBudget: boolean;
    canEditBudget: boolean;
    canApprovePO: boolean;
    canCreateFieldReport: boolean;
  };
}

export interface NotificationItem extends BaseEntity {
  title: string;
  message: string;
  timestamp: string; // ISO 8601 UTC
  type: 'warning' | 'info' | 'success' | 'alert';
  read: boolean;
  recipientUid?: string;
  targetScreen?: string;
  targetRoles?: string[];
  projectId?: string;
  dedupKey?: string;
}

export interface ProjectActivity extends BaseEntity {
  projectId: string;
  projectName: string;
  user: string;
  action: string;
  timestamp: string; // ISO 8601 UTC
  type: 'progress' | 'cost' | 'material' | 'report' | 'milestone';
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: string;
  department: string;
  nip: string;
  workspaceId: string;
  assignedProjectIds: string[]; // Standard array ID proyek
  assignedProjects?: string[]; // Backward compatibility accessor
  status?: 'Aktif' | 'Nonaktif';
  createdAt?: string; // ISO 8601 UTC
  updatedAt?: string; // ISO 8601 UTC
}

export * from './rbac';
export * from '../schemas';
