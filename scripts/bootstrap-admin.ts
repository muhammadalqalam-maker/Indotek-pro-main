/**
 * Indotek Pro — One-Time Administrative Bootstrap Script
 * 
 * Securely provisions the first Owner / Director account via Firebase Admin SDK.
 * Bypasses client-side privileges to establish the root administrative identity.
 * 
 * Usage:
 *   npx tsx scripts/bootstrap-admin.ts --email=<admin-email> [--name=<displayName>]
 * 
 * Example:
 *   npx tsx scripts/bootstrap-admin.ts --email=direktur@example.com --name="Ir. Bambang Sujarwo, IPU"
 */

import type { UserRecord } from 'firebase-admin/auth';
import { adminAuth as auth, adminDb as db, loadFirebaseConfig } from '../src/server/firebaseAdmin';

// Parse CLI arguments
const args = process.argv.slice(2);
let targetEmail = '';
let targetName = 'Root Owner / Director';

for (const arg of args) {
  if (arg.startsWith('--email=')) {
    targetEmail = arg.replace('--email=', '').trim();
  } else if (arg.startsWith('--name=')) {
    targetName = arg.replace('--name=', '').trim();
  } else if (!arg.startsWith('--') && arg.includes('@')) {
    targetEmail = arg.trim();
  }
}

if (!targetEmail || !targetEmail.includes('@')) {
  console.error('======================================================================');
  console.error('ERROR: Argumen --email wajib disertakan dan tidak boleh kosong!');
  console.error('Contoh: npx tsx scripts/bootstrap-admin.ts --email=direktur@example.com');
  console.error('======================================================================');
  process.exit(1);
}

// Locate Firebase Project Config
const { projectId, databaseId } = loadFirebaseConfig();

async function bootstrapOwner() {
  console.log('======================================================================');
  console.log('       INDOTEK PRO — ENTERPRISE ROOT ADMIN BOOTSTRAPPER               ');
  console.log('======================================================================');
  console.log(`Target Email      : ${targetEmail}`);
  console.log(`Target Name       : ${targetName}`);
  console.log(`Project ID        : ${projectId}`);
  console.log(`Target Workspace  : indotek-jkt`);
  console.log('----------------------------------------------------------------------');

  try {
    let userRecord: UserRecord;

    try {
      userRecord = await auth.getUserByEmail(targetEmail);
      console.log(`✓ User found in Firebase Authentication: ${userRecord.uid}`);
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') {
        console.log('Creating new Firebase Authentication user for root Owner...');
        userRecord = await auth.createUser({
          email: targetEmail,
          displayName: targetName,
          emailVerified: true,
          password: 'TemporaryAdminPassword123!', // Must be updated upon initial sign-in
        });
        console.log(`✓ Created user: ${userRecord.uid} (Temporary password assigned)`);
      } else {
        throw err;
      }
    }

    // Assign custom claims for owner
    console.log('Injecting custom claims: role=Owner / Director, admin=true...');
    await auth.setCustomUserClaims(userRecord.uid, {
      role: 'Owner / Director',
      admin: true,
      workspaceId: 'indotek-jkt',
      status: 'Aktif',
    });
    console.log('✓ Custom claims applied to Auth Token');

    // Provision root directory record
    console.log('Ensuring /users document exists in Firestore...');
    const now = new Date().toISOString();
    await db.collection('users').doc(userRecord.uid).set(
      {
        uid: userRecord.uid,
        email: targetEmail,
        name: targetName,
        status: 'Aktif',
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
    console.log('✓ /users document updated');

    // Provision workspace membership
    console.log('Ensuring /workspaces/indotek-jkt/members document exists...');
    await db
      .collection('workspaces')
      .doc('indotek-jkt')
      .collection('members')
      .doc(userRecord.uid)
      .set(
        {
          uid: userRecord.uid,
          name: targetName,
          email: targetEmail,
          role: 'Owner / Director',
          department: 'Direksi & Eksekutif',
          nip: 'IND-DIR-001',
          status: 'Aktif',
          assignedProjects: ['*'],
          workspaceId: 'indotek-jkt',
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    console.log('✓ Workspace membership granted with full privileges');

    console.log('======================================================================');
    console.log('SUCCESS: Root Owner / Director bootstrapped successfully.');
    console.log(`Email: ${targetEmail}`);
    console.log(`UID:   ${userRecord.uid}`);
    console.log('======================================================================');
  } catch (error: any) {
    console.error('FAILED to bootstrap owner:', error?.message || error);
    process.exit(1);
  }
}

bootstrapOwner();
