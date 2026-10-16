/**
 * pdfGenerator.ts
 * Utilitas pembuatan dokumen resmi PDF format A4 di sisi klien menggunakan pdf-lib.
 * Mendukung:
 * 1. Laporan Harian Lapangan (Daily Field Report)
 * 2. Berita Acara Serah Terima (BAST Milestone)
 * 3. Surat Pesanan Pembelian (Purchase Order / PO)
 * 4. Rencana Anggaran Biaya (RAB / BOQ)
 * 
 * Fitur:
 * - Kop Surat Perusahaan (Corporate Letterhead) terpadu dari pengaturan workspace.
 * - Format A4 standar arsitektur/konstruksi Indonesia.
 * - Penomoran resmi dokumen dari database.
 * - Download langsung di browser tanpa dependensi server eksternal.
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { formatCurrencyIDR, formatDateIndo, getWitaDateISO, terbilangRupiah } from './formatters';
import { FieldReport, PurchaseOrder, Milestone, Project, BOQItem, BOQSummary } from '../types';

export interface CompanyHeaderInfo {
  companyName: string;
  address: string;
  npwp: string;
  phone: string;
  email: string;
}

export const DEFAULT_COMPANY_HEADER: CompanyHeaderInfo = {
  companyName: 'PT INDOTEK KARYA NUSANTARA',
  address: 'Gedung Menara Konstruksi Lt. 12, Jl. Jend. Sudirman Kav. 52-53, Jakarta Selatan',
  npwp: '01.234.567.8-012.000',
  phone: '(021) 555-0199',
  email: 'operasional@indotek.co.id',
};

/**
 * Menggambar Kop Surat Perusahaan standar pada halaman PDF
 */
function drawHeader(
  page: any,
  fontBold: any,
  fontRegular: any,
  company: CompanyHeaderInfo = DEFAULT_COMPANY_HEADER
): number {
  const { width, height } = page.getSize();
  let y = height - 40;

  // Nama Perusahaan
  page.drawText(company.companyName, {
    x: 40,
    y,
    size: 14,
    font: fontBold,
    color: rgb(0.07, 0.21, 0.17), // Deep Forest #12352B
  });

  y -= 14;
  page.drawText('KONTRAKTOR UMUM & MANAJEMEN KONSTRUKSI ENTERPRISE', {
    x: 40,
    y,
    size: 8,
    font: fontBold,
    color: rgb(0.16, 0.34, 0.27),
  });

  y -= 12;
  page.drawText(`${company.address}`, {
    x: 40,
    y,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.4, 0.45, 0.42),
  });

  y -= 10;
  page.drawText(`NPWP: ${company.npwp}  |  Telp: ${company.phone}  |  Email: ${company.email}`, {
    x: 40,
    y,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.4, 0.45, 0.42),
  });

  y -= 8;
  // Garis pemisah ganda kop surat
  page.drawLine({
    start: { x: 40, y },
    end: { x: width - 40, y },
    thickness: 1.5,
    color: rgb(0.07, 0.21, 0.17),
  });

  y -= 2;
  page.drawLine({
    start: { x: 40, y },
    end: { x: width - 40, y },
    thickness: 0.5,
    color: rgb(0.6, 0.65, 0.62),
  });

  return y - 16;
}

/**
 * Memicu pengunduhan file PDF di browser
 */
function triggerDownload(pdfBytes: Uint8Array, fileName: string) {
  const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// 1. DOKUMEN: LAPORAN HARIAN LAPANGAN (DAILY FIELD REPORT)
// ---------------------------------------------------------------------------
export async function generateFieldReportPDF(
  report: FieldReport,
  company?: CompanyHeaderInfo
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = drawHeader(page, fontBold, fontRegular, company);

  // Judul Dokumen
  page.drawText('LAPORAN HARIAN LAPANGAN', {
    x: 40,
    y,
    size: 13,
    font: fontBold,
    color: rgb(0.12, 0.17, 0.15),
  });
  page.drawText(`No. Dokumen: ${report.reportNumber}`, {
    x: 350,
    y,
    size: 9,
    font: fontBold,
    color: rgb(0.07, 0.21, 0.17),
  });

  y -= 18;
  // Metadata Proyek Box
  page.drawRectangle({
    x: 40,
    y: y - 50,
    width: 515.28,
    height: 58,
    color: rgb(0.97, 0.98, 0.97),
    borderColor: rgb(0.85, 0.88, 0.86),
    borderWidth: 1,
  });

  page.drawText(`Proyek        : ${report.projectName}`, { x: 50, y: y - 14, size: 8.5, font: fontBold });
  page.drawText(`Tanggal Kerja : ${formatDateIndo(report.date, true)}`, { x: 50, y: y - 28, size: 8, font: fontRegular });
  page.drawText(`Pengawas Site : ${report.siteSupervisor}`, { x: 50, y: y - 42, size: 8, font: fontRegular });

  page.drawText(`Cuaca Pagi/Sore : ${report.weatherMorning} / ${report.weatherAfternoon}`, { x: 310, y: y - 14, size: 8, font: fontRegular });
  page.drawText(`Jam Kerja       : ${report.workingHours} Jam Efektif`, { x: 310, y: y - 28, size: 8, font: fontRegular });
  page.drawText(`Status Laporan  : ${report.status}`, { x: 310, y: y - 42, size: 8, font: fontBold, color: rgb(0.11, 0.41, 0.26) });

  y -= 68;

  // Rekap Tenaga Kerja
  page.drawText('1. REKAPITULASI TENAGA KERJA', { x: 40, y, size: 9, font: fontBold });
  y -= 14;
  report.workforce.forEach((w) => {
    page.drawText(`• ${w.role} : ${w.count} orang`, { x: 50, y, size: 8, font: fontRegular });
    y -= 12;
  });

  y -= 6;
  // Pekerjaan Terlaksana
  page.drawText('2. PEKERJAAN TERLAKSANA HARI INI', { x: 40, y, size: 9, font: fontBold });
  y -= 14;
  report.completedWorks.forEach((work) => {
    page.drawText(`• ${work}`, { x: 50, y, size: 8, font: fontRegular });
    y -= 12;
  });

  y -= 6;
  // Material Digunakan
  if (report.materialsUsed && report.materialsUsed.length > 0) {
    page.drawText('3. PEMAKAIAN MATERIAL', { x: 40, y, size: 9, font: fontBold });
    y -= 14;
    report.materialsUsed.forEach((m) => {
      page.drawText(`• ${m.name} : ${m.quantity}`, { x: 50, y, size: 8, font: fontRegular });
      y -= 12;
    });
    y -= 6;
  }

  // Catatan Kendala / K3
  if (report.blockers) {
    page.drawText('4. CATATAN KENDALA / SAFETY K3', { x: 40, y, size: 9, font: fontBold, color: rgb(0.62, 0.42, 0.02) });
    y -= 14;
    page.drawText(`${report.blockers}`, { x: 50, y, size: 8, font: fontRegular });
    y -= 16;
  }

  // Tanda Tangan
  const sigY = 90;
  page.drawText('Dibuat Oleh,', { x: 70, y: sigY + 45, size: 8, font: fontRegular });
  page.drawText('Pengawas Lapangan', { x: 70, y: sigY + 35, size: 8, font: fontBold });
  page.drawLine({ start: { x: 70, y: sigY }, end: { x: 200, y: sigY }, thickness: 0.8, color: rgb(0, 0, 0) });
  page.drawText(report.siteSupervisor, { x: 70, y: sigY - 12, size: 8, font: fontRegular });

  page.drawText('Disetujui Oleh,', { x: 380, y: sigY + 45, size: 8, font: fontRegular });
  page.drawText('Project Manager / Direktur', { x: 380, y: sigY + 35, size: 8, font: fontBold });
  page.drawLine({ start: { x: 380, y: sigY }, end: { x: 510, y: sigY }, thickness: 0.8, color: rgb(0, 0, 0) });
  page.drawText(report.verifiedBy || 'Manajer Proyek', { x: 380, y: sigY - 12, size: 8, font: fontRegular });

  const pdfBytes = await pdfDoc.save();
  triggerDownload(pdfBytes, `Laporan-Harian-${report.reportNumber.replace(/\//g, '_')}.pdf`);
  return pdfBytes;
}

// ---------------------------------------------------------------------------
// 2. DOKUMEN: BERITA ACARA SERAH TERIMA (BAST) MILESTONE
// ---------------------------------------------------------------------------
export async function generateBastMilestonePDF(
  milestone: Milestone,
  project: Project,
  company?: CompanyHeaderInfo
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = drawHeader(page, fontBold, fontRegular, company);

  page.drawText('BERITA ACARA SERAH TERIMA PEKERJAAN (BAST)', {
    x: 120,
    y,
    size: 12,
    font: fontBold,
    color: rgb(0.07, 0.21, 0.17),
  });
  y -= 14;
  page.drawText(`Nomor: ${milestone.bastRef || `BAST/MILESTONE/${project.code}/${Date.now()}`}`, {
    x: 180,
    y,
    size: 9,
    font: fontRegular,
  });

  y -= 25;
  const p1 = `Pada hari ini, ${formatDateIndo(milestone.actualDate || getWitaDateISO(), true)}, bertempat di lokasi proyek ${project.name}, telah dilaksanakan serah terima penyelesaian tahapan pekerjaan konstruksi (Milestone Sign-off) dengan rincian:`;
  page.drawText(p1, { x: 40, y, size: 8.5, font: fontRegular, maxWidth: 515 });

  y -= 35;
  // Detail Box
  page.drawRectangle({
    x: 40,
    y: y - 80,
    width: 515.28,
    height: 88,
    color: rgb(0.98, 0.98, 0.98),
    borderColor: rgb(0.85, 0.88, 0.86),
    borderWidth: 1,
  });

  page.drawText(`Nama Proyek       : ${project.name} (${project.code})`, { x: 50, y: y - 16, size: 8.5, font: fontBold });
  page.drawText(`Nama Klien / Owner : ${project.client}`, { x: 50, y: y - 30, size: 8, font: fontRegular });
  page.drawText(`Tahapan Pekerjaan  : ${milestone.title}`, { x: 50, y: y - 44, size: 8.5, font: fontBold });
  page.drawText(`Kode WBS          : ${milestone.wbsCode}`, { x: 50, y: y - 58, size: 8, font: fontRegular });
  page.drawText(`Bobot Kontrak     : ${milestone.weightPercent}% (Progress Fisik: ${milestone.progress}%)`, { x: 50, y: y - 72, size: 8, font: fontBold, color: rgb(0.11, 0.41, 0.26) });

  y -= 100;
  const p2 = `Dengan ditandatanganinya Berita Acara ini, kedua belah pihak menyatakan bahwa tahapan pekerjaan tersebut telah diperiksa bersama, memenuhi spesifikasi teknis gambar kerja, dan dinyatakan SELESAI untuk dapat diproses penagihan termin pembayaran sesuai ketentuan kontrak.`;
  page.drawText(p2, { x: 40, y, size: 8.5, font: fontRegular, maxWidth: 515, lineHeight: 12 });

  // Tanda Tangan
  const sigY = 120;
  page.drawText('PIHAK KEDUA (PELAKSANA)', { x: 70, y: sigY + 50, size: 8, font: fontBold });
  page.drawText('PT Indotek Karya Nusantara', { x: 70, y: sigY + 38, size: 7.5, font: fontRegular });
  page.drawLine({ start: { x: 70, y: sigY }, end: { x: 210, y: sigY }, thickness: 0.8, color: rgb(0, 0, 0) });
  page.drawText(milestone.signedOffBy || project.projectManager, { x: 70, y: sigY - 14, size: 8, font: fontBold });
  page.drawText('Project Manager', { x: 70, y: sigY - 24, size: 7.5, font: fontRegular });

  page.drawText('PIHAK PERTAMA (PEMBERI TUGAS)', { x: 350, y: sigY + 50, size: 8, font: fontBold });
  page.drawText(project.client, { x: 350, y: sigY + 38, size: 7.5, font: fontRegular });
  page.drawLine({ start: { x: 350, y: sigY }, end: { x: 490, y: sigY }, thickness: 0.8, color: rgb(0, 0, 0) });
  page.drawText('Wakil Manajemen Klien', { x: 350, y: sigY - 14, size: 8, font: fontBold });
  page.drawText('Direksi Teknis / MK', { x: 350, y: sigY - 24, size: 7.5, font: fontRegular });

  const pdfBytes = await pdfDoc.save();
  triggerDownload(pdfBytes, `BAST-${project.code}-${milestone.wbsCode}.pdf`);
  return pdfBytes;
}

// ---------------------------------------------------------------------------
// 3. DOKUMEN: SURAT PURCHASE ORDER (PO)
// ---------------------------------------------------------------------------
export async function generatePurchaseOrderPDF(
  po: PurchaseOrder,
  project?: Project,
  company?: CompanyHeaderInfo
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = drawHeader(page, fontBold, fontRegular, company);

  page.drawText('SURAT PESANAN PEMBELIAN (PURCHASE ORDER)', {
    x: 130,
    y,
    size: 12,
    font: fontBold,
    color: rgb(0.07, 0.21, 0.17),
  });
  y -= 14;
  page.drawText(`Nomor PO: ${po.poNumber}`, {
    x: 230,
    y,
    size: 9.5,
    font: fontBold,
  });

  y -= 25;
  // Box Vendor & Tanggal
  page.drawRectangle({
    x: 40,
    y: y - 55,
    width: 515.28,
    height: 62,
    color: rgb(0.98, 0.98, 0.98),
    borderColor: rgb(0.85, 0.88, 0.86),
    borderWidth: 1,
  });

  page.drawText(`Kepada Vendor : ${po.supplierName}`, { x: 50, y: y - 14, size: 8.5, font: fontBold });
  page.drawText(`Alokasi Proyek : ${project?.name || po.projectName || 'Proyek Umum'}`, { x: 50, y: y - 28, size: 8, font: fontRegular });
  page.drawText(`Pemohon (Site) : ${po.requester}`, { x: 50, y: y - 42, size: 8, font: fontRegular });

  page.drawText(`Tanggal PO   : ${formatDateIndo(po.createdAt || getWitaDateISO())}`, { x: 330, y: y - 14, size: 8, font: fontRegular });
  page.drawText(`Target Kirim : ${formatDateIndo(po.targetDeliveryDate)}`, { x: 330, y: y - 28, size: 8, font: fontRegular });
  page.drawText(`Status PO    : ${po.status}`, { x: 330, y: y - 42, size: 8, font: fontBold, color: rgb(0.11, 0.41, 0.26) });

  y -= 75;
  // Tabel Rincian Pesanan
  page.drawText('RINCIAN PENGADAAN MATERIAL / SEWA ALAT:', { x: 40, y, size: 8.5, font: fontBold });
  y -= 14;

  // Header Tabel
  page.drawRectangle({
    x: 40,
    y: y - 18,
    width: 515.28,
    height: 20,
    color: rgb(0.07, 0.21, 0.17),
  });
  page.drawText('Uraian Material / Jasa', { x: 50, y: y - 12, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('Kuantitas', { x: 320, y: y - 12, size: 8, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('Jumlah Harga (IDR)', { x: 430, y: y - 12, size: 8, font: fontBold, color: rgb(1, 1, 1) });

  y -= 22;
  // Baris Isi
  page.drawText(po.itemDescription, { x: 50, y: y - 10, size: 8, font: fontRegular });
  page.drawText(po.quantitySummary, { x: 320, y: y - 10, size: 8, font: fontRegular });
  page.drawText(formatCurrencyIDR(po.totalCost), { x: 430, y: y - 10, size: 8, font: fontBold });

  y -= 30;
  page.drawLine({ start: { x: 40, y }, end: { x: 555.28, y }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });

  // Total & Terbilang
  y -= 16;
  page.drawText(`TOTAL KONTRAK PENGADAAN : ${formatCurrencyIDR(po.totalCost)}`, { x: 260, y, size: 9.5, font: fontBold });
  y -= 14;
  page.drawText(`Terbilang: ${terbilangRupiah(po.totalCost)}`, { x: 40, y, size: 7.5, font: fontBold, color: rgb(0.2, 0.3, 0.25) });

  // Tanda Tangan
  const sigY = 110;
  page.drawText('Disetujui Oleh,', { x: 70, y: sigY + 45, size: 8, font: fontRegular });
  page.drawText('Direktur / Project Manager', { x: 70, y: sigY + 35, size: 8, font: fontBold });
  page.drawLine({ start: { x: 70, y: sigY }, end: { x: 210, y: sigY }, thickness: 0.8, color: rgb(0, 0, 0) });
  page.drawText(po.approvedBy || 'Manajemen Pengadaan', { x: 70, y: sigY - 12, size: 8, font: fontRegular });

  page.drawText('Diterima & Disetujui Vendor,', { x: 360, y: sigY + 45, size: 8, font: fontRegular });
  page.drawText(po.supplierName, { x: 360, y: sigY + 35, size: 8, font: fontBold });
  page.drawLine({ start: { x: 360, y: sigY }, end: { x: 500, y: sigY }, thickness: 0.8, color: rgb(0, 0, 0) });
  page.drawText('Nama & Cap Vendor', { x: 360, y: sigY - 12, size: 8, font: fontRegular });

  const pdfBytes = await pdfDoc.save();
  triggerDownload(pdfBytes, `PO-${po.poNumber.replace(/\//g, '_')}.pdf`);
  return pdfBytes;
}

// ---------------------------------------------------------------------------
// 4. DOKUMEN: RENCANA ANGGARAN BIAYA (RAB / BOQ)
// ---------------------------------------------------------------------------
export async function generateBoqPDF(
  project: Project,
  items: BOQItem[],
  summary: BOQSummary,
  company?: CompanyHeaderInfo
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595.28, 841.89]);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = drawHeader(page, fontBold, fontRegular, company);

  page.drawText('RENCANA ANGGARAN BIAYA (RAB / BOQ)', {
    x: 170,
    y,
    size: 12,
    font: fontBold,
    color: rgb(0.07, 0.21, 0.17),
  });
  y -= 14;
  page.drawText(`Proyek: ${project.name} (${project.code})`, { x: 190, y, size: 9, font: fontRegular });

  y -= 25;
  // Header Tabel RAB
  page.drawRectangle({
    x: 40,
    y: y - 16,
    width: 515.28,
    height: 18,
    color: rgb(0.07, 0.21, 0.17),
  });
  page.drawText('No / Kode', { x: 45, y: y - 11, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('Uraian Pekerjaan', { x: 100, y: y - 11, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('Sat.', { x: 280, y: y - 11, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('Volume', { x: 310, y: y - 11, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('Harga Satuan (Rp)', { x: 360, y: y - 11, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });
  page.drawText('Jumlah Harga (Rp)', { x: 455, y: y - 11, size: 7.5, font: fontBold, color: rgb(1, 1, 1) });

  y -= 20;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (y < 80) {
      page = pdfDoc.addPage([595.28, 841.89]);
      y = 800;
    }

    page.drawText(it.kode || `${i + 1}`, { x: 45, y: y - 8, size: 7, font: fontRegular });
    page.drawText(it.uraian.substring(0, 42), { x: 100, y: y - 8, size: 7, font: fontRegular });
    page.drawText(it.satuan, { x: 280, y: y - 8, size: 7, font: fontRegular });
    page.drawText(it.volume.toLocaleString('id-ID'), { x: 310, y: y - 8, size: 7, font: fontRegular });
    page.drawText(Math.round(it.hargaSatuan).toLocaleString('id-ID'), { x: 360, y: y - 8, size: 7, font: fontRegular });
    page.drawText(Math.round(it.jumlahHarga).toLocaleString('id-ID'), { x: 455, y: y - 8, size: 7, font: fontBold });

    y -= 14;
  }

  y -= 10;
  page.drawLine({ start: { x: 40, y }, end: { x: 555.28, y }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });

  // Summary Subtotal, PPN, Grand Total
  y -= 16;
  page.drawText(`SUBTOTAL PEKERJAAN : ${formatCurrencyIDR(summary.subtotal)}`, { x: 320, y, size: 8, font: fontBold });
  y -= 12;
  page.drawText(`PPN (11%)          : ${formatCurrencyIDR(summary.ppnNominal)}`, { x: 320, y, size: 8, font: fontBold });
  y -= 14;
  page.drawText(`TOTAL KONTRAK      : ${formatCurrencyIDR(summary.grandTotal)}`, { x: 320, y, size: 9, font: fontBold, color: rgb(0.11, 0.41, 0.26) });

  y -= 16;
  page.drawText(`Terbilang: ${terbilangRupiah(summary.grandTotal)}`, { x: 40, y, size: 7.5, font: fontBold, color: rgb(0.2, 0.3, 0.25) });

  const pdfBytes = await pdfDoc.save();
  triggerDownload(pdfBytes, `RAB-BOQ-${project.code}.pdf`);
  return pdfBytes;
}
