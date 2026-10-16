/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Enterprise Multi-Tenant Orchestrator Application Context
 * Modularized domain architecture composed of:
 * - UIContext: Navigation, toasts, settings, dialogs, audit log
 * - ProjectsContext: Projects, WBS, milestones, RAB lines, activities
 * - BudgetContext: Budget revisions, addenda, and site petty cash
 * - MaterialsContext: Inventory materials, stock mutations, stock opname adjustments
 * - ProcurementContext: Purchase orders & approval pipelines
 * - FieldReportsContext: Daily site reports & verification
 * - TeamContext: Personnel management & RBAC governance
 */

import React, { ReactNode } from 'react';
import {
  Project,
  PurchaseOrder,
  MaterialItem,
  FieldReport,
  NotificationItem,
  StockMutation,
  TeamMember,
  ProjectActivity,
  AuditLogEntry,
  AuditActionType,
  BudgetRevision,
  PettyCashEntry,
  StockAdjustment,
  AppRole,
  FieldReportStatus,
  BudgetLine,
  Milestone,
  WBSItem,
  BudgetVersion
} from '../types';
import { AppSettings } from '../services/dataService';
import { UIProvider, useUI, ScreenId, ToastMessage } from './UIContext';
import { ProjectsProvider, useProjects } from './ProjectsContext';
import { BudgetProvider, useBudget } from './BudgetContext';
import { MaterialsProvider, useMaterials } from './MaterialsContext';
import { ProcurementProvider, useProcurement } from './ProcurementContext';
import { FieldReportsProvider, useFieldReports } from './FieldReportsContext';
import { TeamProvider, useTeam } from './TeamContext';

export type { ScreenId, ToastMessage, AppSettings };
export { useUI, useProjects, useBudget, useMaterials, useProcurement, useFieldReports, useTeam };

export interface AppContextType {
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
  projectDetailTab: string;
  setProjectDetailTab: (tab: string) => void;
  navigateToProjectDetail: (projectId: string, tab?: string) => void;

  globalSearch: string;
  setGlobalSearch: (q: string) => void;

  sidebarCollapsed: boolean;
  setSidebarCollapsed: (c: boolean | ((prev: boolean) => boolean)) => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (o: boolean) => void;
  notificationsOpen: boolean;
  setNotificationsOpen: (o: boolean) => void;

  // Data states (Supabase tables)
  projects: Project[];
  purchaseOrders: PurchaseOrder[];
  materials: MaterialItem[];
  fieldReports: FieldReport[];
  notifications: NotificationItem[];
  stockMutations: StockMutation[];
  teamMembers: TeamMember[];
  activities: ProjectActivity[];
  auditLogs: AuditLogEntry[];
  budgetRevisions: BudgetRevision[];
  pettyCash: PettyCashEntry[];
  stockAdjustments: StockAdjustment[];

  // Active Project Subcollections
  budgetLines: BudgetLine[];
  milestones: Milestone[];
  wbsList: WBSItem[];
  budgetVersions: BudgetVersion[];

  // Action Pending State
  pendingActions: Record<string, boolean>;
  isActionPending: (id: string) => boolean;

  // Loading & Error States
  isLoadingData: boolean;
  loadError: string | null;
  isTabVisible: boolean;
  refreshData: () => Promise<void>;

  // Per-domain loading states
  loadingProjects: boolean;
  setLoadingProjects: (loading: boolean) => void;
  loadingBudget: boolean;
  setLoadingBudget: (loading: boolean) => void;
  loadingMaterials: boolean;
  setLoadingMaterials: (loading: boolean) => void;
  loadingTeam: boolean;
  setLoadingTeam: (loading: boolean) => void;
  loadingFieldReports: boolean;
  setLoadingFieldReports: (loading: boolean) => void;
  loadingProcurement: boolean;
  setLoadingProcurement: (loading: boolean) => void;

  // Workflows & Actions
  addProject: (newProj: Omit<Project, 'id' | 'totalMilestones' | 'completedMilestones'>) => Promise<string>;
  approvePurchaseOrder: (poId: string, approverName: string, overrideReason?: string) => Promise<void>;
  rejectPurchaseOrder: (poId: string, rejectorName: string, reason: string) => Promise<void>;
  addPurchaseOrder: (po: Omit<PurchaseOrder, 'id' | 'poNumber' | 'status'>) => Promise<void>;
  addStockMutation: (mutation: Omit<StockMutation, 'id'>) => Promise<void>;
  submitStockAdjustment: (adj: Omit<StockAdjustment, 'id' | 'adjustmentNo' | 'status' | 'submittedAt'>) => Promise<void>;
  approveStockAdjustment: (adjId: string, approverName: string) => Promise<void>;
  rejectStockAdjustment: (adjId: string, rejectorName: string, reason: string) => Promise<void>;
  addFieldReport: (
    report: Omit<FieldReport, 'id' | 'reportNumber' | 'status'>,
    idempotencyKey?: string
  ) => Promise<string>;
  reviewFieldReport: (reportId: string, reviewerName: string, status: FieldReportStatus, notes?: string) => Promise<void>;

  // Budget Revisions Workflow
  submitBudgetRevision: (rev: Omit<BudgetRevision, 'id' | 'revisionNumber' | 'status' | 'submittedAt'>) => Promise<void>;
  approveBudgetRevision: (revId: string, approverName: string) => Promise<void>;
  rejectBudgetRevision: (revId: string, rejectorName: string, reason: string) => Promise<void>;

  // Petty Cash Workflow
  submitPettyCash: (cash: Omit<PettyCashEntry, 'id' | 'pettyCashNo' | 'status' | 'submittedAt'>) => Promise<void>;
  approvePettyCash: (cashId: string, approverName: string) => Promise<void>;
  rejectPettyCash: (cashId: string, rejectorName: string, reason: string) => Promise<void>;
  disbursePettyCash: (cashId: string, disburserName: string) => Promise<void>;

  // Budget Lines (RAB / BOQ)
  addBudgetLine: (line: Omit<BudgetLine, 'id'>) => Promise<void>;
  updateBudgetLine: (lineId: string, updates: Partial<BudgetLine>) => Promise<void>;

  // Milestones & WBS
  signOffMilestone: (milestoneId: string, milestoneTitle: string, projectName: string, bastRef?: string, notes?: string) => Promise<void>;
  updateWBSProgress: (wbsId: string, actualProgress: number, status: WBSItem['status']) => Promise<void>;

  // Team Management & RBAC
  updateTeamMemberRole: (memberId: string, newRole: AppRole, assignedProjects: string[]) => Promise<void>;
  toggleTeamMemberStatus: (memberId: string) => Promise<void>;
  inviteTeamMember: (member: Omit<TeamMember, 'id' | 'lastActive' | 'permissions'>) => Promise<void>;

  // Audit Logging
  recordAuditEvent: (
    action: AuditActionType,
    recordType: AuditLogEntry['recordType'],
    recordId: string,
    details: string,
    projectId?: string,
    projectName?: string,
    extra?: { previousValue?: string; newValue?: string; metadata?: any }
  ) => Promise<void>;

  // Notifications
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  unreadNotificationCount: number;

  // Modal dialogs
  isAddProjectModalOpen: boolean;
  setIsAddProjectModalOpen: (open: boolean) => void;

  // Toast notifications
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;

  // Settings
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;

}

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <ProjectsProvider>
      <BudgetContextProviderWrapper>
        {children}
      </BudgetContextProviderWrapper>
    </ProjectsProvider>
  );
};

// Internal nested provider chain to maintain clean composition
const BudgetContextProviderWrapper: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <BudgetProvider>
      <MaterialsProvider>
        <ProcurementProvider>
          <FieldReportsProvider>
            <TeamProvider>
              {children}
            </TeamProvider>
          </FieldReportsProvider>
        </ProcurementProvider>
      </MaterialsProvider>
    </BudgetProvider>
  );
};

/**
 * Unified application context hook.
 * Composes domain-specific contexts to guarantee full backward compatibility across all existing screens.
 */
export const useApp = (): AppContextType => {
  const ui = useUI();
  const projectsDomain = useProjects();
  const budgetDomain = useBudget();
  const materialsDomain = useMaterials();
  const procurementDomain = useProcurement();
  const fieldReportsDomain = useFieldReports();
  const teamDomain = useTeam();

  const refreshData = async () => {
    ui.setIsLoadingData(true);
    ui.setLoadError(null);
    try {
      await Promise.all([
        projectsDomain.refreshProjects(true),
        materialsDomain.loadMaterialsData(),
        teamDomain.loadTeamData(),
        budgetDomain.loadBudgetData(),
      ]);
    } catch (err: any) {
      ui.setLoadError(err?.message || 'Gagal memuat ulang data.');
    } finally {
      ui.setIsLoadingData(false);
    }
  };

  return {
    // UI & Navigation
    selectedProjectId: ui.selectedProjectId,
    setSelectedProjectId: ui.setSelectedProjectId,
    projectDetailTab: ui.projectDetailTab,
    setProjectDetailTab: ui.setProjectDetailTab,
    navigateToProjectDetail: ui.navigateToProjectDetail,
    globalSearch: ui.globalSearch,
    setGlobalSearch: ui.setGlobalSearch,
    sidebarCollapsed: ui.sidebarCollapsed,
    setSidebarCollapsed: ui.setSidebarCollapsed,
    mobileMenuOpen: ui.mobileMenuOpen,
    setMobileMenuOpen: ui.setMobileMenuOpen,
    notificationsOpen: ui.notificationsOpen,
    setNotificationsOpen: ui.setNotificationsOpen,
    isAddProjectModalOpen: ui.isAddProjectModalOpen,
    setIsAddProjectModalOpen: ui.setIsAddProjectModalOpen,
    toasts: ui.toasts,
    addToast: ui.addToast,
    removeToast: ui.removeToast,
    settings: ui.settings,
    updateSettings: ui.updateSettings,
    isLoadingData: ui.isLoadingData,
    loadError: ui.loadError,
    isTabVisible: ui.isTabVisible,
    refreshData,
    pendingActions: ui.pendingActions,
    isActionPending: ui.isActionPending,
    notifications: ui.notifications,
    markNotificationAsRead: ui.markNotificationAsRead,
    markAllNotificationsRead: ui.markAllNotificationsRead,
    unreadNotificationCount: ui.unreadNotificationCount,
    auditLogs: ui.auditLogs,
    recordAuditEvent: ui.recordAuditEvent,

    // Per-domain loading states
    loadingProjects: ui.loadingProjects,
    setLoadingProjects: ui.setLoadingProjects,
    loadingBudget: ui.loadingBudget,
    setLoadingBudget: ui.setLoadingBudget,
    loadingMaterials: ui.loadingMaterials,
    setLoadingMaterials: ui.setLoadingMaterials,
    loadingTeam: ui.loadingTeam,
    setLoadingTeam: ui.setLoadingTeam,
    loadingFieldReports: ui.loadingFieldReports,
    setLoadingFieldReports: ui.setLoadingFieldReports,
    loadingProcurement: ui.loadingProcurement,
    setLoadingProcurement: ui.setLoadingProcurement,

    // Projects
    projects: projectsDomain.projects,
    budgetLines: projectsDomain.budgetLines,
    milestones: projectsDomain.milestones,
    wbsList: projectsDomain.wbsList,
    budgetVersions: projectsDomain.budgetVersions,
    activities: projectsDomain.activities,
    addProject: projectsDomain.addProject,
    addBudgetLine: projectsDomain.addBudgetLine,
    updateBudgetLine: projectsDomain.updateBudgetLine,
    signOffMilestone: projectsDomain.signOffMilestone,
    updateWBSProgress: projectsDomain.updateWBSProgress,

    // Budget
    budgetRevisions: budgetDomain.budgetRevisions,
    pettyCash: budgetDomain.pettyCash,
    submitBudgetRevision: budgetDomain.submitBudgetRevision,
    approveBudgetRevision: budgetDomain.approveBudgetRevision,
    rejectBudgetRevision: budgetDomain.rejectBudgetRevision,
    submitPettyCash: budgetDomain.submitPettyCash,
    approvePettyCash: budgetDomain.approvePettyCash,
    rejectPettyCash: budgetDomain.rejectPettyCash,
    disbursePettyCash: budgetDomain.disbursePettyCash,

    // Materials
    materials: materialsDomain.materials,
    stockMutations: materialsDomain.stockMutations,
    stockAdjustments: materialsDomain.stockAdjustments,
    addStockMutation: materialsDomain.addStockMutation,
    submitStockAdjustment: materialsDomain.submitStockAdjustment,
    approveStockAdjustment: materialsDomain.approveStockAdjustment,
    rejectStockAdjustment: materialsDomain.rejectStockAdjustment,

    // Procurement
    purchaseOrders: procurementDomain.purchaseOrders,
    addPurchaseOrder: procurementDomain.addPurchaseOrder,
    approvePurchaseOrder: procurementDomain.approvePurchaseOrder,
    rejectPurchaseOrder: procurementDomain.rejectPurchaseOrder,

    // Field Reports
    fieldReports: fieldReportsDomain.fieldReports,
    addFieldReport: fieldReportsDomain.addFieldReport,
    reviewFieldReport: fieldReportsDomain.reviewFieldReport,

    // Team
    teamMembers: teamDomain.teamMembers,
    updateTeamMemberRole: teamDomain.updateTeamMemberRole,
    toggleTeamMemberStatus: teamDomain.toggleTeamMemberStatus,
    inviteTeamMember: teamDomain.inviteTeamMember,
  };
};
