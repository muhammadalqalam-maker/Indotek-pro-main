/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Multi-Tenant Data Architecture Migration Script
 * Migrates flat/legacy root Firestore collections to the hierarchical multi-tenant structure:
 *   workspaces/{wsId}/{members, projects, materials, purchase_orders, ...}
 *   workspaces/{wsId}/projects/{pid}/{budget_lines, milestones, wbs_items, activities}
 * 
 * Usage:
 *   npx tsx scripts/migrate-to-multitenant.ts --dry-run
 *   npx tsx scripts/migrate-to-multitenant.ts --apply
 *   npx tsx scripts/migrate-to-multitenant.ts --apply --workspace-id my-workspace
 */

import { adminDb } from '../src/server/firebaseAdmin';

interface MigrationStats {
  scanned: number;
  migrated: number;
  skipped: number;
  errors: number;
}

const stats: Record<string, MigrationStats> = {
  projects: { scanned: 0, migrated: 0, skipped: 0, errors: 0 },
  budget_lines: { scanned: 0, migrated: 0, skipped: 0, errors: 0 },
  milestones: { scanned: 0, migrated: 0, skipped: 0, errors: 0 },
  wbs_items: { scanned: 0, migrated: 0, skipped: 0, errors: 0 },
  activities: { scanned: 0, migrated: 0, skipped: 0, errors: 0 },
  materials: { scanned: 0, migrated: 0, skipped: 0, errors: 0 },
  purchase_orders: { scanned: 0, migrated: 0, skipped: 0, errors: 0 },
  field_reports: { scanned: 0, migrated: 0, skipped: 0, errors: 0 },
  stock_mutations: { scanned: 0, migrated: 0, skipped: 0, errors: 0 },
  stock_adjustments: { scanned: 0, migrated: 0, skipped: 0, errors: 0 },
  budget_revisions: { scanned: 0, migrated: 0, skipped: 0, errors: 0 },
  petty_cash: { scanned: 0, migrated: 0, skipped: 0, errors: 0 },
  audit_logs: { scanned: 0, migrated: 0, skipped: 0, errors: 0 },
  notifications: { scanned: 0, migrated: 0, skipped: 0, errors: 0 },
  counters: { scanned: 0, migrated: 0, skipped: 0, errors: 0 },
  members: { scanned: 0, migrated: 0, skipped: 0, errors: 0 },
};

function formatIsoDate(dateVal: any): string {
  if (!dateVal) return new Date().toISOString();
  if (typeof dateVal === 'string') {
    const parsed = Date.parse(dateVal);
    if (!isNaN(parsed)) return new Date(parsed).toISOString();
  }
  if (dateVal.toDate && typeof dateVal.toDate === 'function') {
    return dateVal.toDate().toISOString();
  }
  return new Date().toISOString();
}

function roundCurrency(val: any): number {
  const num = Number(val);
  return isNaN(num) ? 0 : Math.round(num);
}

export async function runMigration(options: { dryRun: boolean; targetWorkspaceId: string }) {
  const { dryRun, targetWorkspaceId } = options;

  console.log('======================================================================');
  console.log('INDOTEK PRO — MULTI-TENANT HIERARCHICAL DATA MIGRATION');
  console.log(`Execution Mode     : ${dryRun ? 'DRY-RUN (Simulasi tanpa penulisan)' : 'APPLY (Eksekusi tulis nyata)'}`);
  console.log(`Target Workspace ID: ${targetWorkspaceId}`);
  console.log('======================================================================\n');

  const wsRef = adminDb.collection('workspaces').doc(targetWorkspaceId);

  // 1. Ensure Target Workspace Document Exists
  if (!dryRun) {
    await wsRef.set(
      {
        id: targetWorkspaceId,
        name: 'Indotek Bangun Nusantara Workspace',
        schemaVersion: 2,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }

  // Helper for batch commits
  let currentBatch = adminDb.batch();
  let batchCount = 0;

  async function queueWrite(docRef: FirebaseFirestore.DocumentReference, data: any) {
    if (dryRun) return;
    currentBatch.set(docRef, data, { merge: true });
    batchCount++;
    if (batchCount >= 400) {
      await currentBatch.commit();
      currentBatch = adminDb.batch();
      batchCount = 0;
    }
  }

  async function flushBatch() {
    if (dryRun || batchCount === 0) return;
    await currentBatch.commit();
    currentBatch = adminDb.batch();
    batchCount = 0;
  }

  // ---------------------------------------------------------------------------
  // 1. MIGRATE PROJECTS: /projects/{id} -> /workspaces/{ws}/projects/{id}
  // ---------------------------------------------------------------------------
  console.log('-> Memigrasikan Koleksi Projects...');
  const projectsSnap = await adminDb.collection('projects').get();
  for (const docSnap of projectsSnap.docs) {
    stats.projects.scanned++;
    const old = docSnap.data();
    const pid = docSnap.id;
    const destRef = wsRef.collection('projects').doc(pid);

    const destSnap = await destRef.get();
    if (destSnap.exists && destSnap.data()?.schemaVersion >= 2) {
      stats.projects.skipped++;
      continue;
    }

    const migrated = {
      ...old,
      id: pid,
      workspaceId: targetWorkspaceId,
      contractValue: roundCurrency(old.contractValue),
      approvedBudget: roundCurrency(old.approvedBudget),
      actualCost: roundCurrency(old.actualCost),
      startDate: formatIsoDate(old.startDate),
      targetEndDate: formatIsoDate(old.targetEndDate),
      schemaVersion: 2,
      createdAt: formatIsoDate(old.createdAt),
      createdBy: old.createdBy || 'system-migrator',
      updatedAt: formatIsoDate(old.updatedAt),
      updatedBy: old.updatedBy || 'system-migrator',
    };

    await queueWrite(destRef, migrated);
    stats.projects.migrated++;
  }

  // ---------------------------------------------------------------------------
  // 2. MIGRATE PROJECT SUBCOLLECTIONS:
  //    /budget_lines -> /workspaces/{ws}/projects/{pid}/budget_lines/{id}
  //    /milestones   -> /workspaces/{ws}/projects/{pid}/milestones/{id}
  //    /wbs_items    -> /workspaces/{ws}/projects/{pid}/wbs_items/{id}
  //    /activities   -> /workspaces/{ws}/projects/{pid}/activities/{id}
  // ---------------------------------------------------------------------------
  console.log('-> Memigrasikan Subkoleksi Projects (budget_lines, milestones, wbs_items, activities)...');

  // 2a. Budget Lines
  const blSnap = await adminDb.collection('budget_lines').get();
  for (const docSnap of blSnap.docs) {
    stats.budget_lines.scanned++;
    const old = docSnap.data();
    const id = docSnap.id;
    const pid = old.projectId || 'prj-001';
    const destRef = wsRef.collection('projects').doc(pid).collection('budget_lines').doc(id);

    const destSnap = await destRef.get();
    if (destSnap.exists && destSnap.data()?.schemaVersion >= 2) {
      stats.budget_lines.skipped++;
      continue;
    }

    const migrated = {
      ...old,
      id,
      projectId: pid,
      workspaceId: targetWorkspaceId,
      plannedAmount: roundCurrency(old.plannedAmount),
      actualAmount: roundCurrency(old.actualAmount),
      unitRate: roundCurrency(old.unitRate),
      varianceAmount: roundCurrency(old.varianceAmount),
      schemaVersion: 2,
      createdAt: formatIsoDate(old.createdAt),
      createdBy: old.createdBy || 'system-migrator',
      updatedAt: formatIsoDate(old.updatedAt),
      updatedBy: old.updatedBy || 'system-migrator',
    };

    await queueWrite(destRef, migrated);
    stats.budget_lines.migrated++;
  }

  // 2b. Milestones
  const msSnap = await adminDb.collection('milestones').get();
  for (const docSnap of msSnap.docs) {
    stats.milestones.scanned++;
    const old = docSnap.data();
    const id = docSnap.id;
    const pid = old.projectId || 'prj-001';
    const destRef = wsRef.collection('projects').doc(pid).collection('milestones').doc(id);

    const destSnap = await destRef.get();
    if (destSnap.exists && destSnap.data()?.schemaVersion >= 2) {
      stats.milestones.skipped++;
      continue;
    }

    const migrated = {
      ...old,
      id,
      projectId: pid,
      workspaceId: targetWorkspaceId,
      plannedDate: formatIsoDate(old.plannedDate),
      actualDate: old.actualDate ? formatIsoDate(old.actualDate) : undefined,
      signedOffAt: old.signedOffAt ? formatIsoDate(old.signedOffAt) : undefined,
      schemaVersion: 2,
      createdAt: formatIsoDate(old.createdAt),
      createdBy: old.createdBy || 'system-migrator',
      updatedAt: formatIsoDate(old.updatedAt),
      updatedBy: old.updatedBy || 'system-migrator',
    };

    await queueWrite(destRef, migrated);
    stats.milestones.migrated++;
  }

  // 2c. WBS Items
  const wbsSnap = await adminDb.collection('wbs_items').get();
  for (const docSnap of wbsSnap.docs) {
    stats.wbs_items.scanned++;
    const old = docSnap.data();
    const id = docSnap.id;
    const pid = old.projectId || 'prj-001';
    const destRef = wsRef.collection('projects').doc(pid).collection('wbs_items').doc(id);

    const destSnap = await destRef.get();
    if (destSnap.exists && destSnap.data()?.schemaVersion >= 2) {
      stats.wbs_items.skipped++;
      continue;
    }

    const migrated = {
      ...old,
      id,
      projectId: pid,
      workspaceId: targetWorkspaceId,
      startDate: formatIsoDate(old.startDate),
      endDate: formatIsoDate(old.endDate),
      schemaVersion: 2,
      createdAt: formatIsoDate(old.createdAt),
      createdBy: old.createdBy || 'system-migrator',
      updatedAt: formatIsoDate(old.updatedAt),
      updatedBy: old.updatedBy || 'system-migrator',
    };

    await queueWrite(destRef, migrated);
    stats.wbs_items.migrated++;
  }

  // 2d. Activities
  const actSnap = await adminDb.collection('activities').get();
  for (const docSnap of actSnap.docs) {
    stats.activities.scanned++;
    const old = docSnap.data();
    const id = docSnap.id;
    const pid = old.projectId || 'prj-001';
    const destRef = wsRef.collection('projects').doc(pid).collection('activities').doc(id);

    const destSnap = await destRef.get();
    if (destSnap.exists && destSnap.data()?.schemaVersion >= 2) {
      stats.activities.skipped++;
      continue;
    }

    const migrated = {
      ...old,
      id,
      projectId: pid,
      workspaceId: targetWorkspaceId,
      timestamp: formatIsoDate(old.timestamp),
      schemaVersion: 2,
      createdAt: formatIsoDate(old.createdAt || old.timestamp),
      createdBy: old.createdBy || 'system-migrator',
      updatedAt: formatIsoDate(old.updatedAt || old.timestamp),
      updatedBy: old.updatedBy || 'system-migrator',
    };

    await queueWrite(destRef, migrated);
    stats.activities.migrated++;
  }

  // ---------------------------------------------------------------------------
  // 3. MIGRATE DIRECT WORKSPACE COLLECTIONS:
  //    materials, purchase_orders, field_reports, stock_mutations,
  //    stock_adjustments, budget_revisions, petty_cash, audit_logs, notifications
  // ---------------------------------------------------------------------------
  console.log('-> Memigrasikan Modul Operasional & Finansial...');

  // Materials
  const matSnap = await adminDb.collection('materials').get();
  for (const docSnap of matSnap.docs) {
    stats.materials.scanned++;
    const old = docSnap.data();
    const id = docSnap.id;
    const destRef = wsRef.collection('materials').doc(id);
    const destSnap = await destRef.get();
    if (destSnap.exists && destSnap.data()?.schemaVersion >= 2) {
      stats.materials.skipped++;
      continue;
    }
    await queueWrite(destRef, {
      ...old,
      id,
      workspaceId: targetWorkspaceId,
      currentStock: Math.round(Number(old.currentStock || 0)),
      minStock: Math.round(Number(old.minStock || 0)),
      unitPrice: roundCurrency(old.unitPrice),
      lastRestocked: formatIsoDate(old.lastRestocked),
      schemaVersion: 2,
      createdAt: formatIsoDate(old.createdAt),
      createdBy: old.createdBy || 'system-migrator',
      updatedAt: formatIsoDate(old.updatedAt),
      updatedBy: old.updatedBy || 'system-migrator',
    });
    stats.materials.migrated++;
  }

  // Purchase Orders
  const poSnap = await adminDb.collection('purchase_orders').get();
  for (const docSnap of poSnap.docs) {
    stats.purchase_orders.scanned++;
    const old = docSnap.data();
    const id = docSnap.id;
    const destRef = wsRef.collection('purchase_orders').doc(id);
    const destSnap = await destRef.get();
    if (destSnap.exists && destSnap.data()?.schemaVersion >= 2) {
      stats.purchase_orders.skipped++;
      continue;
    }
    await queueWrite(destRef, {
      ...old,
      id,
      workspaceId: targetWorkspaceId,
      totalCost: roundCurrency(old.totalCost),
      requestDate: formatIsoDate(old.requestDate),
      targetDeliveryDate: formatIsoDate(old.targetDeliveryDate),
      approvedAt: old.approvedAt ? formatIsoDate(old.approvedAt) : undefined,
      rejectedAt: old.rejectedAt ? formatIsoDate(old.rejectedAt) : undefined,
      schemaVersion: 2,
      createdAt: formatIsoDate(old.createdAt),
      createdBy: old.createdBy || old.requesterUid || 'system-migrator',
      updatedAt: formatIsoDate(old.updatedAt),
      updatedBy: old.updatedBy || 'system-migrator',
    });
    stats.purchase_orders.migrated++;
  }

  // Field Reports
  const frSnap = await adminDb.collection('field_reports').get();
  for (const docSnap of frSnap.docs) {
    stats.field_reports.scanned++;
    const old = docSnap.data();
    const id = docSnap.id;
    const destRef = wsRef.collection('field_reports').doc(id);
    const destSnap = await destRef.get();
    if (destSnap.exists && destSnap.data()?.schemaVersion >= 2) {
      stats.field_reports.skipped++;
      continue;
    }
    await queueWrite(destRef, {
      ...old,
      id,
      workspaceId: targetWorkspaceId,
      date: formatIsoDate(old.date),
      verifiedAt: old.verifiedAt ? formatIsoDate(old.verifiedAt) : undefined,
      approvedAt: old.approvedAt ? formatIsoDate(old.approvedAt) : undefined,
      schemaVersion: 2,
      createdAt: formatIsoDate(old.createdAt),
      createdBy: old.createdBy || old.siteSupervisorUid || 'system-migrator',
      updatedAt: formatIsoDate(old.updatedAt),
      updatedBy: old.updatedBy || 'system-migrator',
    });
    stats.field_reports.migrated++;
  }

  // Stock Mutations
  const mutSnap = await adminDb.collection('stock_mutations').get();
  for (const docSnap of mutSnap.docs) {
    stats.stock_mutations.scanned++;
    const old = docSnap.data();
    const id = docSnap.id;
    const destRef = wsRef.collection('stock_mutations').doc(id);
    const destSnap = await destRef.get();
    if (destSnap.exists && destSnap.data()?.schemaVersion >= 2) {
      stats.stock_mutations.skipped++;
      continue;
    }
    await queueWrite(destRef, {
      ...old,
      id,
      workspaceId: targetWorkspaceId,
      quantity: Math.round(Number(old.quantity || 0)),
      date: formatIsoDate(old.date),
      schemaVersion: 2,
      createdAt: formatIsoDate(old.createdAt),
      createdBy: old.createdBy || 'system-migrator',
      updatedAt: formatIsoDate(old.updatedAt || old.createdAt),
      updatedBy: old.updatedBy || 'system-migrator',
    });
    stats.stock_mutations.migrated++;
  }

  // Stock Adjustments
  const adjSnap = await adminDb.collection('stock_adjustments').get();
  for (const docSnap of adjSnap.docs) {
    stats.stock_adjustments.scanned++;
    const old = docSnap.data();
    const id = docSnap.id;
    const destRef = wsRef.collection('stock_adjustments').doc(id);
    const destSnap = await destRef.get();
    if (destSnap.exists && destSnap.data()?.schemaVersion >= 2) {
      stats.stock_adjustments.skipped++;
      continue;
    }
    await queueWrite(destRef, {
      ...old,
      id,
      workspaceId: targetWorkspaceId,
      previousStock: Math.round(Number(old.previousStock || 0)),
      physicalStock: Math.round(Number(old.physicalStock || 0)),
      varianceQuantity: Math.round(Number(old.varianceQuantity || 0)),
      submittedAt: formatIsoDate(old.submittedAt),
      reviewedAt: old.reviewedAt ? formatIsoDate(old.reviewedAt) : undefined,
      schemaVersion: 2,
      createdAt: formatIsoDate(old.createdAt),
      createdBy: old.createdBy || old.submittedByUid || 'system-migrator',
      updatedAt: formatIsoDate(old.updatedAt),
      updatedBy: old.updatedBy || 'system-migrator',
    });
    stats.stock_adjustments.migrated++;
  }

  // Budget Revisions
  const revSnap = await adminDb.collection('budget_revisions').get();
  for (const docSnap of revSnap.docs) {
    stats.budget_revisions.scanned++;
    const old = docSnap.data();
    const id = docSnap.id;
    const destRef = wsRef.collection('budget_revisions').doc(id);
    const destSnap = await destRef.get();
    if (destSnap.exists && destSnap.data()?.schemaVersion >= 2) {
      stats.budget_revisions.skipped++;
      continue;
    }
    await queueWrite(destRef, {
      ...old,
      id,
      workspaceId: targetWorkspaceId,
      originalAmount: roundCurrency(old.originalAmount),
      proposedAmount: roundCurrency(old.proposedAmount),
      varianceAmount: roundCurrency(old.varianceAmount),
      submittedAt: formatIsoDate(old.submittedAt),
      reviewedAt: old.reviewedAt ? formatIsoDate(old.reviewedAt) : undefined,
      schemaVersion: 2,
      createdAt: formatIsoDate(old.createdAt),
      createdBy: old.createdBy || old.submittedByUid || 'system-migrator',
      updatedAt: formatIsoDate(old.updatedAt),
      updatedBy: old.updatedBy || 'system-migrator',
    });
    stats.budget_revisions.migrated++;
  }

  // Petty Cash
  const pcSnap = await adminDb.collection('petty_cash').get();
  for (const docSnap of pcSnap.docs) {
    stats.petty_cash.scanned++;
    const old = docSnap.data();
    const id = docSnap.id;
    const destRef = wsRef.collection('petty_cash').doc(id);
    const destSnap = await destRef.get();
    if (destSnap.exists && destSnap.data()?.schemaVersion >= 2) {
      stats.petty_cash.skipped++;
      continue;
    }
    await queueWrite(destRef, {
      ...old,
      id,
      workspaceId: targetWorkspaceId,
      amount: roundCurrency(old.amount),
      submittedAt: formatIsoDate(old.submittedAt),
      reviewedAt: old.reviewedAt ? formatIsoDate(old.reviewedAt) : undefined,
      disbursedAt: old.disbursedAt ? formatIsoDate(old.disbursedAt) : undefined,
      schemaVersion: 2,
      createdAt: formatIsoDate(old.createdAt),
      createdBy: old.createdBy || old.requesterUid || 'system-migrator',
      updatedAt: formatIsoDate(old.updatedAt),
      updatedBy: old.updatedBy || 'system-migrator',
    });
    stats.petty_cash.migrated++;
  }

  // Audit Logs
  const audSnap = await adminDb.collection('audit_logs').get();
  for (const docSnap of audSnap.docs) {
    stats.audit_logs.scanned++;
    const old = docSnap.data();
    const id = docSnap.id;
    const destRef = wsRef.collection('audit_logs').doc(id);
    const destSnap = await destRef.get();
    if (destSnap.exists && destSnap.data()?.schemaVersion >= 2) {
      stats.audit_logs.skipped++;
      continue;
    }
    await queueWrite(destRef, {
      ...old,
      id,
      workspaceId: targetWorkspaceId,
      timestamp: formatIsoDate(old.timestamp),
      schemaVersion: 2,
      createdAt: formatIsoDate(old.createdAt || old.timestamp),
      createdBy: old.actor?.uid || 'system-migrator',
      updatedAt: formatIsoDate(old.updatedAt || old.timestamp),
      updatedBy: old.actor?.uid || 'system-migrator',
    });
    stats.audit_logs.migrated++;
  }

  // Notifications
  const notifSnap = await adminDb.collection('notifications').get();
  for (const docSnap of notifSnap.docs) {
    stats.notifications.scanned++;
    const old = docSnap.data();
    const id = docSnap.id;
    const destRef = wsRef.collection('notifications').doc(id);
    const destSnap = await destRef.get();
    if (destSnap.exists && destSnap.data()?.schemaVersion >= 2) {
      stats.notifications.skipped++;
      continue;
    }
    await queueWrite(destRef, {
      ...old,
      id,
      workspaceId: targetWorkspaceId,
      timestamp: formatIsoDate(old.timestamp),
      schemaVersion: 2,
      createdAt: formatIsoDate(old.createdAt || old.timestamp),
      createdBy: old.createdBy || 'system-migrator',
      updatedAt: formatIsoDate(old.updatedAt || old.timestamp),
      updatedBy: old.updatedBy || 'system-migrator',
    });
    stats.notifications.migrated++;
  }

  // Counters
  const cntSnap = await adminDb.collection('document_counters').get();
  for (const docSnap of cntSnap.docs) {
    stats.counters.scanned++;
    const old = docSnap.data();
    const id = docSnap.id;
    // Map ${workspace}_${year}_${type} to ${year}_${type}
    const cleanId = id.includes('_') ? id.split('_').slice(1).join('_') : id;
    const destRef = wsRef.collection('counters').doc(cleanId || id);
    const destSnap = await destRef.get();
    if (destSnap.exists && destSnap.data()?.schemaVersion >= 2) {
      stats.counters.skipped++;
      continue;
    }
    await queueWrite(destRef, {
      ...old,
      workspaceId: targetWorkspaceId,
      lastNumber: Math.round(Number(old.lastNumber || 0)),
      schemaVersion: 2,
      updatedAt: formatIsoDate(old.updatedAt),
    });
    stats.counters.migrated++;
  }

  // Workspace Members
  const memberSnap = await adminDb.collection('team_members').get();
  for (const docSnap of memberSnap.docs) {
    stats.members.scanned++;
    const old = docSnap.data();
    const id = docSnap.id;
    const destRef = wsRef.collection('members').doc(id);
    const destSnap = await destRef.get();
    if (destSnap.exists && destSnap.data()?.schemaVersion >= 2) {
      stats.members.skipped++;
      continue;
    }

    // Convert string project assignments to ID array
    let assignedProjectIds: string[] = ['*'];
    if (Array.isArray(old.assignedProjects)) {
      assignedProjectIds = old.assignedProjects;
    }

    await queueWrite(destRef, {
      ...old,
      id,
      uid: id,
      workspaceId: targetWorkspaceId,
      assignedProjectIds,
      lastActive: formatIsoDate(old.lastActive),
      schemaVersion: 2,
      createdAt: formatIsoDate(old.createdAt),
      createdBy: old.createdBy || 'system-migrator',
      updatedAt: formatIsoDate(old.updatedAt),
      updatedBy: old.updatedBy || 'system-migrator',
    });
    stats.members.migrated++;
  }

  // Flush remaining batch
  await flushBatch();

  console.log('\n======================================================================');
  console.log('LAPORAN HASIL MIGRASI DOKUMEN FIRESTORE:');
  console.log('======================================================================');
  console.log('Modul                 | Terpindai | Termigrasi | Dilewati | Gagal');
  console.log('----------------------|-----------|------------|----------|------');

  let totalScanned = 0;
  let totalMigrated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const [col, s] of Object.entries(stats)) {
    console.log(
      `${col.padEnd(21)} | ${String(s.scanned).padStart(9)} | ${String(s.migrated).padStart(10)} | ${String(s.skipped).padStart(8)} | ${String(s.errors).padStart(5)}`
    );
    totalScanned += s.scanned;
    totalMigrated += s.migrated;
    totalSkipped += s.skipped;
    totalErrors += s.errors;
  }

  console.log('----------------------|-----------|------------|----------|------');
  console.log(
    `TOTAL                 | ${String(totalScanned).padStart(9)} | ${String(totalMigrated).padStart(10)} | ${String(totalSkipped).padStart(8)} | ${String(totalErrors).padStart(5)}`
  );
  console.log('======================================================================');
  if (dryRun) {
    console.log('PEMBERITAHUAN: Operasi dijalankan dalam mode DRY-RUN. Tidak ada data yang diubah.');
    console.log('Jalankan perintah dengan "--apply" untuk mengeksekusi migrasi ke Firestore.');
  } else {
    console.log('MIGRASI BERHASIL DITERAPKAN KE CLOUD FIRESTORE.');
  }
  console.log('======================================================================\n');
}

// CLI Execution entry point
const args = process.argv.slice(2);
const isDryRun = !args.includes('--apply');
const wsIdx = args.indexOf('--workspace-id');
const targetWs = wsIdx !== -1 && args[wsIdx + 1] ? args[wsIdx + 1] : 'indotek-enterprise';

runMigration({ dryRun: isDryRun, targetWorkspaceId: targetWs }).catch((err) => {
  console.error('Fatal Migration Error:', err);
  process.exit(1);
});
