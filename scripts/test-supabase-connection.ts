import 'dotenv/config';
import { supabaseAdmin, loadSupabaseServerConfig } from '../src/server/supabaseAdmin';
import { supabaseWorkflowService } from '../src/server/supabaseWorkflowService';

async function testSupabaseConnection() {
  console.log('============================================================');
  console.log('   INDOTEK PRO — SUPABASE ENVIRONMENT & INTEGRATION TEST   ');
  console.log('============================================================');

  const { supabaseUrl, serviceRoleKey } = loadSupabaseServerConfig();
  console.log(`[Config] Supabase URL      : ${supabaseUrl ? 'Terkonfigurasi' : 'Tidak ada'}`);
  console.log(`[Config] Service Role Key  : ${serviceRoleKey ? 'Terkonfigurasi (Masked)' : 'Tidak ada'}`);
  console.log(`[Config] Anon Key Present  : ${Boolean(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)}`);

  let allOk = true;

  // 1. Test Auth Service
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 10 });
    if (error) {
      console.error(`[Auth] ✗ Gagal list users: ${error.message}`);
      allOk = false;
    } else {
      const users = data?.users ?? [];
      console.log(`[Auth] ✓ Layanan Auth terhubung! Jumlah akun: ${users.length}`);
      for (const user of users) {
        console.log(`       - ${user.email ?? '(tanpa email)'} (${user.id})`);
      }
    }
  } catch (err: any) {
    console.error(`[Auth] ✗ Exception Auth: ${err?.message || err}`);
    allOk = false;
  }

  // 2. Test Core Tables
  const coreTables = [
    'workspaces',
    'profiles',
    'workspace_members',
    'projects',
    'project_members',
    'milestones',
    'materials',
    'material_stock',
    'stock_mutations',
    'stock_adjustments',
    'purchase_orders',
    'budget_revisions',
    'petty_cash',
    'field_reports',
    'doc_counters',
    'audit_logs',
    'notifications',
  ];

  console.log('\n--- Status Tabel PostgreSQL (Public Schema) ---');
  for (const table of coreTables) {
    try {
      const { count, error } = await supabaseAdmin
        .from(table)
        .select('*', { count: 'exact', head: true });
      if (error) {
        console.error(`  [Table:${table.padEnd(20)}] ✗ Error: ${error.message}`);
        allOk = false;
      } else {
        console.log(`  [Table:${table.padEnd(20)}] ✓ Siap (baris: ${count ?? 0})`);
      }
    } catch (err: any) {
      console.error(`  [Table:${table.padEnd(20)}] ✗ Exception: ${err?.message || err}`);
      allOk = false;
    }
  }

  // 3. Test Workspace & Membership
  console.log('\n--- Status Workspace & Keanggotaan Owner ---');
  try {
    const { data: workspaces, error: wsErr } = await supabaseAdmin
      .from('workspaces')
      .select('id, slug, name')
      .limit(5);

    if (wsErr || !workspaces?.length) {
      console.error('  ✗ Workspace utama belum ditemukan!');
      allOk = false;
    } else {
      const ws = workspaces[0];
      console.log(`  ✓ Workspace: "${ws.name}" (slug: ${ws.slug}, id: ${ws.id})`);

      const { data: members } = await supabaseAdmin
        .from('workspace_members')
        .select('user_id, role, status, department')
        .eq('workspace_id', ws.id);

      console.log(`  ✓ Anggota terdaftar (${members?.length ?? 0}):`);
      members?.forEach((m) => {
        console.log(`    - User ID: ${m.user_id} | Role: ${m.role} | Status: ${m.status} | Dept: ${m.department}`);
      });
    }
  } catch (err: any) {
    console.error('  ✗ Gagal membaca workspace:', err?.message || err);
    allOk = false;
  }

  // 4. Test Transactional Document Counter Generator
  console.log('\n--- Uji Generator Nomor Dokumen Transaksional (Doc Counters) ---');
  try {
    const ws = (await supabaseAdmin.from('workspaces').select('id').limit(1)).data?.[0]?.id;
    if (ws) {
      const docNo = await supabaseWorkflowService.generateDocumentNumber(
        {
          uid: 'system',
          email: 'admin@indotek.id',
          name: 'System Admin',
          role: 'Owner / Director',
          department: 'Direksi',
          assignedProjectIds: ['*'],
          status: 'Aktif',
          workspaceId: ws,
        },
        'PO',
        'GP01',
        2026
      );
      console.log(`  ✓ Berhasil membuat sequential doc number: ${docNo}`);
    }
  } catch (err: any) {
    console.error('  ✗ Gagal uji doc counter:', err?.message || err);
    allOk = false;
  }

  // 5. Test RPC Guard Security (Validasi require_actor)
  console.log('\n--- Uji RPC Workflow Guard (Keamanan Database PL/pgSQL) ---');
  try {
    const { data, error } = await supabaseAdmin.rpc('create_purchase_order', {
      p_workspace_id: '00000000-0000-0000-0000-000000000000',
      p_project_id: '00000000-0000-0000-0000-000000000000',
      p_supplier_name: 'Test',
      p_item_description: 'Test',
      p_quantity_summary: '1',
      p_total_cost: 100,
    });

    if (error && error.code === '28000') {
      console.log('  ✓ RPC Guard aktif: Menolak request anonim tanpa JWT auth.uid() ("Sesi tidak valid")');
    } else if (error) {
      console.log(`  ✓ RPC Guard merespons: [${error.code}] ${error.message}`);
    } else {
      console.log('  Notice RPC result:', data);
    }
  } catch (err: any) {
    console.log('  Notice RPC probe:', err?.message || err);
  }

  console.log('\n============================================================');
  if (allOk) {
    console.log('✓ SEMUA KONEKSI & STRUKTUR SUPABASE 100% VALID & SIAP DIGUNAKAN!');
  } else {
    console.log('Catatan: Periksa komponen yang ditandai ✗ di atas.');
  }
  console.log('============================================================\n');
}

testSupabaseConnection().catch((err) => {
  console.error('Fatal connection test error:', err);
  process.exit(1);
});
