/**
 * Unified Data Service
 * Pure Supabase backend. All data operations routed through Supabase.
 */

import { supabaseDataService, type ActorInfo } from './supabaseDataService';

export type { ActorInfo };

// Combined service: reads from Supabase, writes via RPC (supabaseDataService uses RPC to Supabase)
export const dataService = {
  // Read operations & subscriptions from Supabase
  ...supabaseDataService,
  
  // Write operations from supabaseDataService (which uses RPC to Supabase)
  // Projects
  addProject: supabaseDataService.addProject.bind(supabaseDataService),
  updateProject: supabaseDataService.updateProject.bind(supabaseDataService),
  addProjectBudgetLine: supabaseDataService.addProjectBudgetLine.bind(supabaseDataService),
  updateProjectBudgetLine: supabaseDataService.updateProjectBudgetLine.bind(supabaseDataService),
  signOffProjectMilestone: supabaseDataService.signOffProjectMilestone.bind(supabaseDataService),
  updateProjectWBSProgress: supabaseDataService.updateProjectWBSProgress.bind(supabaseDataService),
  
  // Team
  addTeamMember: supabaseDataService.addTeamMember.bind(supabaseDataService),
  updateTeamMember: supabaseDataService.updateTeamMember.bind(supabaseDataService),
  
  // Budget
  submitBudgetRevision: supabaseDataService.submitBudgetRevision.bind(supabaseDataService),
  approveBudgetRevision: supabaseDataService.approveBudgetRevision.bind(supabaseDataService),
  rejectBudgetRevision: supabaseDataService.rejectBudgetRevision.bind(supabaseDataService),
  
  // Petty Cash
  addPettyCash: supabaseDataService.addPettyCash.bind(supabaseDataService),
  approvePettyCash: supabaseDataService.approvePettyCash.bind(supabaseDataService),
  rejectPettyCash: supabaseDataService.rejectPettyCash.bind(supabaseDataService),
  disbursePettyCash: supabaseDataService.disbursePettyCash.bind(supabaseDataService),
  
  // Procurement
  addPurchaseOrder: supabaseDataService.addPurchaseOrder.bind(supabaseDataService),
  approvePurchaseOrder: supabaseDataService.approvePurchaseOrder.bind(supabaseDataService),
  rejectPurchaseOrder: supabaseDataService.rejectPurchaseOrder.bind(supabaseDataService),
  
  // Field Reports
  addFieldReport: supabaseDataService.addFieldReport.bind(supabaseDataService),
  reviewFieldReport: supabaseDataService.reviewFieldReport.bind(supabaseDataService),
  
  // Materials
  addStockMutation: supabaseDataService.addStockMutation.bind(supabaseDataService),
  submitStockAdjustment: supabaseDataService.submitStockAdjustment.bind(supabaseDataService),
  approveStockAdjustment: supabaseDataService.approveStockAdjustment.bind(supabaseDataService),
  rejectStockAdjustment: supabaseDataService.rejectStockAdjustment.bind(supabaseDataService),
  
  // Audit
  logAuditEvent: supabaseDataService.logAuditEvent.bind(supabaseDataService),
  
  // Notifications
  markNotificationAsRead: supabaseDataService.markNotificationAsRead.bind(supabaseDataService),
  markAllNotificationsRead: supabaseDataService.markAllNotificationsRead.bind(supabaseDataService),
  
  // Settings
  saveSettings: supabaseDataService.saveSettings.bind(supabaseDataService),
  
  // Activities (uses audit logs)
  getActivities: supabaseDataService.getActivities.bind(supabaseDataService),
};

// Re-export utility
export { resolveWorkspaceId } from './supabaseDataService';

// Re-export types
export type { Project, PurchaseOrder, MaterialItem, BudgetRevision, PettyCashEntry, FieldReport, StockMutation, StockAdjustment, NotificationItem, TeamMember, ProjectActivity } from '../types';
export type { AppSettings } from './supabaseDataService';
