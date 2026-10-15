/**
 * @deprecated This workflow module is deprecated.
 * All workflow logic is now handled by supabaseWorkflowService.ts via Supabase RPC functions.
 * Routes.ts returns early with Supabase results and never reaches this legacy code.
 */
export const milestoneWorkflow = {
  signOff: async () => {
    throw new Error('milestone workflow is deprecated. Use supabaseWorkflowService.ts instead.');
  },
};
