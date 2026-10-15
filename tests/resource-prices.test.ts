/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Resource Prices (Katalog Harga Dasar) — Unit & Integration Test Suite
 * Menguji:
 * 1. Validasi parsing file CSV/XLSX
 * 2. Normalisasi kolom & pembersihan nominal mata uang Rupiah (Bigint/Integer)
 * 3. Kategori sumber daya (Bahan, Upah, Alat, Subkon)
 * 4. Konsistensi file migrasi SQL 0009 & RLS assertions
 */

import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { parseResourcePricesFile } from '../src/utils/resourcePriceImport';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    testsFailed++;
    throw new Error(message);
  } else {
    console.log(`✅ PASS: ${message}`);
    testsPassed++;
  }
}

async function runTestSuite() {
  console.log('\n--- [TEST SUITE: KATALOG HARGA DASAR & PARSER EXCEL/CSV] ---');

  // TEST 1: Verifikasi File Migrasi SQL 0009
  console.log('\n[1] Verifikasi File Migrasi 20261013000009_resource_prices.sql');
  const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261013000009_resource_prices.sql');
  assert(fs.existsSync(migrationPath), 'File migrasi 0009 harus ada di supabase/migrations');

  const migrationContent = fs.readFileSync(migrationPath, 'utf8');
  assert(migrationContent.includes('create table if not exists public.resource_prices'), 'Tabel resource_prices harus didefinisikan');
  assert(migrationContent.includes('workspace_id uuid not null'), 'Multi-tenant: kolom workspace_id wajib ada');
  assert(migrationContent.includes('harga bigint not null check (harga >= 0)'), 'Uang: harga harus bigint Rupiah non-negatif');
  assert(migrationContent.includes('alter table public.resource_prices enable row level security'), 'RLS harus diaktifkan');
  assert(migrationContent.includes('create or replace function public.upsert_resource_price'), 'RPC upsert_resource_price harus ada');
  assert(migrationContent.includes('create or replace function public.import_resource_prices_batch'), 'RPC import_resource_prices_batch harus ada');
  assert(migrationContent.includes('create or replace function public.delete_resource_price'), 'RPC delete_resource_price harus ada');
  assert(migrationContent.includes('uq_resource_price_unique unique'), 'Constraint unique harus ada');
  assert(migrationContent.includes('Migration 0009 (resource_prices) assertions lulus'), 'Blok assertion SQL harus ada');

  // TEST 2: Parsing Buffer Excel / SheetJS dengan Variasi Kolom
  console.log('\n[2] Uji Parsing Workbook Excel (.xlsx / array buffer)');
  const mockRows = [
    ['Kode Item', 'Kategori', 'Uraian Sumber Daya', 'Satuan', 'Harga Satuan (Rp)', 'Wilayah', 'Spesifikasi'],
    ['BHN-001', 'Bahan', 'Semen Portland (PC) 50kg', 'zak', 'Rp 78.500', 'Balikpapan', 'SNI Tipe I'],
    ['UPH-001', 'Upah', 'Tukang Batu', 'OH', '180.000', 'Balikpapan', 'Berpengalaman'],
    ['ALT-001', 'Alat', 'Concrete Mixer 0.35m3', 'hari', 350000, 'Balikpapan', 'Diesel 7.5HP'],
    ['SBK-001', 'Subkon', 'Pekerjaan Pemasangan Rangka Baja', 'm2', '125000', 'Balikpapan', 'Tenaga & Alat Ahli'],
    ['ERR-001', 'Bahan', '', 'kg', '50.000', 'Balikpapan', 'Invalid baris tanpa uraian'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(mockRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

  // Buat mock File object
  const mockFile = {
    name: 'test_katalog.xlsx',
    arrayBuffer: async () => buffer,
  } as unknown as File;

  const parseResult = await parseResourcePricesFile(mockFile);

  assert(parseResult.totalParsed === 5, `Total parsed harus 5 baris data (ditemukan ${parseResult.totalParsed})`);
  assert(parseResult.validRows.length === 4, `Baris valid harus 4 (ditemukan ${parseResult.validRows.length})`);
  assert(parseResult.invalidRows.length === 1, `Baris invalid harus 1 karena uraian kosong (ditemukan ${parseResult.invalidRows.length})`);

  // Periksa data hasil parse baris 1 (Semen Portland)
  const semen = parseResult.validRows.find(r => r.kode === 'BHN-001');
  assert(Boolean(semen), 'Item BHN-001 harus ditemukan');
  assert(semen?.jenis === 'Bahan', 'Jenis item harus "Bahan"');
  assert(semen?.harga === 78500, `Harga harus dikonversi dari "Rp 78.500" menjadi 78500 (ditemukan ${semen?.harga})`);
  assert(semen?.satuan === 'zak', 'Satuan harus "zak"');

  // Periksa data upah
  const tukang = parseResult.validRows.find(r => r.kode === 'UPH-001');
  assert(Boolean(tukang), 'Item UPH-001 harus ditemukan');
  assert(tukang?.jenis === 'Upah', 'Jenis item harus "Upah"');
  assert(tukang?.harga === 180000, `Harga harus 180000 (ditemukan ${tukang?.harga})`);

  // Periksa data alat
  const mixer = parseResult.validRows.find(r => r.kode === 'ALT-001');
  assert(Boolean(mixer), 'Item ALT-001 harus ditemukan');
  assert(mixer?.jenis === 'Alat', 'Jenis item harus "Alat"');
  assert(mixer?.harga === 350000, `Harga harus 350000 (ditemukan ${mixer?.harga})`);

  // Periksa data subkon
  const subkon = parseResult.validRows.find(r => r.kode === 'SBK-001');
  assert(Boolean(subkon), 'Item SBK-001 harus ditemukan');
  assert(subkon?.jenis === 'Subkon', 'Jenis item harus "Subkon"');
  assert(subkon?.harga === 125000, `Harga harus 125000 (ditemukan ${subkon?.harga})`);

  console.log(`\n==========================================`);
  console.log(`RINGKASAN: ${testsPassed} lulus, ${testsFailed} gagal.`);
  console.log(`==========================================\n`);

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
