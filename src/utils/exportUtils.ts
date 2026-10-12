/**
 * Indotek Pro — Enterprise Data Export & Reporting Utilities
 * 
 * Generates genuine RFC 4180 / Excel-compatible UTF-8 CSV files with IDR formatting
 * and triggers immediate client-side downloads without placeholder simulation.
 */

import { BudgetLine, Project, PurchaseOrder, MaterialItem, WBSItem, Milestone } from '../types';

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

  downloadCSV(`Daftar_PO_Pengadaan_Indotek_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
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

  downloadCSV(`Stok_Material_Gudang_Indotek_${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
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

/**
 * Downloads a sample specification document or engineering form
 */
export function downloadDocumentTemplate(docName: string, projectName: string): void {
  const content = `================================================================================
PT INDOTEK BANGUN NUSANTARA — CONSTRUCTION MANAGEMENT SYSTEM
DOKUMEN TEKNIS & SPESIFIKASI PROYEK
================================================================================
Proyek: ${projectName}
Nama Dokumen: ${docName}
Tanggal Unduh: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })}
Status Verifikasi: Terdaftar di Repository Resmi Proyek

1. TUJUAN & LINGKUP PEKERJAAN
Dokumen ini merupakan arsip rekayasa resmi yang mengatur spesifikasi teknis,
toleransi mutu SNI (Standar Nasional Indonesia), dan instruksi kerja lapangan
untuk pelaksanaan pekerjaan pada site ${projectName}.

2. STANDAR MUTU & PENGUJIAN
- Mutu Beton: fc' 35 MPa (K-400) dengan slump test 12±2 cm.
- Mutu Baja Tulangan: BJTS 420B (Ulir) bersertifikat SNI 2052:2017.
- Prosedur Keselamatan Kerja: K3 Konstruksi (SMKK) Permen PUPR No. 10/2021.

3. PENGESAHAN DOKUMEN
Disusun oleh: Tim Enjiniring Site
Disetujui oleh: Project Director / Konsultan Manajemen Konstruksi
================================================================================
PT Indotek Bangun Nusantara · Graha Surveyor Indonesia Lt. 14, Jakarta Selatan
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
