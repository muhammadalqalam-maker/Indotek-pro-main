/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

/**
 * Standard UTC ISO-8601 string validator.
 * Enforces standardized timestamp representations across client, server, and tests.
 */
export const IsoUtcStringSchema = z
  .string()
  .refine(
    (val) => !isNaN(Date.parse(val)),
    { message: 'Harus berupa format tanggal ISO 8601 UTC yang valid.' }
  );

/**
 * Standard Indonesian Rupiah integer validator.
 * Rejects floating-point decimals, fractions, or negative values.
 */
export const CurrencyRupiahSchema = z
  .number()
  .int({ message: 'Nilai mata uang harus berupa bilangan bulat integer (tanpa desimal/sen).' })
  .nonnegative({ message: 'Nilai mata uang tidak boleh negatif.' });

/**
 * Base document schema enforced on all multi-tenant Firestore documents.
 */
export const BaseEntitySchema = z.object({
  id: z.string().min(1, 'ID dokumen wajib diisi.'),
  workspaceId: z.string().min(1, 'workspaceId wajib diisi.'),
  createdAt: IsoUtcStringSchema,
  createdBy: z.string().min(1, 'createdBy UID wajib diisi.'),
  updatedAt: IsoUtcStringSchema,
  updatedBy: z.string().min(1, 'updatedBy UID wajib diisi.'),
  schemaVersion: z.number().int().default(2),
});

export type BaseEntity = z.infer<typeof BaseEntitySchema>;

// =============================================================================
// 1. PROJECT & SUBCOLLECTION SCHEMAS
// =============================================================================

export const ProjectCategorySchema = z.enum([
  'Komersial',
  'Infrastruktur',
  'Residensial',
  'Industri',
]);

export const ProjectStatusSchema = z.enum([
  'Berjalan',
  'Selesai',
  'Tertunda',
  'Pra-Konstruksi',
]);

export const ScheduleHealthSchema = z.enum([
  'Tepat Waktu',
  'Kritis',
  'Terlambat',
]);

export const ProjectSchema = BaseEntitySchema.extend({
  code: z.string().min(1),
  name: z.string().min(1),
  client: z.string().min(1),
  category: ProjectCategorySchema,
  location: z.string().min(1),
  projectManager: z.string().min(1),
  siteEngineer: z.string().min(1),
  contractValue: CurrencyRupiahSchema,
  approvedBudget: CurrencyRupiahSchema,
  actualCost: CurrencyRupiahSchema,
  startDate: IsoUtcStringSchema,
  targetEndDate: IsoUtcStringSchema,
  progressActual: z.number().min(0).max(100),
  progressPlanned: z.number().min(0).max(100),
  status: ProjectStatusSchema,
  scheduleStatus: ScheduleHealthSchema,
  image: z.string().optional(),
  description: z.string().default(''),
  totalMilestones: z.number().int().nonnegative().default(0),
  completedMilestones: z.number().int().nonnegative().default(0),
});

export type ProjectEntity = z.infer<typeof ProjectSchema>;

// Subcollection: workspaces/{wsId}/projects/{pid}/budget_lines/{lineId}
export const BudgetLineCategorySchema = z.enum([
  'Pekerjaan Struktur',
  'Pekerjaan Arsitektur',
  'Pekerjaan MEP',
  'Pekerjaan Persiapan',
  'Manajemen & Overhead',
]);

export const BudgetLineStatusSchema = z.enum(['Aman', 'Peringatan', 'Overbudget']);

export const BudgetLineSchema = BaseEntitySchema.extend({
  projectId: z.string().min(1),
  code: z.string().min(1),
  divisionName: z.string().min(1),
  category: BudgetLineCategorySchema,
  plannedAmount: CurrencyRupiahSchema,
  actualAmount: CurrencyRupiahSchema,
  unit: z.string().min(1),
  volume: z.number().nonnegative(),
  unitRate: CurrencyRupiahSchema,
  varianceAmount: z.number().int(), // Can be negative or positive integer
  variancePercent: z.number(),
  status: BudgetLineStatusSchema,
});

export type BudgetLineEntity = z.infer<typeof BudgetLineSchema>;

// Subcollection: workspaces/{wsId}/projects/{pid}/milestones/{milestoneId}
export const MilestoneStatusSchema = z.enum(['Selesai', 'Berjalan', 'Menunggu', 'Terlambat']);

export const MilestoneSchema = BaseEntitySchema.extend({
  projectId: z.string().min(1),
  title: z.string().min(1),
  wbsCode: z.string().min(1),
  plannedDate: IsoUtcStringSchema,
  actualDate: IsoUtcStringSchema.optional(),
  progress: z.number().min(0).max(100),
  status: MilestoneStatusSchema,
  weightPercent: z.number().min(0).max(100),
  signedOffBy: z.string().optional(),
  signedOffByUid: z.string().optional(),
  signedOffAt: IsoUtcStringSchema.optional(),
  bastRef: z.string().optional(),
});

export type MilestoneEntity = z.infer<typeof MilestoneSchema>;

// Subcollection: workspaces/{wsId}/projects/{pid}/wbs_items/{wbsId}
export const WBSItemStatusSchema = z.enum(['Selesai', 'Berjalan', 'Terlambat', 'Belum Mulai']);

export const WBSItemSchema = BaseEntitySchema.extend({
  projectId: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  durationDays: z.number().int().nonnegative(),
  startDate: IsoUtcStringSchema,
  endDate: IsoUtcStringSchema,
  plannedProgress: z.number().min(0).max(100),
  actualProgress: z.number().min(0).max(100),
  status: WBSItemStatusSchema,
  criticalPath: z.boolean().default(false),
  assignedTeam: z.string().default(''),
});

export type WBSItemEntity = z.infer<typeof WBSItemSchema>;

// Subcollection: workspaces/{wsId}/projects/{pid}/activities/{activityId}
export const ProjectActivitySchema = BaseEntitySchema.extend({
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  user: z.string().min(1),
  action: z.string().min(1),
  timestamp: IsoUtcStringSchema,
  type: z.enum(['progress', 'cost', 'material', 'report', 'milestone']),
});

export type ProjectActivityEntity = z.infer<typeof ProjectActivitySchema>;

// =============================================================================
// 2. MATERIALS & STOCK SCHEMAS
// =============================================================================

export const MaterialCategorySchema = z.enum([
  'Semen & Pasir',
  'Besi & Baja',
  'Beton Readymix',
  'Arsitektural',
  'MEP & Utilitas',
]);

export const MaterialStatusSchema = z.enum(['Aman', 'Menipis', 'Kritis']);

export const MaterialItemSchema = BaseEntitySchema.extend({
  code: z.string().min(1),
  name: z.string().min(1),
  specification: z.string().default(''),
  category: MaterialCategorySchema,
  unit: z.string().min(1),
  currentStock: z.number().int().nonnegative(),
  minStock: z.number().int().nonnegative(),
  allocatedProject: z.string().default(''),
  allocatedProjectId: z.string().optional(),
  warehouseLocation: z.string().default(''),
  primarySupplier: z.string().default(''),
  unitPrice: CurrencyRupiahSchema,
  lastRestocked: IsoUtcStringSchema,
  status: MaterialStatusSchema,
});

export type MaterialItemEntity = z.infer<typeof MaterialItemSchema>;

export const StockMutationSchema = BaseEntitySchema.extend({
  materialId: z.string().min(1),
  materialName: z.string().min(1),
  date: IsoUtcStringSchema,
  type: z.enum(['Masuk', 'Keluar']),
  quantity: z.number().int().positive(),
  unit: z.string().min(1),
  referenceNo: z.string().min(1),
  projectId: z.string().optional(),
  project: z.string().default(''),
  handler: z.string().min(1),
});

export type StockMutationEntity = z.infer<typeof StockMutationSchema>;

export const StockAdjustmentStatusSchema = z.enum(['Menunggu', 'Disetujui', 'Ditolak']);

export const StockAdjustmentSchema = BaseEntitySchema.extend({
  adjustmentNo: z.string().min(1),
  materialId: z.string().min(1),
  materialName: z.string().min(1),
  materialCode: z.string().default(''),
  projectId: z.string().min(1),
  projectName: z.string().default(''),
  previousStock: z.number().int().nonnegative(),
  physicalStock: z.number().int().nonnegative(),
  varianceQuantity: z.number().int(), // Can be negative or positive
  unit: z.string().min(1),
  reason: z.enum([
    'Kerusakan Fisik di Site',
    'Susut / Faktor Cuaca',
    'Selisih Bongkar Muat',
    'Retur Pekerjaan Subkon',
    'Koreksi Opname Fisik',
  ]),
  evidenceRef: z.string().default(''),
  submittedBy: z.string().min(1),
  submittedByUid: z.string().min(1),
  submittedAt: IsoUtcStringSchema,
  status: StockAdjustmentStatusSchema,
  reviewedBy: z.string().optional(),
  reviewedByUid: z.string().optional(),
  reviewedAt: IsoUtcStringSchema.optional(),
  rejectionReason: z.string().optional(),
});

export type StockAdjustmentEntity = z.infer<typeof StockAdjustmentSchema>;

// =============================================================================
// 3. PROCUREMENT & FINANCIAL WORKFLOW SCHEMAS
// =============================================================================

export const POStatusSchema = z.enum([
  'Draft',
  'Menunggu',
  'Disetujui',
  'Ditolak',
  'Dikirim',
  'Selesai',
]);

export const PurchaseOrderSchema = BaseEntitySchema.extend({
  poNumber: z.string().min(1),
  sppNumber: z.string().min(1),
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  supplierName: z.string().min(1),
  itemDescription: z.string().min(1),
  quantitySummary: z.string().min(1),
  totalCost: CurrencyRupiahSchema,
  requestDate: IsoUtcStringSchema,
  targetDeliveryDate: IsoUtcStringSchema,
  status: POStatusSchema,
  approvedBy: z.string().optional(),
  approvedByUid: z.string().optional(),
  approvedAt: IsoUtcStringSchema.optional(),
  rejectedBy: z.string().optional(),
  rejectedByUid: z.string().optional(),
  rejectedAt: IsoUtcStringSchema.optional(),
  rejectionReason: z.string().optional(),
  requester: z.string().min(1),
  requesterUid: z.string().min(1),
});

export type PurchaseOrderEntity = z.infer<typeof PurchaseOrderSchema>;

export const BudgetRevisionStatusSchema = z.enum([
  'Draft',
  'Menunggu',
  'Disetujui',
  'Ditolak',
]);

export const BudgetRevisionSchema = BaseEntitySchema.extend({
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  revisionNumber: z.string().min(1),
  title: z.string().min(1),
  divisionName: z.string().min(1),
  originalAmount: CurrencyRupiahSchema,
  proposedAmount: CurrencyRupiahSchema,
  varianceAmount: z.number().int(), // Can be positive or negative
  justification: z.string().min(1),
  status: BudgetRevisionStatusSchema,
  submittedBy: z.string().min(1),
  submittedByUid: z.string().min(1),
  submittedAt: IsoUtcStringSchema,
  reviewedBy: z.string().optional(),
  reviewedByUid: z.string().optional(),
  reviewedAt: IsoUtcStringSchema.optional(),
  rejectionReason: z.string().optional(),
});

export type BudgetRevisionEntity = z.infer<typeof BudgetRevisionSchema>;

export const PettyCashCategorySchema = z.enum([
  'Konsumsi & Lembur',
  'BBM & Logistik Ringan',
  'K3 & Obat P3K',
  'Perkakas Kecil & Baut',
  'Lain-lain',
]);

export const PettyCashStatusSchema = z.enum([
  'Draft',
  'Menunggu',
  'Disetujui',
  'Ditolak',
  'Dicairkan',
]);

export const PettyCashEntrySchema = BaseEntitySchema.extend({
  pettyCashNo: z.string().min(1),
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  requester: z.string().min(1),
  requesterUid: z.string().min(1),
  amount: CurrencyRupiahSchema,
  category: PettyCashCategorySchema,
  purpose: z.string().min(1),
  receiptProof: z.string().default(''),
  status: PettyCashStatusSchema,
  submittedAt: IsoUtcStringSchema,
  reviewedBy: z.string().optional(),
  reviewedByUid: z.string().optional(),
  reviewedAt: IsoUtcStringSchema.optional(),
  disbursedBy: z.string().optional(),
  disbursedByUid: z.string().optional(),
  disbursedAt: IsoUtcStringSchema.optional(),
  rejectionReason: z.string().optional(),
});

export type PettyCashEntryEntity = z.infer<typeof PettyCashEntrySchema>;

// =============================================================================
// 4. FIELD REPORT SCHEMAS
// =============================================================================

export const FieldReportStatusSchema = z.enum([
  'Draft',
  'Diverifikasi',
  'Disetujui',
  'Perlu Revisi',
]);

export const WeatherConditionSchema = z.enum([
  'Cerah',
  'Berawan',
  'Hujan Ringan',
  'Hujan Deras',
]);

export const WorkforceEntrySchema = z.object({
  role: z.string().min(1),
  count: z.number().int().nonnegative(),
});

export const FieldReportSchema = BaseEntitySchema.extend({
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  reportNumber: z.string().min(1),
  date: IsoUtcStringSchema,
  weatherMorning: WeatherConditionSchema,
  weatherAfternoon: WeatherConditionSchema,
  workingHours: z.number().nonnegative(),
  siteSupervisor: z.string().min(1),
  siteSupervisorUid: z.string().min(1),
  workforce: z.array(WorkforceEntrySchema).default([]),
  completedWorks: z.array(z.string()).default([]),
  materialsUsed: z.array(z.object({ name: z.string(), quantity: z.string() })).default([]),
  equipmentUsed: z.array(z.object({ name: z.string(), hours: z.number() })).default([]),
  blockers: z.string().optional(),
  status: FieldReportStatusSchema,
  verifiedBy: z.string().optional(),
  verifiedByUid: z.string().optional(),
  verifiedAt: IsoUtcStringSchema.optional(),
  approvedBy: z.string().optional(),
  approvedByUid: z.string().optional(),
  approvedAt: IsoUtcStringSchema.optional(),
  reviewerNotes: z.string().optional(),
  photos: z.array(z.object({ url: z.string(), caption: z.string() })).default([]),
});

export type FieldReportEntity = z.infer<typeof FieldReportSchema>;

// =============================================================================
// 5. MEMBERSHIP, AUDIT, NOTIFICATIONS & COUNTERS
// =============================================================================

export const AppRoleSchema = z.enum([
  'Owner / Director',
  'Project Manager',
  'Site Manager / Supervisor',
  'Quantity Surveyor / Estimator',
  'Finance / Accounting',
  'Procurement',
  'Warehouse / Inventory',
  'Read-only Auditor',
]);

export const WorkspaceMemberSchema = BaseEntitySchema.extend({
  uid: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  nip: z.string().default(''),
  role: AppRoleSchema,
  department: z.string().default(''),
  phone: z.string().default(''),
  assignedProjectIds: z.array(z.string()).default([]),
  status: z.enum(['Aktif', 'Di Lapangan', 'Cuti', 'Nonaktif']),
  lastActive: IsoUtcStringSchema,
});

export type WorkspaceMemberEntity = z.infer<typeof WorkspaceMemberSchema>;

export const AuditLogEntrySchema = BaseEntitySchema.extend({
  action: z.string().min(1),
  actor: z.object({
    uid: z.string().min(1),
    name: z.string().min(1),
    email: z.string().email(),
    role: z.string().min(1),
  }),
  projectId: z.string().default(''),
  projectName: z.string().default(''),
  recordType: z.string().min(1),
  recordId: z.string().min(1),
  details: z.string().min(1),
  previousValue: z.string().default(''),
  newValue: z.string().default(''),
  metadata: z.record(z.string(), z.any()).default({}),
  timestamp: IsoUtcStringSchema,
  correlationId: z.string().default(''),
  ipAddress: z.string().optional(),
});

export type AuditLogEntryEntity = z.infer<typeof AuditLogEntrySchema>;

export const NotificationItemSchema = BaseEntitySchema.extend({
  title: z.string().min(1),
  message: z.string().min(1),
  timestamp: IsoUtcStringSchema,
  type: z.enum(['warning', 'info', 'success', 'alert']),
  read: z.boolean().default(false),
  recipientUid: z.string().min(1),
  targetScreen: z.string().optional(),
  targetRoles: z.array(z.string()).optional(),
  projectId: z.string().optional(),
  dedupKey: z.string().optional(),
});

export type NotificationItemEntity = z.infer<typeof NotificationItemSchema>;

export const DocumentCounterSchema = z.object({
  workspaceId: z.string().min(1),
  year: z.string().min(4),
  docType: z.enum(['PO', 'ADD-REV', 'LHP', 'KAS', 'ADJ']),
  lastNumber: z.number().int().nonnegative(),
  updatedAt: IsoUtcStringSchema,
});

export type DocumentCounterEntity = z.infer<typeof DocumentCounterSchema>;

// =============================================================================
// 6. WORKFLOW ENDPOINT REQUEST SCHEMAS (Strict Mode - Reject Unknown Fields)
// =============================================================================

export const PurchaseOrderActionRequestSchema = z
  .object({
    action: z.enum(['create', 'approve', 'reject']),
    poId: z.string().optional(),
    rejectionReason: z.string().optional(),
    poData: z.record(z.string(), z.any()).optional(),
    idempotencyKey: z.string().optional(),
  })
  .strict();

export type PurchaseOrderActionRequest = z.infer<typeof PurchaseOrderActionRequestSchema>;

export const BudgetRevisionActionRequestSchema = z
  .object({
    action: z.enum(['create', 'approve', 'reject']),
    revId: z.string().optional(),
    rejectionReason: z.string().optional(),
    revData: z.record(z.string(), z.any()).optional(),
    idempotencyKey: z.string().optional(),
  })
  .strict();

export type BudgetRevisionActionRequest = z.infer<typeof BudgetRevisionActionRequestSchema>;

export const StockAdjustmentActionRequestSchema = z
  .object({
    action: z.enum(['create', 'approve', 'reject']),
    adjId: z.string().optional(),
    rejectionReason: z.string().optional(),
    adjData: z.record(z.string(), z.any()).optional(),
    idempotencyKey: z.string().optional(),
  })
  .strict();

export type StockAdjustmentActionRequest = z.infer<typeof StockAdjustmentActionRequestSchema>;

export const StockMutationActionRequestSchema = z
  .object({
    materialId: z.string().min(1, 'materialId wajib diisi.'),
    type: z.enum(['Masuk', 'Keluar']),
    quantity: z.number().positive('quantity harus berupa angka positif.'),
    referenceNo: z.string().min(1, 'referenceNo wajib diisi.'),
    project: z.string().optional(),
    handler: z.string().optional(),
    idempotencyKey: z.string().optional(),
  })
  .strict();

export type StockMutationActionRequest = z.infer<typeof StockMutationActionRequestSchema>;

export const PettyCashActionRequestSchema = z
  .object({
    action: z.enum(['create', 'approve', 'reject', 'disburse']),
    cashId: z.string().optional(),
    rejectionReason: z.string().optional(),
    cashData: z.record(z.string(), z.any()).optional(),
    idempotencyKey: z.string().optional(),
  })
  .strict();

export type PettyCashActionRequest = z.infer<typeof PettyCashActionRequestSchema>;

export const FieldReportActionRequestSchema = z
  .object({
    action: z.enum(['create', 'verify', 'approve', 'revise']),
    reportId: z.string().optional(),
    reviewerNotes: z.string().optional(),
    reportData: z.record(z.string(), z.any()).optional(),
    idempotencyKey: z.string().optional(),
  })
  .strict();

export type FieldReportActionRequest = z.infer<typeof FieldReportActionRequestSchema>;

export const MilestoneSignOffActionRequestSchema = z
  .object({
    milestoneId: z.string().min(1, 'milestoneId wajib diisi.'),
    projectId: z.string().optional(),
    bastRef: z.string().min(1, 'bastRef wajib diisi.'),
    notes: z.string().optional(),
    idempotencyKey: z.string().optional(),
  })
  .strict();

export type MilestoneSignOffActionRequest = z.infer<typeof MilestoneSignOffActionRequestSchema>;

export const DocumentNumberActionRequestSchema = z
  .object({
    type: z.enum(['PO', 'ADD-REV', 'LHP', 'KAS', 'ADJ']),
    projectCodeOrAbbr: z.string().optional(),
    year: z.string().optional(),
    idempotencyKey: z.string().optional(),
  })
  .strict();

export type DocumentNumberActionRequest = z.infer<typeof DocumentNumberActionRequestSchema>;

