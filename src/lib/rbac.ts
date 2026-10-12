import { AppRole, AppModule, AppAction, RolePermissions } from '../types/rbac';

export const ALL_ROLES: AppRole[] = [
  'Owner / Director',
  'Project Manager',
  'Site Manager / Supervisor',
  'Quantity Surveyor / Estimator',
  'Finance / Accounting',
  'Procurement',
  'Warehouse / Inventory',
  'Read-only Auditor',
];

const DEFAULT_NO_ACCESS = {
  canView: false,
  canCreate: false,
  canEdit: false,
  canSubmit: false,
  canApprove: false,
  canReject: false,
  canArchive: false,
  canExport: false,
};

const READ_ONLY_ACCESS = {
  canView: true,
  canCreate: false,
  canEdit: false,
  canSubmit: false,
  canApprove: false,
  canReject: false,
  canArchive: false,
  canExport: true,
};

const FULL_ACCESS = {
  canView: true,
  canCreate: true,
  canEdit: true,
  canSubmit: true,
  canApprove: true,
  canReject: true,
  canArchive: true,
  canExport: true,
};

export const ROLE_DEFINITIONS: Record<AppRole, RolePermissions> = {
  'Owner / Director': {
    role: 'Owner / Director',
    displayName: 'Owner / Direktur Utama',
    department: 'Direksi & Eksekutif',
    description: 'Akses penuh ke seluruh operasional, keuangan, tata kelola, dan otoritas persetujuan tertinggi.',
    modules: {
      projects: FULL_ACCESS,
      budget: FULL_ACCESS,
      schedule: FULL_ACCESS,
      materials: FULL_ACCESS,
      procurement: FULL_ACCESS,
      field_reports: FULL_ACCESS,
      team: FULL_ACCESS,
      audit: READ_ONLY_ACCESS,
      reports: FULL_ACCESS,
      settings: FULL_ACCESS,
    },
    approvalAuthorities: {
      budgetRevision: true,
      purchaseRequest: true,
      purchaseOrder: true,
      stockAdjustment: true,
      fieldReport: true,
      milestoneSignOff: true,
      roleManagement: true,
      pettyCash: true,
    },
  },

  'Project Manager': {
    role: 'Project Manager',
    displayName: 'Manajer Proyek (PM)',
    department: 'Manajemen Lapangan & Operasi',
    description: 'Pengendali operasional proyek yang ditugaskan, penjadwalan, progress, serta pengajuan RAB dan PO.',
    modules: {
      projects: { ...FULL_ACCESS, canArchive: false },
      budget: { ...FULL_ACCESS, canApprove: true, canArchive: false },
      schedule: FULL_ACCESS,
      materials: { ...FULL_ACCESS, canArchive: false },
      procurement: { ...FULL_ACCESS, canApprove: true, canArchive: false },
      field_reports: FULL_ACCESS,
      team: { ...READ_ONLY_ACCESS, canExport: false },
      audit: READ_ONLY_ACCESS,
      reports: FULL_ACCESS,
      settings: READ_ONLY_ACCESS,
    },
    approvalAuthorities: {
      budgetRevision: true,
      purchaseRequest: true,
      purchaseOrder: true,
      stockAdjustment: true,
      fieldReport: true,
      milestoneSignOff: true,
      roleManagement: false,
      pettyCash: true,
    },
  },

  'Site Manager / Supervisor': {
    role: 'Site Manager / Supervisor',
    displayName: 'Site Manager / Pengawas Lapangan',
    department: 'Teknik & Pengawasan Lapangan',
    description: 'Pencatatan laporan harian, mutasi material terpasang, pemantauan kurva-S fisik, dan K3.',
    modules: {
      projects: READ_ONLY_ACCESS,
      budget: { ...DEFAULT_NO_ACCESS, canView: true },
      schedule: { ...READ_ONLY_ACCESS, canEdit: true },
      materials: { canView: true, canCreate: true, canEdit: true, canSubmit: true, canApprove: false, canReject: false, canArchive: false, canExport: true },
      procurement: { canView: true, canCreate: true, canEdit: false, canSubmit: true, canApprove: false, canReject: false, canArchive: false, canExport: false },
      field_reports: { ...FULL_ACCESS, canArchive: false },
      team: { ...DEFAULT_NO_ACCESS, canView: true },
      audit: DEFAULT_NO_ACCESS,
      reports: READ_ONLY_ACCESS,
      settings: DEFAULT_NO_ACCESS,
    },
    approvalAuthorities: {
      budgetRevision: false,
      purchaseRequest: false,
      purchaseOrder: false,
      stockAdjustment: true,
      fieldReport: true,
      milestoneSignOff: false,
      roleManagement: false,
      pettyCash: false,
    },
  },

  'Quantity Surveyor / Estimator': {
    role: 'Quantity Surveyor / Estimator',
    displayName: 'Quantity Surveyor (QS)',
    department: 'Estimasi Biaya & Pengendalian Anggaran',
    description: 'Pengendali rincian RAB, volume BOQ, opname pekerjaan, dan pengajuan revisi anggaran.',
    modules: {
      projects: READ_ONLY_ACCESS,
      budget: { canView: true, canCreate: true, canEdit: true, canSubmit: true, canApprove: false, canReject: false, canArchive: false, canExport: true },
      schedule: READ_ONLY_ACCESS,
      materials: READ_ONLY_ACCESS,
      procurement: { canView: true, canCreate: true, canEdit: false, canSubmit: true, canApprove: false, canReject: false, canArchive: false, canExport: true },
      field_reports: READ_ONLY_ACCESS,
      team: DEFAULT_NO_ACCESS,
      audit: DEFAULT_NO_ACCESS,
      reports: FULL_ACCESS,
      settings: DEFAULT_NO_ACCESS,
    },
    approvalAuthorities: {
      budgetRevision: false,
      purchaseRequest: false,
      purchaseOrder: false,
      stockAdjustment: false,
      fieldReport: false,
      milestoneSignOff: false,
      roleManagement: false,
      pettyCash: false,
    },
  },

  'Finance / Accounting': {
    role: 'Finance / Accounting',
    displayName: 'Keuangan & Akuntansi',
    department: 'Keuangan Perusahaan',
    description: 'Otoritas verifikasi pembayaran, approval PO, audit kas proyek, dan rekonsiliasi biaya riil.',
    modules: {
      projects: READ_ONLY_ACCESS,
      budget: { canView: true, canCreate: false, canEdit: true, canSubmit: true, canApprove: true, canReject: true, canArchive: false, canExport: true },
      schedule: READ_ONLY_ACCESS,
      materials: READ_ONLY_ACCESS,
      procurement: { canView: true, canCreate: false, canEdit: true, canSubmit: true, canApprove: true, canReject: true, canArchive: false, canExport: true },
      field_reports: READ_ONLY_ACCESS,
      team: READ_ONLY_ACCESS,
      audit: READ_ONLY_ACCESS,
      reports: FULL_ACCESS,
      settings: READ_ONLY_ACCESS,
    },
    approvalAuthorities: {
      budgetRevision: true,
      purchaseRequest: true,
      purchaseOrder: true,
      stockAdjustment: false,
      fieldReport: false,
      milestoneSignOff: false,
      roleManagement: false,
      pettyCash: true,
    },
  },

  'Procurement': {
    role: 'Procurement',
    displayName: 'Pengadaan & Logistik Vendor',
    department: 'Pengadaan Barang & Jasa',
    description: 'Pembuatan SPP, komparasi vendor suplai, negosiasi harga, penerbitan PO, dan tracking pengiriman.',
    modules: {
      projects: READ_ONLY_ACCESS,
      budget: { ...DEFAULT_NO_ACCESS, canView: true },
      schedule: READ_ONLY_ACCESS,
      materials: { canView: true, canCreate: true, canEdit: true, canSubmit: true, canApprove: false, canReject: false, canArchive: false, canExport: true },
      procurement: { canView: true, canCreate: true, canEdit: true, canSubmit: true, canApprove: false, canReject: false, canArchive: false, canExport: true },
      field_reports: DEFAULT_NO_ACCESS,
      team: DEFAULT_NO_ACCESS,
      audit: DEFAULT_NO_ACCESS,
      reports: READ_ONLY_ACCESS,
      settings: DEFAULT_NO_ACCESS,
    },
    approvalAuthorities: {
      budgetRevision: false,
      purchaseRequest: false,
      purchaseOrder: false,
      stockAdjustment: false,
      fieldReport: false,
      milestoneSignOff: false,
      roleManagement: false,
      pettyCash: false,
    },
  },

  'Warehouse / Inventory': {
    role: 'Warehouse / Inventory',
    displayName: 'Kepala Gudang & Inventaris',
    department: 'Logistik Gudang & Material',
    description: 'Penerimaan barang dari supplier, penerbitan surat jalan keluar, dan opname stok fisik.',
    modules: {
      projects: READ_ONLY_ACCESS,
      budget: DEFAULT_NO_ACCESS,
      schedule: DEFAULT_NO_ACCESS,
      materials: { canView: true, canCreate: true, canEdit: true, canSubmit: true, canApprove: true, canReject: false, canArchive: false, canExport: true },
      procurement: { canView: true, canCreate: false, canEdit: false, canSubmit: false, canApprove: false, canReject: false, canArchive: false, canExport: true },
      field_reports: DEFAULT_NO_ACCESS,
      team: DEFAULT_NO_ACCESS,
      audit: DEFAULT_NO_ACCESS,
      reports: READ_ONLY_ACCESS,
      settings: DEFAULT_NO_ACCESS,
    },
    approvalAuthorities: {
      budgetRevision: false,
      purchaseRequest: false,
      purchaseOrder: false,
      stockAdjustment: true,
      fieldReport: false,
      milestoneSignOff: false,
      roleManagement: false,
      pettyCash: false,
    },
  },

  'Read-only Auditor': {
    role: 'Read-only Auditor',
    displayName: 'Auditor Eksternal / Pengawas',
    department: 'Audit Independen & Kepatuhan',
    description: 'Akses inspeksi pembacaan dokumen dan log audit secara menyeluruh tanpa wewenang mutasi.',
    modules: {
      projects: READ_ONLY_ACCESS,
      budget: READ_ONLY_ACCESS,
      schedule: READ_ONLY_ACCESS,
      materials: READ_ONLY_ACCESS,
      procurement: READ_ONLY_ACCESS,
      field_reports: READ_ONLY_ACCESS,
      team: READ_ONLY_ACCESS,
      audit: READ_ONLY_ACCESS,
      reports: READ_ONLY_ACCESS,
      settings: READ_ONLY_ACCESS,
    },
    approvalAuthorities: {
      budgetRevision: false,
      purchaseRequest: false,
      purchaseOrder: false,
      stockAdjustment: false,
      fieldReport: false,
      milestoneSignOff: false,
      roleManagement: false,
      pettyCash: false,
    },
  },
};

/**
 * Checks whether a given role can perform an action on a module.
 */
export function canRolePerform(
  role: AppRole | string,
  module: AppModule,
  action: AppAction
): boolean {
  const roleConfig = ROLE_DEFINITIONS[role as AppRole];
  if (!roleConfig) return false;

  const mod = roleConfig.modules[module];
  if (!mod) return false;

  switch (action) {
    case 'view':
      return mod.canView;
    case 'create':
      return mod.canCreate;
    case 'edit':
      return mod.canEdit;
    case 'submit':
      return mod.canSubmit;
    case 'approve':
      return mod.canApprove;
    case 'reject':
      return mod.canReject;
    case 'archive':
      return mod.canArchive;
    case 'export':
      return mod.canExport;
    default:
      return false;
  }
}

/**
 * Checks if a user has approval authority for a specific business domain.
 */
export function hasApprovalAuthority(
  role: AppRole | string,
  authority: keyof RolePermissions['approvalAuthorities']
): boolean {
  const roleConfig = ROLE_DEFINITIONS[role as AppRole];
  if (!roleConfig) return false;
  return Boolean(roleConfig.approvalAuthorities[authority]);
}

/**
 * Determines if a user role has company-wide unrestricted project visibility.
 */
export function hasGlobalProjectAccess(role: AppRole | string): boolean {
  return role === 'Owner / Director' || role === 'Read-only Auditor' || role === 'Finance / Accounting';
}

/**
 * Checks if a member is authorized to access or modify a specific project by exact ID.
 * Strictly eliminates substring/fuzzy includes() matching.
 */
export function isUserAssignedToProject(
  role: AppRole | string,
  assignedProjectIds: string[] | undefined,
  projectId: string
): boolean {
  if (hasGlobalProjectAccess(role)) return true;
  if (!assignedProjectIds || assignedProjectIds.length === 0) return false;
  if (assignedProjectIds.includes('*')) return true;
  return assignedProjectIds.includes(projectId);
}
