/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Domain-Driven Workflow Modules
 *
 * @deprecated All workflow logic is now handled by supabaseWorkflowService.ts via Supabase RPC functions.
 * Routes.ts returns early with Supabase results and never reaches this legacy code.
 */

// Export stub handlers for backward compatibility with routes.ts
export async function handlePurchaseOrderAction(_actor: any, _params: any): Promise<{ success: boolean; data?: any }> {
  throw new Error('handlePurchaseOrderAction is deprecated. Use supabaseWorkflowService.ts instead.');
}

export async function handleBudgetRevisionAction(_actor: any, _params: any): Promise<{ success: boolean; data?: any }> {
  throw new Error('handleBudgetRevisionAction is deprecated. Use supabaseWorkflowService.ts instead.');
}

export async function handleStockAdjustmentAction(_actor: any, _params: any): Promise<{ success: boolean; data?: any }> {
  throw new Error('handleStockAdjustmentAction is deprecated. Use supabaseWorkflowService.ts instead.');
}

export async function handleStockMutationAction(_actor: any, _params: any): Promise<{ success: boolean; data?: any }> {
  throw new Error('handleStockMutationAction is deprecated. Use supabaseWorkflowService.ts instead.');
}

export async function handlePettyCashAction(_actor: any, _params: any): Promise<{ success: boolean; data?: any }> {
  throw new Error('handlePettyCashAction is deprecated. Use supabaseWorkflowService.ts instead.');
}

export async function handleFieldReportAction(_actor: any, _params: any): Promise<{ success: boolean; data?: any }> {
  throw new Error('handleFieldReportAction is deprecated. Use supabaseWorkflowService.ts instead.');
}

export async function handleMilestoneSignOffAction(_actor: any, _params: any): Promise<{ success: boolean; data?: any }> {
  throw new Error('handleMilestoneSignOffAction is deprecated. Use supabaseWorkflowService.ts instead.');
}

export async function generateTransactionalDocNumber(_tenantCollection: any, _docType: any, _tx: any, _projectId?: any, _date?: any): Promise<string> {
  throw new Error('generateTransactionalDocNumber is deprecated. Use supabaseWorkflowService.generateDocumentNumber instead.');
}
