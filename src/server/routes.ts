import { Router, Request, Response, NextFunction } from 'express';
import { authenticateTrustedActor } from './auth';
import {
  handlePurchaseOrderAction,
  handleBudgetRevisionAction,
  handleStockAdjustmentAction,
  handleStockMutationAction,
  handlePettyCashAction,
  handleFieldReportAction,
  handleMilestoneSignOffAction,
  generateTransactionalDocNumber,
} from './workflowEngine';
import { adminDb } from './firebaseAdmin';
import { supabaseWorkflowService, isSupabaseConfigured } from './supabaseWorkflowService';
import {
  ValidationError,
  classifyError,
} from './errors';
import {
  PurchaseOrderActionRequestSchema,
  BudgetRevisionActionRequestSchema,
  StockAdjustmentActionRequestSchema,
  StockMutationActionRequestSchema,
  PettyCashActionRequestSchema,
  FieldReportActionRequestSchema,
  MilestoneSignOffActionRequestSchema,
  DocumentNumberActionRequestSchema,
} from '../schemas';

export const workflowRouter = Router();

// Apply trusted authentication to all workflow endpoints
workflowRouter.use(authenticateTrustedActor);

/**
 * Validates request body with strict Zod schema, rejecting unknown fields.
 */
function validateRequestBody<T>(
  schema: { safeParse: (data: unknown) => { success: boolean; data?: T; error?: any } },
  body: unknown
): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue: any) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ');
    throw new ValidationError(`Validasi request gagal: ${errorDetails}`);
  }
  return result.data as T;
}

/**
 * 1. Purchase Order Endpoint
 * Handles: create, approve, reject
 */
workflowRouter.post('/purchase-order', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!;
    const validated = validateRequestBody(PurchaseOrderActionRequestSchema, req.body);
    const idempotencyKey = req.idempotencyKey || validated.idempotencyKey;
    const { action, poId, rejectionReason, poData } = validated;

    if (isSupabaseConfigured()) {
      if (action === 'create' && poData) {
        const result = await supabaseWorkflowService.createPurchaseOrder(actor, {
          projectId: poData.projectId,
          supplierName: poData.supplierName,
          itemDescription: poData.itemDescription,
          quantitySummary: poData.quantitySummary,
          totalCost: poData.totalCost,
          targetDeliveryDate: poData.targetDeliveryDate,
          submit: poData.submit,
          idempotencyKey,
        });
        return res.json(result);
      } else if ((action === 'approve' || action === 'reject') && poId) {
        const result = await supabaseWorkflowService.decidePurchaseOrder(actor, {
          poId,
          decision: action,
          reason: rejectionReason,
          idempotencyKey,
        });
        return res.json(result);
      }
    }

    const result = await handlePurchaseOrderAction(actor, {
      action,
      poId,
      rejectionReason,
      poData,
      idempotencyKey,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * 2. Budget Revision Endpoint
 * Handles: create, approve, reject
 */
workflowRouter.post('/budget-revision', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!;
    const validated = validateRequestBody(BudgetRevisionActionRequestSchema, req.body);
    const idempotencyKey = req.idempotencyKey || validated.idempotencyKey;
    const { action, revId, rejectionReason, revData } = validated;

    if (isSupabaseConfigured()) {
      if (action === 'create' && revData) {
        const result = await supabaseWorkflowService.createBudgetRevision(actor, {
          projectId: revData.projectId,
          title: revData.title || revData.projectName || 'Revisi Anggaran',
          divisionName: revData.divisionName,
          originalAmount: revData.originalAmount,
          proposedAmount: revData.proposedAmount,
          justification: revData.justification,
          idempotencyKey,
        });
        return res.json(result);
      } else if ((action === 'approve' || action === 'reject') && revId) {
        const result = await supabaseWorkflowService.decideBudgetRevision(actor, {
          revId,
          decision: action,
          reason: rejectionReason,
          idempotencyKey,
        });
        return res.json(result);
      }
    }

    const result = await handleBudgetRevisionAction(actor, {
      action,
      revId,
      rejectionReason,
      revData,
      idempotencyKey,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * 3. Stock Adjustment Endpoint
 * Handles: create, approve, reject
 */
workflowRouter.post('/stock-adjustment', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!;
    const validated = validateRequestBody(StockAdjustmentActionRequestSchema, req.body);
    const idempotencyKey = req.idempotencyKey || validated.idempotencyKey;
    const { action, adjId, rejectionReason, adjData } = validated;

    if (isSupabaseConfigured()) {
      if (action === 'create' && adjData) {
        const result = await supabaseWorkflowService.createStockAdjustment(actor, {
          materialId: adjData.materialId,
          physicalStock: adjData.physicalStock,
          reason: adjData.reason,
          projectId: adjData.projectId,
          evidenceRef: adjData.evidenceRef,
          idempotencyKey,
        });
        return res.json(result);
      } else if ((action === 'approve' || action === 'reject') && adjId) {
        const result = await supabaseWorkflowService.decideStockAdjustment(actor, {
          adjId,
          decision: action,
          reason: rejectionReason,
          idempotencyKey,
        });
        return res.json(result);
      }
    }

    const result = await handleStockAdjustmentAction(actor, {
      action,
      adjId,
      rejectionReason,
      adjData,
      idempotencyKey,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * 4. Direct Stock Mutation (Masuk / Keluar) with zero negative guarantee
 */
workflowRouter.post('/stock-mutation', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!;
    const validated = validateRequestBody(StockMutationActionRequestSchema, req.body);
    const idempotencyKey = req.idempotencyKey || validated.idempotencyKey;
    const { materialId, type, quantity, referenceNo, project, handler } = validated;

    if (isSupabaseConfigured()) {
      const result = await supabaseWorkflowService.recordStockMutation(actor, {
        materialId,
        type,
        quantity,
        referenceNo,
        projectId: project,
        handler,
        idempotencyKey,
      });
      return res.json(result);
    }

    const result = await handleStockMutationAction(actor, {
      materialId,
      type,
      quantity,
      referenceNo,
      project: project || '',
      handler: handler || '',
      idempotencyKey,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * 5. Petty Cash Endpoint
 * Handles: create, approve, reject, disburse
 */
workflowRouter.post('/petty-cash', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!;
    const validated = validateRequestBody(PettyCashActionRequestSchema, req.body);
    const idempotencyKey = req.idempotencyKey || validated.idempotencyKey;
    const { action, cashId, rejectionReason, cashData } = validated;

    if (isSupabaseConfigured()) {
      if (action === 'create' && cashData) {
        const result = await supabaseWorkflowService.createPettyCash(actor, {
          projectId: cashData.projectId,
          amount: cashData.amount,
          category: cashData.category,
          purpose: cashData.purpose,
          receiptPath: cashData.receiptPath,
          idempotencyKey,
        });
        return res.json(result);
      } else if ((action === 'approve' || action === 'reject') && cashId) {
        const result = await supabaseWorkflowService.decidePettyCash(actor, {
          pettyCashId: cashId,
          decision: action,
          reason: rejectionReason,
          idempotencyKey,
        });
        return res.json(result);
      } else if (action === 'disburse' && cashId) {
        const result = await supabaseWorkflowService.disbursePettyCash(actor, {
          pettyCashId: cashId,
          idempotencyKey,
        });
        return res.json(result);
      }
    }

    const result = await handlePettyCashAction(actor, {
      action,
      cashId,
      rejectionReason,
      cashData,
      idempotencyKey,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * 6. Field Report Endpoint
 * Handles: create, verify, approve, revise
 */
workflowRouter.post('/field-report', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!;
    const validated = validateRequestBody(FieldReportActionRequestSchema, req.body);
    const idempotencyKey = req.idempotencyKey || validated.idempotencyKey;
    const { action, reportId, reviewerNotes, reportData } = validated;

    if (isSupabaseConfigured()) {
      if (action === 'create' && reportData) {
        const result = await supabaseWorkflowService.createFieldReport(actor, {
          projectId: reportData.projectId,
          reportDate: reportData.reportDate,
          weatherMorning: reportData.weatherMorning,
          weatherAfternoon: reportData.weatherAfternoon,
          workingHours: reportData.workingHours,
          workforce: reportData.workforce,
          completedWorks: reportData.completedWorks,
          materialsUsed: reportData.materialsUsed,
          equipmentUsed: reportData.equipmentUsed,
          blockers: reportData.blockers,
          idempotencyKey,
        });
        return res.json(result);
      } else if (action === 'verify' && reportId) {
        const result = await supabaseWorkflowService.verifyFieldReport(actor, {
          reportId,
          idempotencyKey,
        });
        return res.json(result);
      } else if (action === 'approve' && reportId) {
        const result = await supabaseWorkflowService.approveFieldReport(actor, {
          reportId,
          idempotencyKey,
        });
        return res.json(result);
      } else if (action === 'revise' && reportId) {
        const result = await supabaseWorkflowService.reviseFieldReport(actor, {
          reportId,
          reviewerNotes: reviewerNotes || '',
          idempotencyKey,
        });
        return res.json(result);
      }
    }

    const result = await handleFieldReportAction(actor, {
      action,
      reportId,
      reviewerNotes,
      reportData,
      idempotencyKey,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * 7. Milestone Sign-Off Endpoint
 */
workflowRouter.post('/milestone-signoff', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!;
    const validated = validateRequestBody(MilestoneSignOffActionRequestSchema, req.body);
    const idempotencyKey = req.idempotencyKey || validated.idempotencyKey;
    const { milestoneId, projectId, bastRef, notes } = validated;

    if (isSupabaseConfigured()) {
      const result = await supabaseWorkflowService.signOffMilestone(actor, {
        milestoneId,
        bastRef,
        notes,
        idempotencyKey,
      });
      return res.json(result);
    }

    const result = await handleMilestoneSignOffAction(actor, {
      milestoneId,
      projectId,
      bastRef,
      notes,
      idempotencyKey,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * 8. Transactional Sequential Document Number Generator Endpoint
 */
workflowRouter.post('/document-number', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = req.actor!;
    const validated = validateRequestBody(DocumentNumberActionRequestSchema, req.body);
    const { type, projectCodeOrAbbr, year } = validated;

    if (isSupabaseConfigured()) {
      const docNumber = await supabaseWorkflowService.generateDocumentNumber(
        actor,
        type,
        projectCodeOrAbbr || 'IND',
        year || '2026'
      );
      return res.json({ success: true, docNumber });
    }

    const docNumber = await adminDb.runTransaction(async (tx: any) => {
      return await generateTransactionalDocNumber(
        tx,
        type,
        projectCodeOrAbbr || 'IND',
        actor.workspaceId,
        year || '2026'
      );
    });

    res.json({ success: true, docNumber });
  } catch (err) {
    next(err);
  }
});

/**
 * Centralized Error-Handler for Workflow Routes
 * Formats responses maintaining the exact client contract: { error: string, success: false }
 */
workflowRouter.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const classified = classifyError(err);
  console.error(`[Workflow Router Error] [${classified.name}]:`, classified.message);
  res.status(classified.statusCode).json({
    error: classified.message,
    success: false,
  });
});
