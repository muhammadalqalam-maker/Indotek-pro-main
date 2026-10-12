export type AppRole =
  | 'Owner / Director'
  | 'Project Manager'
  | 'Site Manager / Supervisor'
  | 'Quantity Surveyor / Estimator'
  | 'Finance / Accounting'
  | 'Procurement'
  | 'Warehouse / Inventory'
  | 'Read-only Auditor';

export const DB_ROLE_TO_APP_ROLE: Record<string, AppRole> = {
  owner: 'Owner / Director',
  project_manager: 'Project Manager',
  site_manager: 'Site Manager / Supervisor',
  quantity_surveyor: 'Quantity Surveyor / Estimator',
  finance: 'Finance / Accounting',
  procurement: 'Procurement',
  warehouse: 'Warehouse / Inventory',
  auditor: 'Read-only Auditor',
};

export type AppModule =
  | 'projects'
  | 'budget'
  | 'schedule'
  | 'materials'
  | 'procurement'
  | 'field_reports'
  | 'team'
  | 'audit'
  | 'reports'
  | 'settings';

export type AppAction =
  | 'view'
  | 'create'
  | 'edit'
  | 'submit'
  | 'approve'
  | 'reject'
  | 'archive'
  | 'export';

export interface RolePermissions {
  role: AppRole;
  displayName: string;
  department: string;
  description: string;
  modules: {
    [key in AppModule]: {
      canView: boolean;
      canCreate: boolean;
      canEdit: boolean;
      canSubmit: boolean;
      canApprove: boolean;
      canReject: boolean;
      canArchive: boolean;
      canExport: boolean;
    };
  };
  approvalAuthorities: {
    budgetRevision: boolean;
    purchaseRequest: boolean;
    purchaseOrder: boolean;
    stockAdjustment: boolean;
    fieldReport: boolean;
    milestoneSignOff: boolean;
    roleManagement: boolean;
    pettyCash: boolean;
  };
}

export type AuditActionType =
  | 'PROJECT_CREATED'
  | 'PROJECT_UPDATED'
  | 'PROJECT_ARCHIVED'
  | 'BUDGET_REVISED'
  | 'BUDGET_APPROVED'
  | 'BUDGET_REJECTED'
  | 'PO_CREATED'
  | 'PO_SUBMITTED'
  | 'PO_APPROVED'
  | 'PO_REJECTED'
  | 'STOCK_ADJUSTED'
  | 'STOCK_ADJUSTMENT_SUBMITTED'
  | 'STOCK_ADJUSTMENT_APPROVED'
  | 'STOCK_ADJUSTMENT_REJECTED'
  | 'STOCK_MUTATION_RECORDED'
  | 'FIELD_REPORT_SUBMITTED'
  | 'FIELD_REPORT_VERIFIED'
  | 'FIELD_REPORT_APPROVED'
  | 'MILESTONE_SIGNED_OFF'
  | 'SCHEDULE_UPDATED'
  | 'ROLE_MODIFIED'
  | 'SYSTEM_SETTINGS_MODIFIED'
  | 'MEMBER_INVITED'
  | 'MEMBER_ROLE_CHANGED'
  | 'MEMBER_STATUS_CHANGED'
  | 'MEMBER_PROJECTS_UPDATED'
  | 'PETTY_CASH_SUBMITTED'
  | 'PETTY_CASH_APPROVED'
  | 'PETTY_CASH_REJECTED'
  | 'PETTY_CASH_DISBURSED';

export interface AuditLogEntry {
  id: string;
  action: AuditActionType;
  actor: {
    uid: string;
    name: string;
    email: string;
    role: AppRole;
  };
  workspaceId: string;
  projectId?: string;
  projectName?: string;
  recordType:
    | 'project'
    | 'purchase_order'
    | 'budget'
    | 'material'
    | 'field_report'
    | 'team_member'
    | 'milestone'
    | 'petty_cash'
    | 'stock_adjustment'
    | 'settings'
    | 'system';
  recordId: string;
  details: string;
  previousValue?: string;
  newValue?: string;
  metadata?: Record<string, any>;
  timestamp: string;
  correlationId: string;
}

export type WorkflowStatus =
  | 'Draft'
  | 'Menunggu'
  | 'Diverifikasi'
  | 'Disetujui'
  | 'Ditolak'
  | 'Perlu Revisi'
  | 'Selesai';
