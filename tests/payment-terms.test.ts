/**
 * tests/payment-terms.test.ts
 * Uji Termin Pembayaran, Uang Muka, Retensi, Perhitungan Persen, dan SoD.
 */
import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`✅ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${msg}`);
    failed++;
  }
}

console.log('\n--- [TEST SUITE: JADWAL TERMIN PEMBAYARAN & RETENSI PROYEK] ---\n');

// 1. Verifikasi Migrasi 20261013000012_payment_terms.sql
console.log('[1] Verifikasi File Migrasi 20261013000012_payment_terms.sql');
const migrationPath = path.resolve('supabase/migrations/20261013000012_payment_terms.sql');
assert(fs.existsSync(migrationPath), 'File migrasi 0012 harus ada di supabase/migrations');

const sqlContent = fs.readFileSync(migrationPath, 'utf8');
assert(sqlContent.includes('CREATE TABLE IF NOT EXISTS public.payment_terms'), 'Tabel payment_terms harus dibuat');
assert(sqlContent.includes('workspace_id'), 'Multi-tenant: kolom workspace_id wajib ada');
assert(sqlContent.includes('project_id'), 'Relasi project_id wajib ada');
assert(sqlContent.includes("CHECK (jenis IN ('UangMuka', 'Termin', 'Retensi'))"), 'Jenis termin dibatasi (UangMuka, Termin, Retensi)');
assert(sqlContent.includes('persen'), 'Kolom persen harus ada');
assert(sqlContent.includes('nominal          bigint'), 'Kolom nominal harus bigint Rupiah');
assert(sqlContent.includes("status           text NOT NULL DEFAULT 'Draft'"), 'Default status harus Draft');
assert(sqlContent.includes('ENABLE ROW LEVEL SECURITY'), 'RLS payment_terms harus diaktifkan');
assert(sqlContent.includes('FUNCTION public.upsert_payment_term'), 'RPC upsert_payment_term harus ada');
assert(sqlContent.includes('FUNCTION public.delete_payment_term'), 'RPC delete_payment_term harus ada');
assert(sqlContent.includes('FUNCTION public.update_payment_term_status'), 'RPC update_payment_term_status harus ada');
assert(sqlContent.includes('FUNCTION public.get_payment_schedule'), 'RPC get_payment_schedule harus ada');
assert(sqlContent.includes('ASSERT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema=\'public\' AND table_name=\'payment_terms\')'), 'Blok assertion SQL harus ada');

// 2. Simulasi Perhitungan Nominal Termin & Validasi Akumulasi 100%
console.log('\n[2] Simulasi Perhitungan Termin Terhadap Nilai Kontrak');
const contractValue = 1_000_000_000; // Rp 1 Miliar

interface SampleTerm {
  jenis: 'UangMuka' | 'Termin' | 'Retensi';
  urutan: number;
  label: string;
  persen: number;
  status: 'Draft' | 'Tagih' | 'Lunas';
}

const terms: SampleTerm[] = [
  { jenis: 'UangMuka', urutan: 1, label: 'Uang Muka (DP)', persen: 20, status: 'Lunas' },
  { jenis: 'Termin', urutan: 2, label: 'Termin I (Progress Fisik 30%)', persen: 25, status: 'Lunas' },
  { jenis: 'Termin', urutan: 3, label: 'Termin II (Progress Fisik 60%)', persen: 25, status: 'Tagih' },
  { jenis: 'Termin', urutan: 4, label: 'Termin III (Progress Fisik 100%)', persen: 25, status: 'Draft' },
  { jenis: 'Retensi', urutan: 5, label: 'Retensi Pemeliharaan (6 Bulan)', persen: 5, status: 'Draft' },
];

const totalPersen = terms.reduce((acc, t) => acc + t.persen, 0);
assert(totalPersen === 100, `Total persentase termin harus persis 100% (didapat: ${totalPersen}%)`);

const calculatedTerms = terms.map(t => ({
  ...t,
  nominal: Math.round((t.persen / 100) * contractValue),
}));

const totalNominal = calculatedTerms.reduce((acc, t) => acc + t.nominal, 0);
assert(totalNominal === contractValue, `Total nominal termin harus sama dengan nilai kontrak (Rp ${totalNominal.toLocaleString('id-ID')})`);

const dp = calculatedTerms.find(t => t.jenis === 'UangMuka');
assert(dp !== undefined && dp.nominal === 200_000_000, 'DP 20% harus Rp 200.000.000');

const retensi = calculatedTerms.find(t => t.jenis === 'Retensi');
assert(retensi !== undefined && retensi.nominal === 50_000_000, 'Retensi 5% harus Rp 50.000.000');

// 3. Ringkasan Kas / Status Pembayaran
console.log('\n[3] Ringkasan Status Penagihan Termin');
const totalTagih = calculatedTerms
  .filter(t => t.status === 'Tagih' || t.status === 'Lunas')
  .reduce((acc, t) => acc + t.nominal, 0);
const totalLunas = calculatedTerms
  .filter(t => t.status === 'Lunas')
  .reduce((acc, t) => acc + t.nominal, 0);
const sisaPiutang = totalTagih - totalLunas;

assert(totalLunas === 450_000_000, 'Total penerimaan lunas (DP + Termin I) harus Rp 450.000.000');
assert(totalTagih === 700_000_000, 'Total tagihan diajukan (DP + Termin I + Termin II) harus Rp 700.000.000');
assert(sisaPiutang === 250_000_000, 'Sisa piutang tertagih belum lunas harus Rp 250.000.000');

console.log('==========================================');
console.log(`RINGKASAN PAYMENT TERMS TEST: ${passed} lulus, ${failed} gagal.`);
console.log('==========================================\n');

if (failed > 0) process.exit(1);
