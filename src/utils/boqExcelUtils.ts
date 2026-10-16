/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';
import { BOQItem, BOQSummary, DivisionCategory } from '../types/rab';
import { formatRupiah, getWitaDateISO, terbilangRupiah } from './formatters';

export interface BOQImportRow {
  kode: string;
  uraian: string;
  satuan: string;
  volume: number;
  hargaSatuan: number;
  divisionCategory: DivisionCategory;
}

export interface BOQImportResult {
  success: boolean;
  rows: BOQImportRow[];
  totalParsed: number;
  errors: string[];
}

const VALID_DIVISIONS: DivisionCategory[] = [
  'Pekerjaan Persiapan',
  'Pekerjaan Struktur',
  'Pekerjaan Arsitektur',
  'Pekerjaan MEP',
  'Manajemen & Overhead',
];

function normalizeDivision(raw: string): DivisionCategory {
  const lower = (raw || '').toLowerCase().trim();
  if (lower.includes('persiapan') || lower.includes('preliminar')) return 'Pekerjaan Persiapan';
  if (lower.includes('struktur') || lower.includes('pondasi') || lower.includes('beton')) return 'Pekerjaan Struktur';
  if (lower.includes('arsitektur') || lower.includes('dinding') || lower.includes('finishing')) return 'Pekerjaan Arsitektur';
  if (lower.includes('mep') || lower.includes('mekanikal') || lower.includes('elektrikal') || lower.includes('plumbing')) return 'Pekerjaan MEP';
  if (lower.includes('overhead') || lower.includes('manajemen') || lower.includes('k3')) return 'Manajemen & Overhead';
  return 'Pekerjaan Struktur';
}

/**
 * Exports complete BOQ / RAB to standard contractor-format Excel (.xlsx) file.
 */
export function exportBOQToExcel(
  summary: BOQSummary,
  items: BOQItem[],
  companyName: string = 'PT Indotek Karya Nusantara',
  filename?: string
): void {
  const wb = XLSX.utils.book_new();

  const rows: any[][] = [
    [companyName.toUpperCase()],
    ['RENCANA ANGGARAN BIAYA (RAB) / BILL OF QUANTITIES (BOQ)'],
    [`Proyek: [${summary.projectCode}] ${summary.projectName}`],
    [`Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')} | PPN: ${summary.ppnPercent}%`],
    [],
    [
      'No',
      'Kategori Divisi',
      'Kode',
      'Uraian Pekerjaan',
      'Satuan',
      'Volume',
      'Harga Satuan (Rp)',
      'Jumlah Harga (Rp)',
      'Bobot (%)',
      'Progres (%)',
    ],
  ];

  let currentDivision = '';
  let divisionSubtotal = 0;
  let counter = 1;

  // Sort items by division and urutan
  const sortedItems = [...items].sort((a, b) => {
    if (a.divisionCategory !== b.divisionCategory) {
      return a.divisionCategory.localeCompare(b.divisionCategory);
    }
    return (a.urutan || 0) - (b.urutan || 0);
  });

  for (const item of sortedItems) {
    if (item.divisionCategory !== currentDivision) {
      if (currentDivision !== '') {
        // Output subtotal for previous division
        rows.push([
          '',
          `SUBTOTAL ${currentDivision.toUpperCase()}`,
          '',
          '',
          '',
          '',
          '',
          divisionSubtotal,
          '',
          '',
        ]);
        rows.push([]);
      }
      currentDivision = item.divisionCategory;
      divisionSubtotal = 0;
      rows.push(['', `--- ${currentDivision.toUpperCase()} ---`, '', '', '', '', '', '', '', '']);
    }

    const jumlah = Number(item.jumlahHarga) || (Number(item.volume) * Number(item.hargaSatuan));
    divisionSubtotal += jumlah;

    rows.push([
      counter++,
      item.divisionCategory,
      item.kode,
      item.uraian,
      item.satuan,
      Number(item.volume),
      Number(item.hargaSatuan),
      jumlah,
      Number(item.bobotPersen || 0),
      Number(item.progresPersen || 0),
    ]);
  }

  if (currentDivision !== '') {
    rows.push([
      '',
      `SUBTOTAL ${currentDivision.toUpperCase()}`,
      '',
      '',
      '',
      '',
      '',
      divisionSubtotal,
      '',
      '',
    ]);
  }

  // Summary Recap rows
  rows.push([]);
  rows.push(['', '', '', 'REKAPITULASI BIAYA', '', '', '', '', '', '']);
  rows.push(['', '', '', 'Total Biaya Langsung (Subtotal)', '', '', '', summary.subtotal, '100.00%', '']);
  rows.push(['', '', '', `PPN (${summary.ppnPercent}%)`, '', '', '', summary.ppnNominal, '', '']);
  rows.push(['', '', '', 'GRAND TOTAL (Termasuk PPN)', '', '', '', summary.grandTotal, '', '']);
  rows.push(['', '', '', `Terbilang: ${summary.terbilang || terbilangRupiah(summary.grandTotal)}`, '', '', '', '', '', '']);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Set column widths
  ws['!cols'] = [
    { wch: 6 },  // No
    { wch: 22 }, // Kategori
    { wch: 14 }, // Kode
    { wch: 45 }, // Uraian Pekerjaan
    { wch: 8 },  // Satuan
    { wch: 12 }, // Volume
    { wch: 18 }, // Harga Satuan
    { wch: 20 }, // Jumlah Harga
    { wch: 12 }, // Bobot
    { wch: 12 }, // Progres
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'RAB Proyek');

  const safeFilename = filename || `RAB_${summary.projectCode || 'Proyek'}_${getWitaDateISO()}.xlsx`;
  XLSX.writeFile(wb, safeFilename);
}

/**
 * Generates an empty BOQ Excel Template ready for user editing and import.
 */
export function downloadBOQTemplate(): void {
  const wb = XLSX.utils.book_new();

  const headers = [
    ['TEMPLATE IMPOR BOQ / RAB - INDOTEK PRO'],
    ['Petunjuk: Kolom dengan tanda bintang (*) wajib diisi. Kategori divisi harus sesuai.'],
    ['Pilihan Kategori Divisi: Pekerjaan Persiapan | Pekerjaan Struktur | Pekerjaan Arsitektur | Pekerjaan MEP | Manajemen & Overhead'],
    [],
    [
      'Kategori Divisi*',
      'Kode Item*',
      'Uraian Pekerjaan*',
      'Satuan*',
      'Volume*',
      'Harga Satuan (Rp)*',
    ],
    // Sample rows
    ['Pekerjaan Persiapan', 'DIV-1.1', 'Pembersihan Lahan dan Perataan', 'm2', 250, 45000],
    ['Pekerjaan Persiapan', 'DIV-1.2', 'Pengukuran dan Pemasangan Bowplank', 'm1', 80, 75000],
    ['Pekerjaan Struktur', 'DIV-2.1', 'Galian Tanah Pondasi Manual', 'm3', 45, 95000],
    ['Pekerjaan Struktur', 'DIV-2.2', 'Beton Mutu fc 20 MPa (K-250) Site-mix', 'm3', 30, 1150000],
    ['Pekerjaan Arsitektur', 'DIV-3.1', 'Pasangan Bata Merah Tebal 1/2 Bata', 'm2', 120, 145000],
    ['Pekerjaan MEP', 'DIV-4.1', 'Titik Instalasi Lampu Kabel NYM 3x2.5mm', 'titik', 25, 285000],
    ['Manajemen & Overhead', 'DIV-5.1', 'Penerapan K3 dan Pengawasan Proyek', 'ls', 1, 5000000],
  ];

  const ws = XLSX.utils.aoa_to_sheet(headers);
  ws['!cols'] = [
    { wch: 24 },
    { wch: 14 },
    { wch: 45 },
    { wch: 10 },
    { wch: 12 },
    { wch: 20 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Template BOQ');
  XLSX.writeFile(wb, 'Template_Impor_BOQ_Indotek.xlsx');
}

function parseNominalHarga(val: any): number {
  if (typeof val === 'number') {
    return Math.round(val);
  }
  if (!val) return 0;
  const str = String(val)
    .replace(/Rp\s?/gi, '')
    .replace(/\s/g, '')
    .trim();

  let cleaned = str;
  if (cleaned.includes('.') && cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes('.') && !cleaned.includes(',')) {
    const parts = cleaned.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      cleaned = cleaned.replace(/\./g, '');
    }
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.');
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num);
}

/**
 * Parses an uploaded Excel or CSV file containing BOQ lines into validated BOQImportRow objects.
 */
export async function parseBOQExcelFile(file: File): Promise<BOQImportResult> {
  const errors: string[] = [];
  const rows: BOQImportRow[] = [];

  try {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array' });
    const firstSheetName = wb.SheetNames[0];
    if (!firstSheetName) {
      return { success: false, rows: [], totalParsed: 0, errors: ['File Excel tidak memiliki lembar kerja (worksheet).'] };
    }

    const ws = wb.Sheets[firstSheetName];
    const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { header: 1 });

    if (!rawData || rawData.length < 2) {
      return { success: false, rows: [], totalParsed: 0, errors: ['Format berkas kosong atau tidak memuat data yang cukup.'] };
    }

    // Locate header row by searching for 'uraian' or 'deskripsi' or 'nama'
    let headerRowIdx = -1;
    let colMap: { divisi?: number; kode?: number; uraian?: number; satuan?: number; volume?: number; harga?: number } = {};

    for (let r = 0; r < Math.min(10, rawData.length); r++) {
      const row = rawData[r];
      if (!Array.isArray(row)) continue;

      const normRow = row.map((cell) => String(cell || '').toLowerCase().trim());
      const hasUraian = normRow.some((c) => c.includes('uraian') || c.includes('deskripsi') || c.includes('nama pekerjaan'));
      const hasVolume = normRow.some((c) => c.includes('vol') || c.includes('jumlah') || c.includes('kuantitas'));

      if (hasUraian && hasVolume) {
        headerRowIdx = r;
        normRow.forEach((colName, idx) => {
          // Check harga/rate first so 'harga satuan' is not matched to satuan
          if (colName.includes('harga') || colName.includes('tarif') || colName.includes('unit rate') || colName.includes('price')) {
            colMap.harga = idx;
          } else if (colName.includes('satuan') || colName === 'sat' || colName === 'unit') {
            colMap.satuan = idx;
          } else if (colName.includes('volume') || colName.includes('vol') || colName.includes('qty')) {
            colMap.volume = idx;
          } else if (colName.includes('kategori') || colName.includes('divisi')) {
            colMap.divisi = idx;
          } else if (colName.includes('kode') || colName === 'code') {
            colMap.kode = idx;
          } else if (colName.includes('uraian') || colName.includes('deskripsi') || colName.includes('pekerjaan') || colName.includes('item')) {
            colMap.uraian = idx;
          }
        });
        break;
      }
    }

    if (headerRowIdx === -1 || colMap.uraian === undefined) {
      return {
        success: false,
        rows: [],
        totalParsed: 0,
        errors: ['Header tabel tidak dikenali. Pastikan terdapat kolom "Uraian Pekerjaan", "Satuan", "Volume", dan "Harga Satuan".'],
      };
    }

    for (let r = headerRowIdx + 1; r < rawData.length; r++) {
      const row = rawData[r];
      if (!Array.isArray(row) || row.length === 0) continue;

      const uraianVal = String(row[colMap.uraian] || '').trim();
      if (!uraianVal || uraianVal.toLowerCase().startsWith('subtotal') || uraianVal.toLowerCase().startsWith('total')) {
        continue; // Skip subtotals or empty lines
      }

      const rawDivisi = colMap.divisi !== undefined ? String(row[colMap.divisi] || '') : '';
      const kode = colMap.kode !== undefined && row[colMap.kode] ? String(row[colMap.kode]).trim() : `BOQ-${rows.length + 1}`;
      const satuan = colMap.satuan !== undefined && row[colMap.satuan] ? String(row[colMap.satuan]).trim() : 'ls';

      // Parse volume and price safely
      const rawVol = colMap.volume !== undefined ? row[colMap.volume] : 1;
      let parsedVol = typeof rawVol === 'number' ? rawVol : parseFloat(String(rawVol).replace(/[^\d.-]/g, '')) || 1;
      if (isNaN(parsedVol) || parsedVol <= 0) parsedVol = 1;

      const rawHarga = colMap.harga !== undefined ? row[colMap.harga] : 0;
      const parsedHarga = parseNominalHarga(rawHarga);

      const divisionCategory = normalizeDivision(rawDivisi);

      rows.push({
        kode,
        uraian: uraianVal,
        satuan,
        volume: parsedVol,
        hargaSatuan: parsedHarga,
        divisionCategory,
      });
    }

    if (rows.length === 0) {
      errors.push('Tidak ditemukan baris item pekerjaan yang valid untuk diimpor.');
    }

    return {
      success: errors.length === 0 && rows.length > 0,
      rows,
      totalParsed: rows.length,
      errors,
    };
  } catch (err: any) {
    return {
      success: false,
      rows: [],
      totalParsed: 0,
      errors: [`Gagal memproses berkas Excel: ${err.message || 'Format tidak didukung'}`],
    };
  }
}
