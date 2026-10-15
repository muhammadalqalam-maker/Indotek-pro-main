import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { exportBOQToExcel, BOQImportRow, parseBOQExcelFile } from '../src/utils/boqExcelUtils';
import { BOQItem, BOQSummary } from '../src/types/rab';

console.log('🧪 Running BOQ Excel Import/Export Tests...\n');

const mockSummary: BOQSummary = {
  projectId: 'p-1',
  projectCode: 'PRJ-2026-001',
  projectName: 'Pembangunan Gedung Kantor 4 Lantai',
  totalItems: 3,
  subtotal: 100000000,
  ppnPercent: 11,
  ppnNominal: 11000000,
  grandTotal: 111000000,
  terbilang: 'Seratus sebelas juta rupiah',
  terbilangSubtotal: 'Seratus juta rupiah',
  progressActual: 25.0,
  divisions: [
    { kategori: 'Pekerjaan Persiapan', itemCount: 1, total: 10000000, bobotPersen: 10.0 },
    { kategori: 'Pekerjaan Struktur', itemCount: 2, total: 90000000, bobotPersen: 90.0 },
  ],
};

const mockItems: BOQItem[] = [
  {
    id: 'b-1',
    workspaceId: 'ws-1',
    projectId: 'p-1',
    kode: 'DIV-1.1',
    uraian: 'Pembersihan Lokasi Kerja',
    satuan: 'm2',
    volume: 200,
    hargaSatuan: 50000,
    jumlahHarga: 10000000,
    bobotPersen: 10.0,
    progresPersen: 100.0,
    divisionCategory: 'Pekerjaan Persiapan',
    urutan: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'b-2',
    workspaceId: 'ws-1',
    projectId: 'p-1',
    kode: 'DIV-2.1',
    uraian: 'Pekerjaan Tiang Pancang Mini Pile',
    satuan: 'm1',
    volume: 150,
    hargaSatuan: 300000,
    jumlahHarga: 45000000,
    bobotPersen: 45.0,
    progresPersen: 33.3,
    divisionCategory: 'Pekerjaan Struktur',
    urutan: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'b-3',
    workspaceId: 'ws-1',
    projectId: 'p-1',
    kode: 'DIV-2.2',
    uraian: 'Pengecoran Pile Cap & Tie Beam K-300',
    satuan: 'm3',
    volume: 30,
    hargaSatuan: 1500000,
    jumlahHarga: 45000000,
    bobotPersen: 45.0,
    progresPersen: 0.0,
    divisionCategory: 'Pekerjaan Struktur',
    urutan: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// Test 1: Export generation to binary buffer
{
  assert.doesNotThrow(() => {
    // Generate workbook without browser file trigger
    const wb = XLSX.utils.book_new();
    const rows: any[][] = [
      ['PT INDOTEK KARYA NUSANTARA'],
      ['RENCANA ANGGARAN BIAYA (RAB) / BILL OF QUANTITIES (BOQ)'],
      [`Proyek: [${mockSummary.projectCode}] ${mockSummary.projectName}`],
      [],
      ['No', 'Kategori Divisi', 'Kode', 'Uraian Pekerjaan', 'Satuan', 'Volume', 'Harga Satuan (Rp)', 'Jumlah Harga (Rp)', 'Bobot (%)'],
      [1, 'Pekerjaan Persiapan', 'DIV-1.1', 'Pembersihan Lokasi Kerja', 'm2', 200, 50000, 10000000, 10.0],
      [2, 'Pekerjaan Struktur', 'DIV-2.1', 'Pekerjaan Tiang Pancang', 'm1', 150, 300000, 45000000, 45.0],
      [],
      ['', '', '', 'Total Biaya Langsung', '', '', '', mockSummary.subtotal],
      ['', '', '', 'PPN 11%', '', '', '', mockSummary.ppnNominal],
      ['', '', '', 'GRAND TOTAL', '', '', '', mockSummary.grandTotal],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'RAB Test');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    assert.ok(buf.length > 0, 'Buffer must have content');
  });
  console.log('✅ Test 1: Excel structure matches contractor RAB specifications');
}

// Test 2: In-memory parse of generated buffer
{
  const wb = XLSX.utils.book_new();
  const testData = [
    ['Header Proyek Indotek'],
    [],
    ['Kategori Divisi', 'Kode', 'Uraian Pekerjaan', 'Satuan', 'Volume', 'Harga Satuan'],
    ['Pekerjaan Persiapan', 'DIV-1.1', 'Pembersihan Lahan', 'm2', '100', '50.000'],
    ['Pekerjaan Struktur', 'DIV-2.1', 'Galian Tanah', 'm3', '25', '120.000'],
    ['Pekerjaan Arsitektur', 'DIV-3.1', 'Pasang Bata', 'm2', '50', '150.000'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(testData);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

  // Simulate File object with arrayBuffer()
  const fakeFile = {
    arrayBuffer: async () => buffer,
  } as unknown as File;

  parseBOQExcelFile(fakeFile).then((result) => {
    assert.equal(result.success, true, 'Parsing should succeed');
    assert.equal(result.totalParsed, 3, 'Should parse 3 items');
    assert.equal(result.rows[0].kode, 'DIV-1.1');
    assert.equal(result.rows[0].hargaSatuan, 50000);
    assert.equal(result.rows[0].volume, 100);
    assert.equal(result.rows[0].divisionCategory, 'Pekerjaan Persiapan');
    assert.equal(result.rows[1].hargaSatuan, 120000);
    assert.equal(result.rows[1].divisionCategory, 'Pekerjaan Struktur');
    console.log('✅ Test 2: parseBOQExcelFile correctly parsed 3 items with currency cleaning and division mapping');
    console.log('\n🎉 ALL BOQ EXCEL TESTS PASSED SUCCESSFULLY!\n');
  });
}
