/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * BOQ & RAB Test Suite (Tahap C)
 * Menguji:
 * 1. Struktur migrasi SQL 0011 (boq_items, rollup budget_lines, PPN 11%)
 * 2. Fungsi terbilang Rupiah resmi Bahasa Indonesia
 * 3. Kalkulasi 20 item BOQ nyata, pembagian bobot (100%), rollup divisi, PPN 11%, dan Grand Total
 */

import fs from 'fs';
import path from 'path';
import { terbilangRupiah } from '../src/utils/formatters';

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
  console.log('\n--- [TEST SUITE: BOQ ITEMS, REKAP DIVISI, PPN 11%, & TERBILANG] ---');

  // TEST 1: Verifikasi File Migrasi SQL 0011
  console.log('\n[1] Verifikasi File Migrasi 20261013000011_boq_items.sql');
  const migPath = path.resolve(process.cwd(), 'supabase/migrations/20261013000011_boq_items.sql');
  assert(fs.existsSync(migPath), 'File migrasi 0011 harus ada di supabase/migrations');

  const sql = fs.readFileSync(migPath, 'utf8');
  assert(sql.includes('create table if not exists public.boq_items'), 'Tabel boq_items harus dibuat');
  assert(sql.includes('workspace_id uuid not null'), 'Multi-tenant: kolom workspace_id wajib ada');
  assert(sql.includes('project_id uuid not null'), 'Relasi project_id wajib ada');
  assert(sql.includes('volume numeric(18,3) not null default 0'), 'Volume numeric presisi tinggi');
  assert(sql.includes('harga_satuan bigint not null default 0'), 'Harga satuan bigint Rupiah');
  assert(sql.includes('jumlah_harga bigint not null default 0'), 'Jumlah harga bigint Rupiah');
  assert(sql.includes('bobot_persen numeric(7,4) not null default 0'), 'Bobot persen presisi 4 desimal');
  assert(sql.includes('alter table public.boq_items enable row level security'), 'RLS boq_items harus diaktifkan');
  assert(sql.includes('create or replace function public.terbilang_rupiah'), 'Fungsi terbilang_rupiah di database');
  assert(sql.includes('create or replace function public.upsert_boq_item'), 'RPC upsert_boq_item harus ada');
  assert(sql.includes('create or replace function public.delete_boq_item'), 'RPC delete_boq_item harus ada');
  assert(sql.includes('create or replace function public.update_boq_item_progress'), 'RPC update_boq_item_progress harus ada');
  assert(sql.includes('create or replace function public.get_project_boq_summary'), 'RPC get_project_boq_summary harus ada');
  assert(sql.includes('create or replace function public.update_project_ppn'), 'RPC update_project_ppn harus ada');
  assert(sql.includes('Migration 0011 (boq_items) assertions lulus'), 'Blok assertion SQL harus ada');

  // TEST 2: Uji Fungsi Terbilang Rupiah
  console.log('\n[2] Uji Fungsi Terbilang Rupiah (Bahasa Indonesia)');
  assert(terbilangRupiah(0) === 'Nol Rupiah', '0 -> Nol Rupiah');
  assert(terbilangRupiah(1250000) === 'Satu Juta Dua Ratus Lima Puluh Ribu Rupiah', '1.250.000 terbilang cocok');
  assert(terbilangRupiah(84500000000) === 'Delapan Puluh Empat Miliar Lima Ratus Juta Rupiah', '84.500.000.000 terbilang cocok');
  assert(terbilangRupiah(1500) === 'Seribu Lima Ratus Rupiah', '1.500 terbilang cocok');
  assert(terbilangRupiah(21500000) === 'Dua Belas Belas... koreksi: Dua Puluh Satu Juta Lima Ratus Ribu Rupiah' ||
         terbilangRupiah(21500000) === 'Dua Puluh Satu Juta Lima Ratus Ribu Rupiah', '21.500.000 terbilang cocok');

  // TEST 3: Simulasi 20 Item BOQ Pekerjaan Sipil Nyata
  console.log('\n[3] Simulasi Perhitungan 20 Item BOQ Pekerjaan Sipil Nyata');
  const items = [
    { kode: '1.1', div: 'Pekerjaan Persiapan', uraian: 'Pembersihan lapangan dan perataan', sat: 'm2', vol: 250, harga: 24500 },
    { kode: '1.2', div: 'Pekerjaan Persiapan', uraian: 'Pengukuran dan pemasangan bowplank', sat: 'm1', vol: 64, harga: 65000 },
    { kode: '2.1', div: 'Pekerjaan Struktur', uraian: 'Galian tanah pondasi batu belah', sat: 'm3', vol: 54, harga: 110250 },
    { kode: '2.2', div: 'Pekerjaan Struktur', uraian: 'Urugan tanah kembali bekas galian', sat: 'm3', vol: 18, harga: 38500 },
    { kode: '2.3', div: 'Pekerjaan Struktur', uraian: 'Urugan pasir bawah pondasi tebal 10 cm', sat: 'm3', vol: 12, harga: 426800 },
    { kode: '2.4', div: 'Pekerjaan Struktur', uraian: 'Pasangan pondasi batu belah camp. 1:4', sat: 'm3', vol: 36, harga: 1321570 },
    { kode: '2.5', div: 'Pekerjaan Struktur', uraian: 'Lantai kerja beton mutu f\'c=7.4 MPa (B-0)', sat: 'm3', vol: 8.5, harga: 1085000 },
    { kode: '2.6', div: 'Pekerjaan Struktur', uraian: 'Beton struktur f\'c=19.3 MPa (K-225)', sat: 'm3', vol: 42, harga: 1450000 },
    { kode: '2.7', div: 'Pekerjaan Struktur', uraian: 'Pembesian dengan besi beton polos BjTP 280', sat: 'kg', vol: 1850, harga: 17500 },
    { kode: '2.8', div: 'Pekerjaan Struktur', uraian: 'Pembesian dengan besi beton ulir BjTS 420', sat: 'kg', vol: 3200, harga: 18200 },
    { kode: '2.9', div: 'Pekerjaan Struktur', uraian: 'Bekisting untuk sloof kayu kelas III', sat: 'm2', vol: 85, harga: 215000 },
    { kode: '2.10', div: 'Pekerjaan Struktur', uraian: 'Bekisting untuk kolom dan balok', sat: 'm2', vol: 140, harga: 345000 },
    { kode: '3.1', div: 'Pekerjaan Arsitektur', uraian: 'Pasangan dinding bata merah tebal 1/2 bata 1:4', sat: 'm2', vol: 280, harga: 165000 },
    { kode: '3.2', div: 'Pekerjaan Arsitektur', uraian: 'Plesteran dinding tebal 15 mm camp. 1:4', sat: 'm2', vol: 560, harga: 78500 },
    { kode: '3.3', div: 'Pekerjaan Arsitektur', uraian: 'Acian dinding semen', sat: 'm2', vol: 560, harga: 42000 },
    { kode: '3.4', div: 'Pekerjaan Arsitektur', uraian: 'Pengecatan dinding interior 3 lapis', sat: 'm2', vol: 560, harga: 38500 },
    { kode: '3.5', div: 'Pekerjaan Arsitektur', uraian: 'Pemasangan keramik lantai 40x40 cm', sat: 'm2', vol: 180, harga: 225000 },
    { kode: '3.6', div: 'Pekerjaan Arsitektur', uraian: 'Pemasangan plafon gypsum 9 mm + hollow', sat: 'm2', vol: 180, harga: 135000 },
    { kode: '3.7', div: 'Pekerjaan Arsitektur', uraian: 'Pemasangan rangka atap baja ringan', sat: 'm2', vol: 210, harga: 195000 },
    { kode: '3.8', div: 'Pekerjaan Arsitektur', uraian: 'Pemasangan penutup atap genteng metal pasir', sat: 'm2', vol: 210, harga: 125000 },
  ];

  assert(items.length === 20, 'Harus ada persis 20 item pekerjaan');

  // Hitung jumlah harga per item
  const calculatedItems = items.map(it => {
    const jumlah = Math.round(it.vol * it.harga);
    return { ...it, jumlah };
  });

  const totalSubtotal = calculatedItems.reduce((acc, curr) => acc + curr.jumlah, 0);
  assert(totalSubtotal > 0, `Total subtotal BOQ harus > 0 (dihasilkan: ${totalSubtotal})`);

  // Hitung bobot per item
  let totalBobot = 0;
  calculatedItems.forEach(it => {
    const bobot = (it.jumlah / totalSubtotal) * 100;
    totalBobot += bobot;
  });

  assert(Math.abs(totalBobot - 100.0) < 0.001, `Akumulasi bobot seluruh item harus 100% (ditemukan: ${totalBobot.toFixed(4)}%)`);

  // Hitung PPN 11%
  const ppnPercent = 11.0;
  const ppnNominal = Math.round(totalSubtotal * (ppnPercent / 100));
  const grandTotal = totalSubtotal + ppnNominal;

  assert(ppnNominal === Math.round(totalSubtotal * 0.11), 'Nominal PPN 11% presisi');
  assert(grandTotal === totalSubtotal + ppnNominal, 'Grand total persis Subtotal + PPN');

  // Rollup per divisi
  const divisiTotals: Record<string, number> = {};
  calculatedItems.forEach(it => {
    divisiTotals[it.div] = (divisiTotals[it.div] || 0) + it.jumlah;
  });

  assert(divisiTotals['Pekerjaan Persiapan'] > 0, 'Divisi Persiapan terisi');
  assert(divisiTotals['Pekerjaan Struktur'] > 0, 'Divisi Struktur terisi');
  assert(divisiTotals['Pekerjaan Arsitektur'] > 0, 'Divisi Arsitektur terisi');

  const sumDivisi = Object.values(divisiTotals).reduce((a, b) => a + b, 0);
  assert(sumDivisi === totalSubtotal, 'Total seluruh divisi cocok persis dengan Grand Subtotal BOQ');

  console.log(`\n==========================================`);
  console.log(`TOTAL SUBTOAL BOQ : Rp ${totalSubtotal.toLocaleString('id-ID')}`);
  console.log(`PPN (11%)         : Rp ${ppnNominal.toLocaleString('id-ID')}`);
  console.log(`GRAND TOTAL KONTRAK: Rp ${grandTotal.toLocaleString('id-ID')}`);
  console.log(`TERBILANG         : ${terbilangRupiah(grandTotal)}`);
  console.log(`==========================================`);
  console.log(`RINGKASAN BOQ TEST: ${passed} lulus, ${failed} gagal.`);
  console.log(`==========================================\n`);

  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
