import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  doc,
  getDocFromServer
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Requirement 5: Enable local persistent cache with multi-tab coordination
let dbInstance;
try {
  dbInstance = initializeFirestore(
    app,
    {
      localCache:
        typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
          ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
          : memoryLocalCache(),
    },
    firebaseConfig.firestoreDatabaseId
  );
} catch {
  // If already initialized, reuse instance
  dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

export const db = dbInstance;
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export const isQuotaExhaustedError = (error: unknown): boolean => {
  if (!error) return false;
  const str = String((error as any)?.message || (error as any)?.code || error || '').toLowerCase();
  return (
    str.includes('resource-exhausted') ||
    str.includes('quota exceeded') ||
    str.includes('quota') ||
    (error as any)?.code === 'resource-exhausted'
  );
};

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const isSupabase = typeof window !== 'undefined' && Boolean(
    (import.meta as any).env?.VITE_SUPABASE_URL ||
    (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL)
  );

  if (isSupabase) {
    console.warn(`[Firestore Notice (Supabase Active)]: Operation ${operationType} on ${path}:`, error);
    return undefined as never;
  }

  if (typeof window !== 'undefined' && isQuotaExhaustedError(error)) {
    window.dispatchEvent(new CustomEvent('firestore:quota-exhausted'));
  }

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider: any) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection() {
  const isSupabase = typeof window !== 'undefined' && Boolean(
    (import.meta as any).env?.VITE_SUPABASE_URL ||
    (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL)
  );
  if (isSupabase) return;

  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
