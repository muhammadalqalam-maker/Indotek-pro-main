import 'dotenv/config';
import { supabaseAdmin, loadSupabaseServerConfig } from '../src/server/supabaseAdmin';
import {
  INITIAL_PROJECTS,
  INITIAL_MATERIALS,
  INITIAL_BUDGET_LINES,
  INITIAL_MILESTONES,
  INITIAL_WBS,
  INITIAL_PURCHASE_ORDERS,
  INITIAL_FIELD_REPORTS,
  INITIAL_PETTY_CASH,
  INITIAL_NOTIFICATIONS,
  INITIAL_ACTIVITIES,
  INITIAL_STOCK_MUTATIONS,
} from '../seed/mockData';

async function seedSupabase() {
  console.log('============================================================');
  console.log('   INDOTEK PRO — SEEDING INITIAL ENTERPRISE DATA TO SUPABASE');
  console.log('============================================================');

  // 1. Get workspace
  const { data: workspaces, error: wsErr } = await supabaseAdmin
    .from('workspaces')
    .select('id, slug, name')
    .eq('slug', 'indotek-jkt')
    .limit(1);

  if (wsErr || !workspaces?.length) {
    console.error('Workspace indotek-jkt not found!');
    process.exit(1);
  }

  const wsId = workspaces[0].id;
  console.log(`Using Workspace: ${workspaces[0].name} (${wsId})`);

  // Get owner user id
  const { data: users } = await supabaseAdmin.auth.admin.listUsers();
  const ownerId = users?.users?.[0]?.id || null;

  // 2. Seed Projects
  console.log(`\nSeeding ${INITIAL_PROJECTS.length} Projects...`);
  const projectMap = new Map<string, string>(); // legacy id -> uuid

  for (const p of INITIAL_PROJECTS) {
    const { data: existing } = await supabaseAdmin
      .from('projects')
      .select('id')
      .eq('workspace_id', wsId)
      .eq('code', p.code)
      .maybeSingle();

    let pid = existing?.id;
    if (!pid) {
      const { data: inserted, error: pErr } = await supabaseAdmin
        .from('projects')
        .insert({
          workspace_id: wsId,
          legacy_id: p.id,
          code: p.code,
          name: p.name,
          client: p.client,
          category: p.category,
          location: p.location,
          project_manager: p.projectManager,
          site_engineer: p.siteEngineer,
          contract_value: p.contractValue,
          approved_budget: p.approvedBudget,
          actual_cost: p.actualCost,
          start_date: p.startDate,
          target_end_date: p.targetEndDate,
          progress_actual: p.progressActual,
          progress_planned: p.progressPlanned,
          status: p.status,
          schedule_status: p.scheduleStatus,
          image_url: p.image || null,
          description: p.description,
          total_milestones: p.totalMilestones,
          completed_milestones: p.completedMilestones,
          created_by: ownerId,
        })
        .select('id')
        .single();

      if (pErr) {
        console.error(`  ✗ Project ${p.code}:`, pErr.message);
      } else {
        pid = inserted.id;
        console.log(`  ✓ Inserted Project: ${p.name}`);
      }
    } else {
      console.log(`  ✓ Project exists: ${p.name}`);
    }

    if (pid) {
      projectMap.set(p.id, pid);
    }
  }

  // 3. Seed Materials
  console.log(`\nSeeding ${INITIAL_MATERIALS.length} Materials...`);
  const materialMap = new Map<string, string>(); // legacy id -> uuid

  for (const m of INITIAL_MATERIALS) {
    const { data: existing } = await supabaseAdmin
      .from('materials')
      .select('id')
      .eq('workspace_id', wsId)
      .eq('code', m.code)
      .maybeSingle();

    let mid = existing?.id;
    if (!mid) {
      const { data: inserted, error: mErr } = await supabaseAdmin
        .from('materials')
        .insert({
          workspace_id: wsId,
          legacy_id: m.id,
          code: m.code,
          name: m.name,
          specification: m.specification || '',
          category: m.category,
          unit: m.unit,
          current_stock: m.currentStock,
          min_stock: m.minStock,
          warehouse_location: m.warehouseLocation || '',
          primary_supplier: m.primarySupplier || '',
          unit_price: m.unitPrice || 0,
          status: m.status,
          allocated_project_id: m.allocatedProjectId ? projectMap.get(m.allocatedProjectId) || null : null,
        })
        .select('id')
        .single();

      if (mErr) {
        console.error(`  ✗ Material ${m.code}:`, mErr.message);
      } else {
        mid = inserted.id;
        console.log(`  ✓ Inserted Material: ${m.name}`);
      }
    } else {
      console.log(`  ✓ Material exists: ${m.name}`);
    }

    if (mid) {
      materialMap.set(m.id, mid);
    }
  }

  // 4. Seed Milestones
  console.log(`\nSeeding Milestones...`);
  for (const ms of INITIAL_MILESTONES) {
    const targetPid = projectMap.get(ms.projectId);
    if (!targetPid) continue;

    const { error: msErr } = await supabaseAdmin
      .from('milestones')
      .insert({
        workspace_id: wsId,
        project_id: targetPid,
        legacy_id: ms.id,
        title: ms.title,
        wbs_code: ms.wbsCode || '',
        planned_date: ms.plannedDate ? ms.plannedDate.split('T')[0] : null,
        actual_date: ms.actualDate ? ms.actualDate.split('T')[0] : null,
        progress: ms.progress,
        status: ms.status,
        weight_percent: ms.weightPercent,
        bast_ref: ms.bastRef || null,
        signed_off_by: ms.signedOffByUid && ms.signedOffByUid.length === 36 ? ms.signedOffByUid : null,
      });

    if (msErr && msErr.code !== '23505') {
      console.error(`  ✗ Milestone ${ms.title}:`, msErr.message);
    }
  }
  console.log(`  ✓ Milestones seeded`);

  // 5. Seed Budget Lines
  console.log(`\nSeeding Budget Lines (RAB)...`);
  for (const bl of INITIAL_BUDGET_LINES) {
    const targetPid = projectMap.get(bl.projectId);
    if (!targetPid) continue;

    const { error: blErr } = await supabaseAdmin
      .from('budget_lines')
      .insert({
        workspace_id: wsId,
        project_id: targetPid,
        legacy_id: bl.id,
        code: bl.code,
        division_name: bl.divisionName,
        category: bl.category,
        planned_amount: bl.plannedAmount,
        actual_amount: bl.actualAmount,
        unit: bl.unit,
        volume: bl.volume,
        unit_rate: bl.unitRate,
        status: bl.status,
      });

    if (blErr && blErr.code !== '23505') {
      console.error(`  ✗ Budget Line ${bl.code}:`, blErr.message);
    }
  }
  console.log(`  ✓ Budget Lines seeded`);

  // 6. Seed WBS Items
  console.log(`\nSeeding WBS Items...`);
  for (const w of INITIAL_WBS) {
    const targetPid = projectMap.get(w.projectId);
    if (!targetPid) continue;

    const { error: wErr } = await supabaseAdmin
      .from('wbs_items')
      .insert({
        workspace_id: wsId,
        project_id: targetPid,
        legacy_id: w.id,
        code: w.code,
        name: w.name,
        category: w.category || '',
        duration_days: w.durationDays,
        start_date: w.startDate ? w.startDate.split('T')[0] : null,
        end_date: w.endDate ? w.endDate.split('T')[0] : null,
        planned_progress: w.plannedProgress,
        actual_progress: w.actualProgress,
        status: w.status,
        critical_path: w.criticalPath,
        assigned_team: w.assignedTeam || '',
      });

    if (wErr && wErr.code !== '23505') {
      console.error(`  ✗ WBS ${w.code}:`, wErr.message);
    }
  }
  console.log(`  ✓ WBS Items seeded`);

  // 7. Seed Purchase Orders
  console.log(`\nSeeding Purchase Orders...`);
  for (const po of INITIAL_PURCHASE_ORDERS) {
    const targetPid = projectMap.get(po.projectId);
    if (!targetPid) continue;

    const { error: poErr } = await supabaseAdmin
      .from('purchase_orders')
      .insert({
        workspace_id: wsId,
        project_id: targetPid,
        legacy_id: po.id,
        po_number: po.poNumber,
        supplier_name: po.supplierName,
        item_description: po.itemDescription || '',
        quantity_summary: po.quantitySummary || '',
        total_cost: po.totalCost,
        status: po.status,
        requested_by_name: (po as any).requestedBy || po.requester || 'Procurement',
        requested_by: ownerId,
        approved_by_name: po.approvedBy || null,
        approved_by: (po as any).approvedByUid && (po as any).approvedByUid.length === 36 ? (po as any).approvedByUid : null,
        approved_at: po.approvedAt || null,
        target_delivery_date: po.targetDeliveryDate || null,
      });

    if (poErr && poErr.code !== '23505') {
      console.error(`  ✗ PO ${po.poNumber}:`, poErr.message);
    }
  }
  console.log(`  ✓ Purchase Orders seeded`);

  // 8. Seed Field Reports
  console.log(`\nSeeding Field Reports...`);
  for (const fr of INITIAL_FIELD_REPORTS) {
    const targetPid = projectMap.get(fr.projectId);
    if (!targetPid) continue;

    const { error: frErr } = await supabaseAdmin
      .from('field_reports')
      .insert({
        workspace_id: wsId,
        project_id: targetPid,
        legacy_id: fr.id,
        report_number: fr.reportNumber,
        report_date: (fr as any).reportDate || fr.date,
        weather_morning: fr.weatherMorning || 'Cerah',
        weather_afternoon: fr.weatherAfternoon || 'Cerah',
        working_hours: fr.workingHours || 8,
        status: fr.status,
        workforce: fr.workforce || [],
        completed_works: fr.completedWorks || [],
        materials_used: fr.materialsUsed || [],
        equipment_used: fr.equipmentUsed || [],
        blockers: fr.blockers || null,
        prepared_by_name: (fr as any).preparedBy || fr.siteSupervisor || 'Site Manager',
        prepared_by: ownerId,
      });

    if (frErr && frErr.code !== '23505') {
      console.error(`  ✗ Field Report ${fr.reportNumber}:`, frErr.message);
    }
  }
  console.log(`  ✓ Field Reports seeded`);

  // 9. Seed Petty Cash
  console.log(`\nSeeding Petty Cash...`);
  for (const pc of INITIAL_PETTY_CASH) {
    const targetPid = projectMap.get(pc.projectId);
    if (!targetPid) continue;

    const { error: pcErr } = await supabaseAdmin
      .from('petty_cash')
      .insert({
        workspace_id: wsId,
        project_id: targetPid,
        legacy_id: pc.id,
        transaction_number: (pc as any).transactionNumber || pc.pettyCashNo,
        amount: pc.amount,
        category: pc.category,
        purpose: pc.purpose,
        status: pc.status,
        requested_by_name: (pc as any).requestedBy || pc.requester || 'Site Manager',
        requested_by: ownerId,
        approved_by_name: (pc as any).approvedBy || pc.reviewedBy || null,
        approved_by: (pc as any).approvedByUid && (pc as any).approvedByUid.length === 36 ? (pc as any).approvedByUid : null,
        approved_at: (pc as any).approvedAt || pc.reviewedAt || null,
      });

    if (pcErr && pcErr.code !== '23505') {
      console.error(`  ✗ Petty Cash ${(pc as any).transactionNumber || pc.pettyCashNo}:`, pcErr.message);
    }
  }
  console.log(`  ✓ Petty Cash seeded`);

  // 10. Seed Notifications
  console.log(`\nSeeding Notifications...`);
  for (const notif of INITIAL_NOTIFICATIONS) {
    const { error: nErr } = await supabaseAdmin
      .from('notifications')
      .insert({
        workspace_id: wsId,
        title: notif.title,
        message: notif.message,
        type: (notif as any).type === 'danger' ? 'alert' : notif.type,
        is_read: notif.read,
        link_path: (notif as any).link || notif.targetScreen || null,
        target_role: (notif as any).role ? (notif as any).role.toLowerCase().replace(/[^a-z_]/g, '_') : null,
      });

    if (nErr && nErr.code !== '23505') {
      console.error(`  ✗ Notification:`, nErr.message);
    }
  }
  console.log(`  ✓ Notifications seeded`);

  console.log('\n============================================================');
  console.log('✓ SEEDING INITIAL DATA KE SUPABASE SELESAI DENGAN SUKSES!');
  console.log('============================================================\n');
}

seedSupabase().catch((err) => {
  console.error('Fatal seed error:', err);
  process.exit(1);
});
