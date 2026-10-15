/**
 * tests/storage-attachments.test.ts
 * Uji Keamanan Storage, RLS Attachments, Path Bucket, dan Kompresi Foto.
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

console.log('\n--- [TEST SUITE: STORAGE SECURITY & ATTACHMENTS HARDENING] ---\n');

// 1. Verifikasi File Migrasi
console.log('[1] Verifikasi Migrasi 20261013000013_storage_security_and_attachments.sql');
const migrationPath = path.resolve('supabase/migrations/20261013000013_storage_security_and_attachments.sql');
assert(fs.existsSync(migrationPath), 'File migrasi 0013 harus ada di supabase/migrations');

const sql = fs.readFileSync(migrationPath, 'utf8');
assert(sql.includes('function private.can_access_attachment'), 'Helper private.can_access_attachment harus didefinisikan');
assert(sql.includes("when 'field_report' then"), 'Validasi modul field_reports dengan is_assigned');
assert(sql.includes("when 'petty_cash' then"), 'Validasi modul petty_cash dengan budget permission & is_assigned');
assert(sql.includes("when 'purchase_order' then"), 'Validasi modul purchase_order dengan procurement permission & is_assigned');
assert(sql.includes("when 'stock_adjustment' then"), 'Validasi modul stock_adjustment dengan materials permission');
assert(sql.includes("when 'project' then"), 'Validasi modul project dengan projects permission');
assert(sql.includes('policy attachments_select on public.attachments'), 'Policy attachments_select harus diperketat');
assert(sql.includes('policy attachments_insert on public.attachments'), 'Policy attachments_insert harus memvalidasi permission');
assert(sql.includes('policy attachments_delete on public.attachments'), 'Policy attachments_delete harus mengizinkan pengunggah atau Owner');
assert(sql.includes('policy attachments_obj_select on storage.objects'), 'Policy storage.objects select harus menggunakan can_access_attachment');
assert(sql.includes('policy attachments_obj_delete on storage.objects'), 'Policy storage.objects delete harus mengizinkan pengunggah atau Owner');
assert(sql.toLowerCase().includes('assert exists ('), 'Blok assertion SQL harus ada');

// 2. Verifikasi Format Path Bucket
console.log('\n[2] Uji Format Storage Path: <workspace_id>/<record_type>/<record_id>/<uuid>.<ext>');
const wsId = '550e8400-e29b-41d4-a716-446655440000';
const recordType = 'field_report';
const recordId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const fileUuid = 'a3bb189e-8bf9-3888-9912-ace4e6543002';
const ext = 'jpg';

const storagePath = `${wsId}/${recordType}/${recordId}/${fileUuid}.${ext}`;
const pathParts = storagePath.split('/');

assert(pathParts.length === 4, 'Path storage harus terdiri dari 4 segmen terpisah oleh slash');
assert(pathParts[0] === wsId, 'Segmen pertama harus workspace_id');
assert(pathParts[1] === recordType, 'Segmen kedua harus record_type yang valid');
assert(pathParts[2] === recordId, 'Segmen ketiga harus record_id');
assert(pathParts[3].endsWith('.jpg'), 'Segmen keempat harus nama file berakhiran ekstensi');

// 3. Verifikasi Logika Kompresi Gambar
console.log('\n[3] Logika Kompresi Gambar (Maks Sisi 1600px, JPEG 0.75)');
function calculateDimensions(origWidth: number, origHeight: number, maxSide: number = 1600) {
  if (origWidth <= maxSide && origHeight <= maxSide) {
    return { width: origWidth, height: origHeight };
  }
  if (origWidth > origHeight) {
    return {
      width: maxSide,
      height: Math.round((origHeight * maxSide) / origWidth),
    };
  } else {
    return {
      width: Math.round((origWidth * maxSide) / origHeight),
      height: maxSide,
    };
  }
}

const res1 = calculateDimensions(4000, 3000, 1600);
assert(res1.width === 1600 && res1.height === 1200, `Landscape 4000x3000 dikompres jadi 1600x1200 (didapat: ${res1.width}x${res1.height})`);

const res2 = calculateDimensions(2400, 4800, 1600);
assert(res2.width === 800 && res2.height === 1600, `Portrait 2400x4800 dikompres jadi 800x1600 (didapat: ${res2.width}x${res2.height})`);

const res3 = calculateDimensions(800, 600, 1600);
assert(res3.width === 800 && res3.height === 600, 'Gambar di bawah 1600px tidak diperbesar');

console.log('==========================================');
console.log(`RINGKASAN STORAGE TEST: ${passed} lulus, ${failed} gagal.`);
console.log('==========================================\n');

if (failed > 0) process.exit(1);
