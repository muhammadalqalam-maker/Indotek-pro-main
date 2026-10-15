import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  (typeof process !== 'undefined' && (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL)) ||
  'https://placeholder.supabase.co';

const supabaseAnonKey =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof process !== 'undefined' && (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY)) ||
  'placeholder-anon-key';

const hasRealConfig = Boolean(
  ((typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
    (typeof process !== 'undefined' && (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL))) &&
  ((typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
    (typeof process !== 'undefined' && (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY)))
);

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: typeof window !== 'undefined',
    autoRefreshToken: typeof window !== 'undefined',
    detectSessionInUrl: typeof window !== 'undefined',
  },
});

export function isSupabaseConfigured(): boolean {
  return hasRealConfig;
}

/**
 * Memastikan hasil query/mutasi supabase tidak mengandung error.
 * Melempar Error jika error terdeteksi (mencegah silent failure).
 */
export function unwrap<T = any>(result: { data?: T | null; error: any }): T {
  if (result.error) {
    const message =
      result.error?.message ||
      result.error?.details ||
      (typeof result.error === 'string' ? result.error : JSON.stringify(result.error));
    const err = new Error(message);
    (err as any).details = result.error;
    throw err;
  }
  return result.data as T;
}

export default supabase;
