/**
 * Indotek Pro — Enterprise Data Export & Reporting Utilities
 * 
 * Generates genuine RFC 4180 / Excel-compatible UTF-8 CSV files with IDR formatting
 * and triggers immediate client-side downloads without placeholder simulation.
 */

import { BudgetLine, Project, PurchaseOrder, MaterialItem, WBSItem, Milestone } from '../types';
import { formatDateWITA, getWitaDateISO } from './formatters';

/** Info perusahaan dinamis dari workspace settings. */
export interface CompanyInfo {
  companyName: string;
  companyAddress: string;
  taxNumberNPWP: string;
}

/**
 * Downloads arbitrary formatted CSV data as a physical file in the browser.
 */
export function downloadCSV(filename: string, headers: string[], rows: (string | number)[][]): void {
  // Prepend UTF-8 BOM so Excel opens indonesian diacritics & characters properly
  const BOM = '\uFEFF';
  const csvContent =
    BOM +
    [
      headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(';'),
      ...rows.map((row) =>
        row
          .map((cell) => {
            const str = cell !== null && cell !== undefined ? String(cell) : '';
            return `"${str.replace(/"/g, '""')}"`;
          })
          .join(';')
      ),
    ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.setAttribute('href', url);
  anchor.setAttribute('download', filename);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Exports project RAB / BOQ budget lines to Excel CSV
 */
export function exportRABToCSV(project: Project, budgetLines: BudgetLine[]): void {
  const headers = [
    'Kode Divisi',
    'Uraian Pekerjaan / Divisi',
    'Kategori',
    'Volume',
    'Satuan',
    'Harga Satuan (IDR)',
    'Total Pagu Anggaran (IDR)',
    'Realisasi Biaya Aktual (IDR)',
    'Selisih / Deviasi (IDR)',
    'Persentase Deviasi (%)',
    'Status Anggaran',
  ];

  const rows = budgetLines.map((b) => [
    b.code,
    b.divisionName,
    b.category,
    b.volume,
    b.unit,
    b.unitRate,
    b.plannedAmount,
    b.actualAmount,
    b.varianceAmount,
    `${b.variancePercent}%`,
    b.status,
  ]);

  // Append Total Row
  const totalPlanned = budgetLines.reduce((acc, b) => acc + b.plannedAmount, 0);
  const totalActual = budgetLines.reduce((acc, b) => acc + b.actualAmount, 0);
  const totalVariance = totalPlanned - totalActual;

  rows.push([
    'TOTAL',
    `REKAPITULASI RAB KESELURUHAN (${project.name})`,
    '-',
    '-',
    '-',
    '-',
    totalPlanned,
    totalActual,
    totalVariance,
    `${totalPlanned > 0 ? Math.round(((totalActual / totalPlanned) * 100) * 10) / 10 : 0}%`,
    totalActual <= totalPlanned ? 'Aman' : 'Overbudget',
  ]);

  const cleanCode = project.code.replace(/[^a-zA-Z0-9_-]/g, '_');
  downloadCSV(`RAB_${cleanCode}_Indotek_Pro.csv`, headers, rows);
}

/**
 * Exports Purchase Orders / Procurement tracking to Excel CSV
 */
export function exportPurchaseOrdersToCSV(orders: PurchaseOrder[]): void {
  const headers = [
    'Nomor PO',
    'Nomor SPP Ref',
    'Nama Proyek',
    'Vendor / Rekanan',
    'Deskripsi Item Material',
    'Rincian Kuantitas / Volume',
    'Total Nilai PO (IDR)',
    'Status Approval',
    'Pemohon (Requester)',
    'Disetujui Oleh',
    'Tanggal Pengajuan',
    'Target Kirim Site',
  ];

  const rows = orders.map((po) => [
    po.poNumber,
    po.sppNumber,
    po.projectName,
    po.supplierName,
    po.itemDescription,
    po.quantitySummary,
    po.totalCost,
    po.status,
    po.requester,
    po.approvedBy || '-',
    po.requestDate,
    po.targetDeliveryDate,
  ]);

  downloadCSV(`Daftar_PO_Pengadaan_Indotek_${getWitaDateISO()}.csv`, headers, rows);
}

/**
 * Exports warehouse materials inventory & opname stock to Excel CSV
 */
export function exportMaterialsToCSV(materials: MaterialItem[]): void {
  const headers = [
    'Kode Material',
    'Nama Barang & Spesifikasi',
    'Kategori',
    'Satuan',
    'Stok Gudang Fisik',
    'Batas Minimum Stok',
    'Alokasi Proyek',
    'Lokasi Gudang',
    'Supplier Utama',
    'Estimasi Harga Satuan (IDR)',
    'Status Ketersediaan',
  ];

  const rows = materials.map((m) => [
    m.code,
    `${m.name} (${m.specification})`,
    m.category,
    m.unit,
    m.currentStock,
    m.minStock,
    m.allocatedProject,
    m.warehouseLocation,
    m.primarySupplier,
    m.unitPrice,
    m.status,
  ]);

  downloadCSV(`Stok_Material_Gudang_Indotek_${getWitaDateISO()}.csv`, headers, rows);
}

/**
 * Exports project progress executive report to Excel CSV
 */
export function exportExecutiveReportToCSV(
  projects: Project[],
  period: string
): void {
  const headers = [
    'Kode Proyek',
    'Nama Proyek',
    'Klien',
    'Kategori',
    'Lokasi',
    'Project Manager',
    'Nilai Kontrak (IDR)',
    'Pagu RAB (IDR)',
    'Biaya Aktual (IDR)',
    'Rencana Progres (%)',
    'Aktual Progres (%)',
    'Deviasi Progres (%)',
    'Status Jadwal',
    'Status Proyek',
  ];

  const rows = projects.map((p) => [
    p.code,
    p.name,
    p.client,
    p.category,
    p.location,
    p.projectManager,
    p.contractValue,
    p.approvedBudget,
    p.actualCost,
    `${p.progressPlanned}%`,
    `${p.progressActual}%`,
    `${Math.round((p.progressActual - p.progressPlanned) * 10) / 10}%`,
    p.scheduleStatus,
    p.status,
  ]);

  downloadCSV(`Laporan_Portofolio_Proyek_${period.replace(/\s+/g, '_')}.csv`, headers, rows);
}

/** Downloads a clearly marked draft template, not an archived or verified project document. */
export function downloadDocumentTemplate(
  docName: string,
  projectName: string,
  company?: CompanyInfo
): void {
  const name    = company?.companyName    || 'PERUSAHAAN';
  const address = company?.companyAddress || '';

  const content = `================================================================================
${name.toUpperCase()} — TEMPLATE DOKUMEN PROYEK
================================================================================
Proyek: ${projectName}
Nama dokumen: ${docName}
Tanggal dibuat (WITA): ${formatDateWITA()}
Alamat perusahaan: ${address || '[Isi alamat perusahaan]'}

STATUS: DRAF TEMPLATE. Dokumen ini bukan arsip resmi dan belum diverifikasi.

1. TUJUAN DAN LINGKUP
[Isi tujuan, lingkup pekerjaan, dan referensi kontrak yang berlaku.]

2. PERSYARATAN TEKNIS DAN MUTU
[Isi persyaratan berdasarkan dokumen proyek yang telah disetujui.]

3. KESELAMATAN KERJA
[Isi ketentuan keselamatan kerja yang berlaku untuk pekerjaan ini.]

4. PENGESAHAN
Disusun oleh: [Nama dan jabatan]
Diperiksa oleh: [Nama dan jabatan]
Disetujui oleh: [Nama dan jabatan]

================================================================================
`;

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${docName.replace(/\.[^/.]+$/, '')}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
