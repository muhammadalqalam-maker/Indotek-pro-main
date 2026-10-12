/**
 * Indotek Pro — One-Time Server-Side Admin & Owner Bootstrap Script
 * 
 * Usage:
 *   npx tsx scripts/bootstrap-owner.ts --email=<email> [--password=<password>] [--name=<fullName>]
 * 
 * Example:
 *   npx tsx scripts/bootstrap-owner.ts --email=direktur@example.com --password="Katasandi#Aman2026" --name="Ir. Bambang Sujarwo, IPU"
 */

import type { UserRecord } from 'firebase-admin/auth';
import { adminAuth as auth, adminDb as db, loadFirebaseConfig } from '../src/server/firebaseAdmin';

loadFirebaseConfig();

async function bootstrapOwner() {
  const args = process.argv.slice(2);
  let email = '';
  let password = '';
  let fullName = 'Root Owner / Director';
  const workspaceId = 'indotek-jkt';

  for (const arg of args) {
    if (arg.startsWith('--email=')) {
      email = arg.replace('--email=', '').trim();
    } else if (arg.startsWith('--password=')) {
      password = arg.replace('--password=', '').trim();
    } else if (arg.startsWith('--name=')) {
      fullName = arg.replace('--name=', '').trim();
    } else if (!arg.startsWith('--')) {
      if (!email && arg.includes('@')) {
        email = arg.trim();
      } else if (!password) {
        password = arg.trim();
      } else if (fullName === 'Root Owner / Director') {
        fullName = arg.trim();
      }
    }
  }

  if (!email || !email.includes('@')) {
    console.error('======================================================================');
    console.error('ERROR: Argumen --email wajib disertakan dan tidak boleh kosong!');
    console.error('Contoh: npx tsx scripts/bootstrap-owner.ts --email=owner@example.com');
    console.error('======================================================================');
    process.exit(1);
  }

  if (!password) {
    password = 'Indotek#Admin2026!';
  }

  console.log('======================================================================');
  console.log('       INDOTEK PRO — ENTERPRISE OWNER & ADMIN BOOTSTRAP SCRIPT         ');
  console.log('======================================================================');
  console.log(`Target Email     : ${email}`);
  console.log(`Target Name      : ${fullName}`);
  console.log(`Target Workspace : ${workspaceId}`);
  console.log('----------------------------------------------------------------------\n');

  if (password.length < 12) {
    console.error('Error: Password harus minimal 12 karakter untuk standar keamanan produksi.');
    process.exit(1);
  }

  let userRecord: UserRecord;

  try {
    // 1. Check if user already exists in Firebase Auth
    try {
      userRecord = await auth.getUserByEmail(email);
      console.log(`[AUTH] Pengguna terdaftar ditemukan (UID: ${userRecord.uid}). Memperbarui kredensial...`);
      await auth.updateUser(userRecord.uid, {
        displayName: fullName,
        emailVerified: true,
        password,
      });
    } catch (notFound) {
      console.log('[AUTH] Membuat akun pengguna Owner pertama di Firebase Auth...');
      userRecord = await auth.createUser({
        email,
        password,
        displayName: fullName,
        emailVerified: true,
      });
      console.log(`[AUTH] Pengguna berhasil dibuat (UID: ${userRecord.uid}).`);
    }

    // 2. Set Custom User Claims on Firebase Auth Token (Immutable by Client)
    console.log('[CLAIMS] Menetapkan Custom Claims wewenang Owner / Director...');
    await auth.setCustomUserClaims(userRecord.uid, {
      role: 'Owner / Director',
      workspaceId,
      admin: true,
      status: 'Aktif',
    });
    console.log('[CLAIMS] Custom Claims berhasil disuntikkan: { role: "Owner / Director", workspaceId, admin: true }');

    // 3. Create or Update Core User Document (/users/{uid})
    const now = new Date().toISOString();
    console.log(`[FIRESTORE] Menulis dokumen /users/${userRecord.uid}...`);
    await db.collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      name: fullName,
      email,
      status: 'Aktif',
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    // 4. Create Workspace Member Document (/workspaces/{wsId}/members/{uid})
    console.log(`[FIRESTORE] Mendaftarkan keanggotaan resmi /workspaces/${workspaceId}/members/${userRecord.uid}...`);
    await db.collection('workspaces').doc(workspaceId).collection('members').doc(userRecord.uid).set({
      uid: userRecord.uid,
      name: fullName,
      email,
      role: 'Owner / Director',
      department: 'Direksi & Eksekutif',
      nip: 'IND-DIR-001',
      status: 'Aktif',
      assignedProjects: ['*'],
      workspaceId,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    console.log('\n======================================================================');
    console.log('✓ BOOTSTRAP OWNER SELESAI DENGAN SUKSES!');
    console.log(`  Akun ${email} sekarang memiliki wewenang Owner / Director penuh.`);
    console.log('======================================================================');
  } catch (error: any) {
    console.error('[ERROR] Gagal menjalankan bootstrap owner:', error?.message || error);
    process.exit(1);
  }
}

bootstrapOwner();
