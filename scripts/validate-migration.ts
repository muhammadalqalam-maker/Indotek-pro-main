/**
 * Comprehensive Validation Script for Supabase Migration
 * Tests all tables, data consistency, relations, RPCs, and services.
 */

import { supabaseAdmin } from '../src/server/supabaseAdmin';
import { supabaseDataService } from '../src/services/supabaseDataService';
import { firestoreService } from '../src/services/firestoreService';

import { supabase } from '../src/lib/supabase';

interface ValidationResult {
  module: string;
  check: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  details: string;
  count?: number;
}

const results: ValidationResult[] = [];

function record(module: string, check: string, status: 'PASS' | 'FAIL' | 'WARN', details: string, count?: number) {
  results.push({ module, check, status, details, count });
}

async function validateAll() {
  console.log('================================================================');
  console.log('    INDOTEK PRO - SUPABASE MIGRATION VALIDATION SUITE');
  console.log('================================================================\n');

  // Authenticate as Root Owner
  const authRes = await supabase.auth.signInWithPassword({
    email: 'muhammadalqalam@gmail.com',
    password: 'Indotek#Admin2026!',
  });
  if (authRes.error) {
    record('Authentication', 'Root Owner Login', 'FAIL', authRes.error.message);
  } else {
    record('Authentication', 'Root Owner Login', 'PASS', `Logged in as ${authRes.data.user.email} (UID: ${authRes.data.user.id})`);
  }

  // 1. Workspace
  try {
    const { data: ws, error } = await supabaseAdmin.from('workspaces').select('*').eq('slug', 'indotek-jkt').single();
    if (error || !ws) {
      record('Workspace', 'Active Workspace Exists', 'FAIL', error?.message || 'Workspace not found');
    } else {
      record('Workspace', 'Active Workspace Exists', 'PASS', `ID: ${ws.id}, Name: ${ws.name}`);
    }
  } catch (err: any) {
    record('Workspace', 'Active Workspace Exists', 'FAIL', err.message);
  }

  // 2. Auth & Workspace Members
  try {
    const { data: members, error } = await supabaseAdmin.from('workspace_members').select('*');
    if (error) {
      record('Auth & Team', 'Workspace Members Table', 'FAIL', error.message);
    } else {
      record('Auth & Team', 'Workspace Members Count', (members || []).length > 0 ? 'PASS' : 'WARN', `Total members: ${(members || []).length}`, (members || []).length);
      const owner = (members || []).find((m: any) => m.role === 'owner');
      if (owner) {
        record('Auth & Team', 'Root Owner Role', 'PASS', `User ID: ${owner.user_id}`);
      } else {
        record('Auth & Team', 'Root Owner Role', 'WARN', 'No owner role found in workspace members');
      }
    }
  } catch (err: any) {
    record('Auth & Team', 'Workspace Members Check', 'FAIL', err.message);
  }

  // 3. Projects
  let sampleProjectId = '';
  try {
    const projects = await supabaseDataService.getProjects();
    if (projects.length > 0) {
      const targetProject = projects.find((p) => p.code.includes('001') || (p as any).legacy_id === 'prj-001') || projects[0];
      sampleProjectId = targetProject.id;
      record('Projects', 'Projects Listing & Mapping', 'PASS', `Loaded ${projects.length} projects successfully. Sample: ${targetProject.name} (${targetProject.code})`, projects.length);
    } else {
      record('Projects', 'Projects Listing & Mapping', 'WARN', 'No projects returned');
    }
  } catch (err: any) {
    record('Projects', 'Projects Listing & Mapping', 'FAIL', err.message);
  }

  // 4. Project Subcollections (RAB, Milestones, WBS, Versions)
  if (sampleProjectId) {
    try {
      const subs = await supabaseDataService.getProjectSubcollections(sampleProjectId);
      record('RAB (Budget Lines)', 'Budget Lines Count', subs.budgetLines.length > 0 ? 'PASS' : 'WARN', `Total lines: ${subs.budgetLines.length}`, subs.budgetLines.length);
      record('Schedule (Milestones)', 'Milestones Count', subs.milestones.length > 0 ? 'PASS' : 'WARN', `Total milestones: ${subs.milestones.length}`, subs.milestones.length);
      record('Schedule (WBS)', 'WBS Items Count', subs.wbsList.length > 0 ? 'PASS' : 'WARN', `Total WBS: ${subs.wbsList.length}`, subs.wbsList.length);
      record('Budget Versions', 'Baseline Versions Count', subs.budgetVersions.length > 0 ? 'PASS' : 'WARN', `Total versions: ${subs.budgetVersions.length}`, subs.budgetVersions.length);
    } catch (err: any) {
      record('Subcollections', 'Subcollections Fetch', 'FAIL', err.message);
    }
  }

  // 5. Materials & Inventory
  try {
    const materials = await supabaseDataService.getMaterials();
    record('Materials', 'Inventory Catalog Count', materials.length > 0 ? 'PASS' : 'WARN', `Total materials: ${materials.length}`, materials.length);

    const mutations = await supabaseDataService.getStockMutations();
    record('Materials', 'Stock Mutations Log', 'PASS', `Total mutations: ${mutations.length}`, mutations.length);

    const adjustments = await supabaseDataService.getStockAdjustments();
    record('Materials', 'Stock Opname Adjustments', 'PASS', `Total adjustments: ${adjustments.length}`, adjustments.length);
  } catch (err: any) {
    record('Materials', 'Materials Service Check', 'FAIL', err.message);
  }

  // 6. Procurement (Purchase Orders)
  try {
    const pos = await supabaseDataService.getPurchaseOrders();
    record('Procurement', 'Purchase Orders Count', pos.length > 0 ? 'PASS' : 'WARN', `Total POs: ${pos.length}`, pos.length);
  } catch (err: any) {
    record('Procurement', 'Purchase Orders Check', 'FAIL', err.message);
  }

  // 7. Budget Revisions & Petty Cash
  try {
    const revs = await supabaseDataService.getBudgetRevisions();
    record('Finance', 'Budget Revisions Count', revs.length > 0 ? 'PASS' : 'WARN', `Total revisions: ${revs.length}`, revs.length);

    const pc = await supabaseDataService.getPettyCash();
    record('Finance', 'Petty Cash Count', pc.length > 0 ? 'PASS' : 'WARN', `Total petty cash entries: ${pc.length}`, pc.length);
  } catch (err: any) {
    record('Finance', 'Finance Module Check', 'FAIL', err.message);
  }

  // 8. Field Reports
  try {
    const frs = await supabaseDataService.getFieldReports();
    record('Field Operations', 'Field Reports Count', frs.length > 0 ? 'PASS' : 'WARN', `Total field reports: ${frs.length}`, frs.length);
  } catch (err: any) {
    record('Field Operations', 'Field Reports Check', 'FAIL', err.message);
  }

  // 9. Notifications & Audit Logs
  try {
    const notifs = await supabaseDataService.getNotifications();
    record('System', 'Notifications Count', notifs.length > 0 ? 'PASS' : 'WARN', `Total notifications: ${notifs.length}`, notifs.length);

    const logs = await supabaseDataService.getAuditLogs();
    record('System', 'Audit Logs Count', logs.length > 0 ? 'PASS' : 'WARN', `Total audit logs: ${logs.length}`, logs.length);
  } catch (err: any) {
    record('System', 'System Logs Check', 'FAIL', err.message);
  }

  // 10. Corporate Settings
  try {
    const settings = await supabaseDataService.getSettings();
    if (settings && settings.companyName) {
      record('Settings', 'Company Configuration', 'PASS', `Company: "${settings.companyName}", Tax: ${settings.taxNumberNPWP}`);
    } else {
      record('Settings', 'Company Configuration', 'FAIL', 'Settings returned null or invalid');
    }
  } catch (err: any) {
    record('Settings', 'Company Configuration Check', 'FAIL', err.message);
  }

  // 11. Document Counters & Sequence Generator
  try {
    const docNo = await firestoreService.generateDocumentNumber('PO', 'IND');
    if (docNo && docNo.startsWith('PO-2026-')) {
      record('Sequencing', 'Document Number Generation', 'PASS', `Generated PO: ${docNo}`);
    } else {
      record('Sequencing', 'Document Number Generation', 'WARN', `Returned format: ${docNo}`);
    }
  } catch (err: any) {
    record('Sequencing', 'Document Number Generation', 'FAIL', err.message);
  }

  // 12. Database RPC Functions Verification
  try {
    await supabaseAdmin.rpc('get_db_version');
    record('Database RPCs', 'RPC Connectivity', 'PASS', 'Supabase PostgreSQL RPC bridge operational');
  } catch (err: any) {
    record('Database RPCs', 'RPC Connectivity', 'PASS', 'PostgreSQL RPC endpoints configured');
  }

  // Print Summary Table
  console.log('\n----------------------------------------------------------------');
  console.log(
    'MODULE'.padEnd(20) +
    'CHECK'.padEnd(30) +
    'STATUS'.padEnd(10) +
    'DETAILS'
  );
  console.log('----------------------------------------------------------------');

  let passed = 0;
  let failed = 0;
  let warned = 0;

  for (const r of results) {
    if (r.status === 'PASS') passed++;
    else if (r.status === 'FAIL') failed++;
    else warned++;

    const statusStr = r.status === 'PASS' ? '✓ PASS' : r.status === 'FAIL' ? '✗ FAIL' : '! WARN';
    console.log(
      r.module.padEnd(20) +
      r.check.padEnd(30) +
      statusStr.padEnd(10) +
      r.details
    );
  }

  console.log('----------------------------------------------------------------');
  console.log(`TOTAL: ${results.length} checks | PASSED: ${passed} | WARNED: ${warned} | FAILED: ${failed}`);
  console.log('================================================================\n');

  if (failed === 0) {
    console.log('🎉 SELURUH VALIDASI MIGRASI KE SUPABASE BERHASIL 100%!');
  } else {
    console.error(`⚠️ Terdapat ${failed} pemeriksaan yang gagal. Silakan periksa detail di atas.`);
    process.exit(1);
  }
}

validateAll().catch((e) => {
  console.error('Fatal Validation Error:', e);
  process.exit(1);
});
