/**
 * Indotek Pro — Staging & Emulator Database Seeding Script
 * 
 * Usage:
 *   npx tsx scripts/seed-staging.ts
 */

import {
  INITIAL_PROJECTS,
  INITIAL_MATERIALS,
  INITIAL_PURCHASE_ORDERS,
  INITIAL_FIELD_REPORTS,
  INITIAL_STOCK_MUTATIONS,
  INITIAL_NOTIFICATIONS,
  INITIAL_ACTIVITIES,
  INITIAL_TEAM_MEMBERS,
  INITIAL_AUDIT_LOGS,
  INITIAL_BUDGET_REVISIONS,
  INITIAL_PETTY_CASH,
  INITIAL_STOCK_ADJUSTMENTS,
  INITIAL_BUDGET_LINES,
  INITIAL_MILESTONES,
  INITIAL_WBS
} from '../seed/mockData';
import { adminDb as db, loadFirebaseConfig } from '../src/server/firebaseAdmin';

loadFirebaseConfig();

if (process.env.NODE_ENV === 'production' && !process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('⛔ FATAL: Seeding mock data is strictly forbidden in production! Script aborted to protect live production database.');
  process.exit(1);
}

async function runSeeding() {
  console.log('Seeding initial dataset to Firestore staging/emulator environment...');
  const batch = db.batch();
  const now = new Date().toISOString();

  // Projects
  for (const p of INITIAL_PROJECTS) {
    batch.set(db.collection('projects').doc(p.id), {
      ...p,
      createdBy: 'usr-bootstrap-admin',
      createdAt: now,
      updatedAt: now,
    });
  }

  // Materials
  for (const m of INITIAL_MATERIALS) {
    batch.set(db.collection('materials').doc(m.id), {
      ...m,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Budget Lines
  for (const bl of INITIAL_BUDGET_LINES) {
    batch.set(db.collection('budget_lines').doc(bl.id), {
      ...bl,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Milestones
  for (const ms of INITIAL_MILESTONES) {
    batch.set(db.collection('milestones').doc(ms.id), {
      ...ms,
      createdAt: now,
      updatedAt: now,
    });
  }

  // WBS Items
  for (const wbs of INITIAL_WBS) {
    batch.set(db.collection('wbs_items').doc(wbs.id), {
      ...wbs,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Workspace Settings
  batch.set(db.collection('workspace_settings').doc('company_default'), {
    companyName: 'PT Indotek Bangun Nusantara',
    companyAddress: 'Gedung Graha Surveyor Indonesia Lt. 14, Jl. Gatot Subroto Kav. 56, Jakarta Selatan 12950',
    taxNumberNPWP: '01.345.678.9-012.000',
    tableDensity: 'comfortable',
    currency: 'IDR (Rp)',
    dateFormat: 'DD/MM/YYYY',
    alertScheduleDeviation: true,
    alertCriticalStock: true,
    alertHighValuePO: true,
    language: 'id',
    updatedAt: now,
  });

  // Document Counters
  const counters = [
    { type: 'PO', lastNumber: 150 },
    { type: 'ADD-REV', lastNumber: 5 },
    { type: 'LHP', lastNumber: 240 },
    { type: 'KAS', lastNumber: 10 },
    { type: 'ADJ', lastNumber: 8 },
  ];
  for (const c of counters) {
    batch.set(db.collection('document_counters').doc(c.type), {
      docType: c.type,
      lastNumber: c.lastNumber,
      updatedAt: now,
    });
  }

  await batch.commit();
  console.log('✓ Seeding database staging/emulator selesai dengan sukses!');
}

runSeeding().catch(err => {
  console.error('Seeding error:', err);
  process.exit(1);
});
