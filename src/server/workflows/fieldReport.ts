/**
 * @deprecated This workflow module is deprecated.
 * All workflow logic is now handled by supabaseWorkflowService.ts via Supabase RPC functions.
 * Routes.ts returns early with Supabase results and never reaches this legacy code.
 */
export const fieldReportWorkflow = {
  create: async () => {
    throw new Error('fieldReport workflow is deprecated. Use supabaseWorkflowService.ts instead.');
  },
  review: async () => {
    throw new Error('fieldReport workflow is deprecated. Use supabaseWorkflowService.ts instead.');
  },
  approve: async () => {
    throw new Error('fieldReport workflow is deprecated. Use supabaseWorkflowService.ts instead.');
  },
  revise: async () => {
    throw new Error('fieldReport workflow is deprecated. Use supabaseWorkflowService.ts instead.');
  },
};
