/**
 * DEPRECATED: Firebase Admin initialization
 * 
 * This module is no longer used in Supabase-only architecture.
 * All admin operations use supabaseAdmin.ts instead.
 */

export function loadFirebaseConfig() {
  throw new Error('Firebase admin deprecated. Use supabaseAdmin.ts instead.');
}

export const adminAuth = null as any;
export const adminDb = null as any;
