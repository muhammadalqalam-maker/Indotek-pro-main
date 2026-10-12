import 'dotenv/config';
import { supabaseAdmin } from '../src/server/supabaseAdmin';
import {
  INITIAL_PROJECTS,
  INITIAL_PURCHASE_ORDERS,
  INITIAL_FIELD_REPORTS,
  INITIAL_PETTY_CASH,
  INITIAL_NOTIFICATIONS,
  INITIAL_BUDGET_REVISIONS,
  INITIAL_AUDIT_LOGS,
} from '../seed/mockData';

async function completeSeed() {
  const { data: workspaces } = await supabaseAdmin
    .from('workspaces')
    .select('id, slug, name')
    .eq('slug', 'indotek-jkt')
    .limit(1);

  const wsId = workspaces![0].id;
  const { data: users } = await supabaseAdmin.auth.admin.listUsers();
  const ownerId = users?.users?.[0]?.id || null;

  // Build project map
  const { data: projs } = await supabaseAdmin.from('projects').select('id, legacy_id').eq('workspace_id', wsId);
  const projectMap = new Map<string, string>();
  projs?.forEach((p) => {
    if (p.legacy_id) projectMap.set(p.legacy_id, p.id);
  });

  // 1. POs
  console.log('Seeding POs...');
  for (const po of INITIAL_PURCHASE_ORDERS) {
    const targetPid = projectMap.get(po.projectId);
    if (!targetPid) continue;

    const { error } = await supabaseAdmin.from('purchase_orders').insert({
      workspace_id: wsId,
      project_id: targetPid,
      legacy_id: po.id,
      po_number: po.poNumber,
      supplier_name: po.supplierName,
      item_description: po.itemDescription || '',
      quantity_summary: po.quantitySummary || '',
      total_cost: po.totalCost,
      status: po.status,
      requester_id: ownerId,
      requester_name: (po as any).requestedBy || po.requester || 'Procurement',
      approved_by: ownerId,
      approved_by_name: po.approvedBy || null,
      approved_at: po.approvedAt || null,
      target_delivery_date: po.targetDeliveryDate || null,
    });
    if (error && error.code !== '23505') console.error('PO error:', error.message);
  }
  console.log('✓ POs complete');

  // 2. Field Reports
  console.log('Seeding Field Reports...');
  for (const fr of INITIAL_FIELD_REPORTS) {
    const targetPid = projectMap.get(fr.projectId);
    if (!targetPid) continue;

    const { error } = await supabaseAdmin.from('field_reports').insert({
      workspace_id: wsId,
      project_id: targetPid,
      legacy_id: fr.id,
      report_number: fr.reportNumber,
      report_date: (fr as any).reportDate || fr.date,
      weather_morning: fr.weatherMorning || 'Cerah',
      weather_afternoon: fr.weatherAfternoon || 'Cerah',
      working_hours: fr.workingHours || 8,
      status: fr.status,
      site_supervisor_id: ownerId,
      site_supervisor_name: (fr as any).preparedBy || fr.siteSupervisor || 'Site Manager',
      workforce: fr.workforce || [],
      completed_works: fr.completedWorks || [],
      materials_used: fr.materialsUsed || [],
      equipment_used: fr.equipmentUsed || [],
      blockers: fr.blockers || null,
    });
    if (error && error.code !== '23505') console.error('FR error:', error.message);
  }
  console.log('✓ Field Reports complete');

  // 3. Petty Cash
  console.log('Seeding Petty Cash...');
  for (const pc of INITIAL_PETTY_CASH) {
    const targetPid = projectMap.get(pc.projectId);
    if (!targetPid) continue;

    const { error } = await supabaseAdmin.from('petty_cash').insert({
      workspace_id: wsId,
      project_id: targetPid,
      legacy_id: pc.id,
      petty_cash_no: (pc as any).transactionNumber || pc.pettyCashNo || `KAS-${Date.now().toString(36)}`,
      amount: pc.amount,
      category: pc.category,
      purpose: pc.purpose,
      status: pc.status,
      requester_id: ownerId,
      requester_name: (pc as any).requestedBy || pc.requester || 'Site Manager',
      reviewed_by: ownerId,
      reviewed_at: (pc as any).approvedAt || pc.reviewedAt || null,
    });
    if (error && error.code !== '23505') console.error('Petty Cash error:', error.message);
  }
  console.log('✓ Petty Cash complete');

  // 4. Notifications
  console.log('Seeding Notifications...');
  for (const notif of INITIAL_NOTIFICATIONS) {
    const { error } = await supabaseAdmin.from('notifications').insert({
      workspace_id: wsId,
      title: notif.title,
      message: notif.message,
      type: (notif as any).type === 'danger' ? 'alert' : notif.type,
      target_screen: (notif as any).link?.replace('/', '') || notif.targetScreen || 'dashboard',
    });
    if (error && error.code !== '23505') console.error('Notif error:', error.message);
  }
  console.log('✓ Notifications complete');

  // 5. Budget Revisions
  console.log('Seeding Budget Revisions...');
  for (const rev of INITIAL_BUDGET_REVISIONS) {
    const targetPid = projectMap.get(rev.projectId);
    if (!targetPid) continue;

    const { error } = await supabaseAdmin.from('budget_revisions').insert({
      workspace_id: wsId,
      project_id: targetPid,
      legacy_id: rev.id,
      revision_number: rev.revisionNumber,
      title: rev.title,
      division_name: rev.divisionName,
      original_amount: rev.originalAmount,
      proposed_amount: rev.proposedAmount,
      justification: rev.justification,
      status: rev.status,
      submitted_by: ownerId,
      submitted_at: rev.submittedAt,
    });
    if (error && error.code !== '23505') console.error('Budget revision error:', error.message);
  }
  console.log('✓ Budget Revisions complete');

  // 6. Budget Versions (Baseline v0 Kontrak Induk for each project)
  console.log('Seeding Budget Versions...');
  for (const [legacyId, targetPid] of projectMap.entries()) {
    const { error } = await supabaseAdmin.from('budget_versions').insert({
      workspace_id: wsId,
      project_id: targetPid,
      legacy_id: `ver-${legacyId}-v0`,
      version_number: 'v0 Kontrak Induk',
      effective_date: '2026-01-01',
      approved_by: ownerId,
      total_planned_amount: 15000000000,
      description: 'Pagu awal disahkan sesuai Kontrak Kerja Konstruksi.',
      division_amounts: {
        'Pekerjaan Persiapan': 1200000000,
        'Pekerjaan Struktur': 9750000000,
        'Pekerjaan Arsitektur': 2250000000,
        'Pekerjaan MEP': 1800000000,
      },
    });
    if (error && error.code !== '23505') console.error('Budget version error:', error.message);
  }
  console.log('✓ Budget Versions complete');

  // 7. Audit Logs
  console.log('Seeding Audit Logs...');
  for (const aud of INITIAL_AUDIT_LOGS) {
    const targetPid = aud.projectId ? projectMap.get(aud.projectId) : null;
    const { error } = await supabaseAdmin.from('audit_logs').insert({
      workspace_id: wsId,
      project_id: targetPid || null,
      action: aud.action,
      actor_id: ownerId,
      actor_name: aud.actor?.name || 'Direktur Utama',
      actor_role: 'owner',
      record_type: aud.recordType,
      record_id: targetPid || null,
      details: aud.details,
      created_at: aud.timestamp,
    });
    if (error && error.code !== '23505') console.error('Audit log error:', error.message);
  }
  console.log('✓ Audit Logs complete');
}

completeSeed().catch(console.error);
