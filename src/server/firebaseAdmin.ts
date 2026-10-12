import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth } from 'firebase-admin/auth';
import * as fs from 'fs';
import * as path from 'path';

let adminApp: App;
let adminDb: Firestore;
let adminAuth: Auth;

export interface FirebaseServerConfig {
  projectId: string;
  databaseId?: string;
}

/**
 * Helper tunggal untuk membaca konfigurasi Firebase dari firebase-applet-config.json
 * atau environment variables jika di-override.
 * Gagal dengan pesan jelas jika projectId atau databaseId tidak ditemukan.
 */
export function loadFirebaseConfig(): FirebaseServerConfig {
  let projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
  let databaseId = process.env.FIRESTORE_DATABASE_ID || process.env.VITE_FIREBASE_DATABASE_ID;

  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      projectId = projectId || raw.projectId;
      databaseId = databaseId || raw.firestoreDatabaseId;
    } catch (e) {
      console.warn('[Indotek Pro] Gagal membaca firebase-applet-config.json:', e);
    }
  }

  if (!projectId) {
    throw new Error(
      'Inisialisasi Firebase Admin Gagal: projectId tidak ditemukan. ' +
      'Pastikan file firebase-applet-config.json tersedia di root repository dengan properti "projectId" atau tetapkan FIREBASE_PROJECT_ID di environment variables.'
    );
  }

  if (!databaseId) {
    throw new Error(
      'Inisialisasi Firebase Admin Gagal: databaseId (firestoreDatabaseId) tidak ditemukan. ' +
      'Pastikan file firebase-applet-config.json memiliki properti "firestoreDatabaseId" atau tetapkan FIRESTORE_DATABASE_ID di environment variables.'
    );
  }

  return { projectId, databaseId };
}

function initFirebaseAdmin() {
  const { projectId, databaseId } = loadFirebaseConfig();

  if (getApps().length > 0) {
    adminApp = getApps()[0];
  } else {
    adminApp = initializeApp({
      projectId,
    });
  }

  adminDb = databaseId ? getFirestore(adminApp, databaseId) : getFirestore(adminApp);
  adminAuth = getAuth(adminApp);

  return { adminApp, adminDb, adminAuth };
}

const { adminApp: app, adminDb: defaultDb, adminAuth: auth } = initFirebaseAdmin();

let activeDb: any = defaultDb;
let activeAuth: any = auth;

export function setAdminDb(dbInstance: any) {
  activeDb = dbInstance;
}

export function setAdminAuth(authInstance: any) {
  activeAuth = authInstance;
}

export const dynamicAdminDb = new Proxy({} as FirebaseFirestore.Firestore, {
  get(_target, prop) {
    return (activeDb as any)[prop];
  },
});

export const dynamicAdminAuth = new Proxy({} as any, {
  get(_target, prop) {
    return (activeAuth as any)[prop];
  },
});

export { app as adminApp, dynamicAdminDb as adminDb, dynamicAdminAuth as adminAuth };
export const getAdminDb = () => activeDb;
export const getAdminAuth = () => activeAuth;
