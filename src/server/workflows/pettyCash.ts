/**
 * @deprecated This workflow module is deprecated.
 * All workflow logic is now handled by supabaseWorkflowService.ts via Supabase RPC functions.
 * Routes.ts returns early with Supabase results and never reaches this legacy code.
 */
export const pettyCashWorkflow = {
  create: async () => {
    throw new Error('pettyCash workflow is deprecated. Use supabaseWorkflowService.ts instead.');
  },
  approve: async () => {
    throw new Error('pettyCash workflow is deprecated. Use supabaseWorkflowService.ts instead.');
  },
  reject: async () => {
    throw new Error('pettyCash workflow is deprecated. Use supabaseWorkflowService.ts instead.');
  },
  disburse: async () => {
    throw new Error('pettyCash workflow is deprecated. Use supabaseWorkflowService.ts instead.');
  },
};
