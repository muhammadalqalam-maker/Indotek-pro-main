/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Central Workflow Engine - Modularized Domain Barrel
 * 
 * Re-exports domain workflow modules for backward compatibility:
 * - common: collection paths, counters, idempotency, audit helpers
 * - purchaseOrder: PO lifecycle (create, approve, reject)
 * - budgetRevision: Addendum revisions & budget line adjustments
 * - stockAdjustment: Physical opname adjustments & automatic stock sync
 * - stockMutation: Outflow/Inflow with zero negative stock guarantee
 * - pettyCash: Kas kecil submission, approval, disbursement
 * - fieldReport: Daily site reports verification & approval
 * - milestone: BAST sign-off & project milestone counters
 */

export * from './workflows';
