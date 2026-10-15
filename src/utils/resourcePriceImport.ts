/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Resource Price Import & Export Utilities
 * Mendukung parsing file CSV, XLS, dan XLSX untuk impor katalog harga dasar.
 */

import * as XLSX from 'xlsx';
import { ResourcePrice, ResourceType, ResourcePriceImportRow } from '../types/rab';

export interface ParseResult {
  validRows: ResourcePriceImportRow[];
  invalidRows: { rowNumber: number; reason: string; raw: any }[];
  totalParsed: number;
}

/**
 * Normalisasi header kolom ke key standar.
 */
function normalizeColumnKey(header: string): string {
  const h = header.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (h.includes('harga') || h.includes('tarif') || h.includes('rate') || h.includes('price') || h.includes('nominal')) return 'harga';
  if (h.includes('kode') || h === 'code') return 'kode';
  if (h.includes('satuan') || h === 'sat' || h === 'unit') return 'satuan';
  if (h.includes('uraian') || h.includes('nama') || h.includes('deskripsi') || h.includes('item')) return 'uraian';
  if (h.includes('jenis') || h.includes('kategori') || h.includes('tipe') || h === 'type') return 'jenis';
  if (h.includes('wilayah') || h.includes('lokasi') || h.includes('kota') || h.includes('region')) return 'wilayah';
  if (h.includes('spesifikasi') || h.includes('spek') || h.includes('merk') || h.includes('keterangan')) return 'spesifikasi';
  if (h.includes('berlaku') || h.includes('tanggal') || h.includes('date')) return 'berlakuMulai';
  return h;
}

/**
 * Parse harga uang dari string atau number ke integer Rupiah.
 */
function parseNominalHarga(val: any): number {
  if (typeof val === 'number') {
    return Math.round(val);
  }
  if (!val) return 0;
  const str = String(val)
    .replace(/Rp\s?/gi, '')
    .replace(/\s/g, '')
    .trim();

  // Jika format rupiah: 150.000 atau 150.000,00
  // Cek apakah ada koma desimal di akhir
  let cleaned = str;
  if (cleaned.includes('.') && cleaned.includes(',')) {
    // 150.000,00 -> buang titik, ganti koma dengan titik
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes('.') && !cleaned.includes(',')) {
    // Bisa berupa 150.000 (ribuan) atau 150.5 (desimal)
    // Jika bagian setelah titik persis 3 digit, biasanya pemisah ribuan
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
 * Parse jenis sumber daya
 */
function parseResourceType(val: any): ResourceType {
  const s = String(val || '').toLowerCase().trim();
  if (s.includes('upah') || s.includes('tenaga') || s.includes('pekerja') || s.includes('labor')) return 'Upah';
  if (s.includes('alat') || s.includes('equipment') || s.includes('mesin')) return 'Alat';
  if (s.includes('subkon') || s.includes('subkontraktor') || s.includes('jasa')) return 'Subkon';
  return 'Bahan';
}

/**
 * Parse file Excel / CSV menjadi daftar baris ResourcePrice siap impor.
 */
export async function parseResourcePricesFile(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('File tidak memiliki sheet data.');
  }

  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Baca sheet sebagai JSON array of arrays
  const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  if (rawRows.length < 2) {
    throw new Error('File harus memiliki minimal baris header dan 1 baris data.');
  }

  // Cari baris header
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
    const row = rawRows[i] || [];
    const hasCode = row.some((c: any) => typeof c === 'string' && /kode|code/i.test(c));
    const hasName = row.some((c: any) => typeof c === 'string' && /uraian|nama|deskripsi/i.test(c));
    const hasPrice = row.some((c: any) => typeof c === 'string' && /harga|tarif|rate/i.test(c));
    if ((hasCode && hasName) || (hasName && hasPrice)) {
      headerRowIndex = i;
      break;
    }
  }

  const headerRow = rawRows[headerRowIndex] || [];
  const colIndexMap: Record<string, number> = {};

  headerRow.forEach((cell: any, idx: number) => {
    if (cell !== undefined && cell !== null) {
      const key = normalizeColumnKey(String(cell));
      colIndexMap[key] = idx;
    }
  });

  const validRows: ResourcePriceImportRow[] = [];
  const invalidRows: { rowNumber: number; reason: string; raw: any }[] = [];

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    const kode = String(row[colIndexMap['kode']] ?? '').trim();
    const uraian = String(row[colIndexMap['uraian']] ?? '').trim();
    const satuan = String(row[colIndexMap['satuan']] ?? '').trim();
    const hargaVal = row[colIndexMap['harga']];
    const harga = parseNominalHarga(hargaVal);
    const jenis = parseResourceType(row[colIndexMap['jenis']]);
    const wilayah = String(row[colIndexMap['wilayah']] ?? '').trim();
    const spesifikasi = String(row[colIndexMap['spesifikasi']] ?? '').trim();

    // Baris kosong
    if (!kode && !uraian && !satuan && harga === 0) continue;

    if (!kode) {
      invalidRows.push({ rowNumber: r + 1, reason: 'Kode tidak boleh kosong', raw: row });
      continue;
    }
    if (!uraian) {
      invalidRows.push({ rowNumber: r + 1, reason: 'Uraian tidak boleh kosong', raw: row });
      continue;
    }
    if (!satuan) {
      invalidRows.push({ rowNumber: r + 1, reason: 'Satuan tidak boleh kosong', raw: row });
      continue;
    }
    if (harga < 0) {
      invalidRows.push({ rowNumber: r + 1, reason: 'Harga tidak boleh negatif', raw: row });
      continue;
    }

    validRows.push({
      kode,
      uraian,
      satuan,
      harga,
      jenis,
      wilayah,
      spesifikasi: spesifikasi || undefined,
    });
  }

  return {
    validRows,
    invalidRows,
    totalParsed: validRows.length + invalidRows.length,
  };
}

/**
 * Download template resmi untuk impor katalog harga dasar (Excel / CSV).
 */
export function downloadResourcePriceTemplate(format: 'xlsx' | 'csv' = 'xlsx'): void {
  const sampleData = [
    {
      'Kode': 'BHN-001',
      'Jenis': 'Bahan',
      'Uraian': 'Semen Portland (PC) 50kg',
      'Satuan': 'zak',
      'Harga Satuan (Rp)': 78000,
      'Wilayah': 'Balikpapan',
      'Spesifikasi': 'SNI Tipe I',
    },
    {
      'Kode': 'BHN-002',
      'Jenis': 'Bahan',
      'Uraian': 'Pasir Beton / Pasang',
      'Satuan': 'm3',
      'Harga Satuan (Rp)': 320000,
      'Wilayah': 'Balikpapan',
      'Spesifikasi': 'Mutu Baik, Bebas Lumpur',
    },
    {
      'Kode': 'BHN-003',
      'Jenis': 'Bahan',
      'Uraian': 'Batu Belah 15/20 cm',
      'Satuan': 'm3',
      'Harga Satuan (Rp)': 350000,
      'Wilayah': 'Balikpapan',
      'Spesifikasi': 'Batu Belah Gunung Keras',
    },
    {
      'Kode': 'UPH-001',
      'Jenis': 'Upah',
      'Uraian': 'Pekerja Konstruksi',
      'Satuan': 'OH',
      'Harga Satuan (Rp)': 140000,
      'Wilayah': 'Balikpapan',
      'Spesifikasi': 'Tenaga Harian Standar',
    },
    {
      'Kode': 'UPH-002',
      'Jenis': 'Upah',
      'Uraian': 'Tukang Batu / Kayu / Besi',
      'Satuan': 'OH',
      'Harga Satuan (Rp)': 180000,
      'Wilayah': 'Balikpapan',
      'Spesifikasi': 'Tukang Berpengalaman',
    },
    {
      'Kode': 'UPH-003',
      'Jenis': 'Upah',
      'Uraian': 'Mandor Lapangan',
      'Satuan': 'OH',
      'Harga Satuan (Rp)': 210000,
      'Wilayah': 'Balikpapan',
      'Spesifikasi': 'Pengawas Lapangan Terampil',
    },
    {
      'Kode': 'ALT-001',
      'Jenis': 'Alat',
      'Uraian': 'Concrete Mixer (Molen) 0.35 m3',
      'Satuan': 'hari',
      'Harga Satuan (Rp)': 300000,
      'Wilayah': 'Balikpapan',
      'Spesifikasi': 'Mesin Diesel 7.5 HP',
    },
    {
      'Kode': 'ALT-002',
      'Jenis': 'Alat',
      'Uraian': 'Vibrator Beton',
      'Satuan': 'hari',
      'Harga Satuan (Rp)': 150000,
      'Wilayah': 'Balikpapan',
      'Spesifikasi': 'Unit Bensin + Selang 4m',
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Katalog_Harga_Dasar');

  if (format === 'xlsx') {
    XLSX.writeFile(workbook, 'Template_Katalog_Harga_Dasar_Indotek.xlsx');
  } else {
    XLSX.writeFile(workbook, 'Template_Katalog_Harga_Dasar_Indotek.csv');
  }
}

/**
 * Ekspor katalog harga dasar yang ada ke file Excel.
 */
export function exportResourcePricesToExcel(items: ResourcePrice[], filename = 'Katalog_Harga_Dasar.xlsx'): void {
  const exportData = items.map((item, index) => ({
    'No': index + 1,
    'Kode': item.kode,
    'Jenis': item.jenis,
    'Uraian': item.uraian,
    'Satuan': item.satuan,
    'Harga Satuan (Rp)': item.harga,
    'Wilayah': item.wilayah || 'Umum',
    'Spesifikasi': item.spesifikasi || '-',
    'Berlaku Mulai': item.berlakuMulai,
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Katalog_Harga');
  XLSX.writeFile(workbook, filename);
}
