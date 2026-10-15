/**
 * tests/pdf-generator.test.ts
 * Uji Unit Pembuatan Dokumen PDF A4 (Laporan Harian, BAST, PO, RAB) via pdf-lib.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { DEFAULT_COMPANY_HEADER } from '../src/utils/pdfGenerator';
import { terbilangRupiah } from '../src/utils/formatters';

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

async function runTests() {
  console.log('\n--- [TEST SUITE: PEMBUATAN DOKUMEN PDF A4 KONTRAKTOR] ---\n');

  console.log('[1] Inisialisasi pdf-lib & Font Standar');
  const pdfDoc = await PDFDocument.create();
  assert(pdfDoc !== null, 'PDFDocument instance berhasil dibuat');

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  assert(fontRegular !== null && fontBold !== null, 'Font Helvetica & HelveticaBold berhasil di-embed');

  console.log('\n[2] Dimensi Halaman Standar A4 (595.28 x 841.89 pt)');
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  assert(Math.round(width) === 595 && Math.round(height) === 842, `Dimensi halaman presisi A4 (${width} x ${height})`);

  console.log('\n[3] Rendering Kop Surat Perusahaan & Format Dokumen');
  page.drawText(DEFAULT_COMPANY_HEADER.companyName, {
    x: 40,
    y: height - 40,
    size: 14,
    font: fontBold,
    color: rgb(0.07, 0.21, 0.17),
  });
  page.drawText(`NPWP: ${DEFAULT_COMPANY_HEADER.npwp}`, {
    x: 40,
    y: height - 60,
    size: 8,
    font: fontRegular,
  });

  const pdfBytes = await pdfDoc.save();
  assert(pdfBytes.length > 500, `Dokumen PDF valid dihasilkan dengan ukuran ${pdfBytes.length} bytes`);

  console.log('\n[4] Pengujian Ejaan Terbilang Rupiah untuk Kontrak & PO');
  const nominalPO = 65_000_000;
  const nominalRAB = 564_182_120;

  const t1 = terbilangRupiah(nominalPO);
  assert(t1 === 'Enam Puluh Lima Juta Rupiah', `Terbilang PO 65 Jt cocok (${t1})`);

  const t2 = terbilangRupiah(nominalRAB);
  assert(t2.includes('Lima Ratus Enam Puluh Empat Juta'), `Terbilang RAB cocok (${t2})`);

  console.log('==========================================');
  console.log(`RINGKASAN PDF GENERATOR TEST: ${passed} lulus, ${failed} gagal.`);
  console.log('==========================================\n');

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
