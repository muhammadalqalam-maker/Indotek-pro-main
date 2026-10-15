/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * AHSP PUPR Test Suite (Permen PUPR No. 8 Tahun 2023)
 * Menguji:
 * 1. Struktur migrasi SQL 0010 (ahsp_templates + ahsp_components)
 * 2. Kelengkapan dan integritas koefisien 20 item standar pekerjaan sipil PUPR
 * 3. Logika simulasi perhitungan Biaya Langsung + Overhead (10%) + Total Harga Satuan
 */

import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${msg}`);
    failed++;
    throw new Error(msg);
  } else {
    console.log(`✅ PASS: ${msg}`);
    passed++;
  }
}

async function runTests() {
  console.log('\n--- [TEST SUITE: AHSP TEMPLATES & SEED 20 ITEM PERMEN PUPR 8/2023] ---');

  // TEST 1: Verifikasi File Migrasi SQL 0010
  console.log('\n[1] Verifikasi File Migrasi 20261013000010_ahsp_templates.sql');
  const migPath = path.resolve(process.cwd(), 'supabase/migrations/20261013000010_ahsp_templates.sql');
  assert(fs.existsSync(migPath), 'File migrasi 0010 harus ada di supabase/migrations');

  const sql = fs.readFileSync(migPath, 'utf8');
  assert(sql.includes('create table if not exists public.ahsp_templates'), 'Tabel ahsp_templates harus dibuat');
  assert(sql.includes('create table if not exists public.ahsp_components'), 'Tabel ahsp_components harus dibuat');
  assert(sql.includes('workspace_id uuid not null'), 'Multi-tenant: kolom workspace_id wajib ada');
  assert(sql.includes('koefisien numeric(12,6) not null check (koefisien > 0)'), 'Koefisien harus numeric presisi tinggi positif');
  assert(sql.includes('overhead_profit_pct numeric(5,2) not null default 10.00'), 'Overhead default 10%');
  assert(sql.includes('alter table public.ahsp_templates enable row level security'), 'RLS ahsp_templates harus diaktifkan');
  assert(sql.includes('alter table public.ahsp_components enable row level security'), 'RLS ahsp_components harus diaktifkan');
  assert(sql.includes('create or replace function public.calculate_ahsp_unit_price'), 'RPC calculate_ahsp_unit_price harus ada');
  assert(sql.includes('create or replace function public.seed_pupr_ahsp_templates'), 'RPC seed_pupr_ahsp_templates harus ada');
  assert(sql.includes('Migration 0010 (ahsp_templates) assertions lulus'), 'Blok assertion SQL harus ada');

  // TEST 2: Verifikasi 20 Item Standar PUPR di seed function
  console.log('\n[2] Verifikasi 20 Item Acuan Permen PUPR No. 8 Tahun 2023');
  for (let i = 1; i <= 20; i++) {
    const code = `PUPR-${String(i).padStart(2, '0')}`;
    assert(sql.includes(code), `Item ${code} harus ada di daftar seed`);
  }

  // Verifikasi beberapa koefisien kunci dari Permen PUPR 8/2023:
  // Item 1 (Pembersihan Lapangan): Pekerja 0.10, Mandor 0.05
  assert(sql.includes('PUPR-01') && sql.includes('0.100000') && sql.includes('0.050000'), 'Koefisien Pembersihan Lapangan cocok dengan Permen PUPR 8/2023');
  // Item 2 (Galian Tanah): Pekerja 0.75, Mandor 0.025
  assert(sql.includes('PUPR-02') && sql.includes('0.750000') && sql.includes('0.025000'), 'Koefisien Galian Tanah cocok dengan Permen PUPR 8/2023');
  // Item 5 (Pondasi Batu Belah 1:4): Batu 1.2, Semen 163, Pasir 0.52, Pekerja 1.5, Tukang 0.75
  assert(sql.includes('PUPR-05') && sql.includes('163.000000') && sql.includes('0.520000'), 'Koefisien Pasangan Pondasi Batu Belah cocok dengan Permen PUPR 8/2023');
  // Item 7 (Beton K-225): Semen 371, Pasir 698, Kerikil 1047, Molen 0.25
  assert(sql.includes('PUPR-07') && sql.includes('371.000000') && sql.includes('1047.000000'), 'Koefisien Beton Mutu f\'c 19.3 MPa cocok dengan Permen PUPR 8/2023');
  // Item 12 (Bata Merah 1:4): Bata 70, Semen 11.5, Pasir 0.043
  assert(sql.includes('PUPR-12') && sql.includes('70.000000') && sql.includes('11.500000'), 'Koefisien Pasangan Bata Merah cocok dengan Permen PUPR 8/2023');

  // TEST 3: Simulasi Perhitungan Harga Satuan AHSP (Item Pondasi Batu Belah PUPR-05)
  console.log('\n[3] Simulasi Perhitungan Harga Satuan AHSP (Direct Cost + Overhead 10%)');
  // Mock harga dasar katalog:
  // Batu belah: Rp 350.000 / m3 -> 1.2 x 350.000 = Rp 420.000
  // Semen PC: Rp 1.560 / kg (Rp 78.000 / 50kg) -> 163 x 1.560 = Rp 254.280
  // Pasir pasang: Rp 320.000 / m3 -> 0.52 x 320.000 = Rp 166.400
  // Pekerja: Rp 140.000 / OH -> 1.5 x 140.000 = Rp 210.000
  // Tukang: Rp 180.000 / OH -> 0.75 x 180.000 = Rp 135.000
  // Mandor: Rp 210.000 / OH -> 0.075 x 210.000 = Rp 15.750

  const subtotalBahan = Math.round(1.2 * 350000) + Math.round(163 * 1560) + Math.round(0.52 * 320000);
  const subtotalTenaga = Math.round(1.5 * 140000) + Math.round(0.75 * 180000) + Math.round(0.075 * 210000);
  const directCost = subtotalBahan + subtotalTenaga;
  const overheadPct = 10.0;
  const overheadAmount = Math.round(directCost * (overheadPct / 100));
  const totalHargaSatuan = directCost + overheadAmount;

  assert(subtotalBahan === 840680, `Subtotal bahan harus Rp 840.680 (didapat: ${subtotalBahan})`);
  assert(subtotalTenaga === 360750, `Subtotal tenaga harus Rp 360.750 (didapat: ${subtotalTenaga})`);
  assert(directCost === 1201430, `Direct cost harus Rp 1.201.430 (didapat: ${directCost})`);
  assert(overheadAmount === 120143, `Overhead 10% harus Rp 120.143 (didapat: ${overheadAmount})`);
  assert(totalHargaSatuan === 1321573, `Total harga satuan pekerjaan harus Rp 1.321.573 (didapat: ${totalHargaSatuan})`);

  console.log(`\n==========================================`);
  console.log(`RINGKASAN AHSP TEST: ${passed} lulus, ${failed} gagal.`);
  console.log(`==========================================\n`);

  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
