import 'dotenv/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseServerConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
}

export function loadSupabaseServerConfig(): SupabaseServerConfig {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error(
      'Konfigurasi Supabase Server gagal: SUPABASE_URL atau VITE_SUPABASE_URL wajib disetel pada environment.'
    );
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      'Konfigurasi Supabase Server gagal: SUPABASE_SERVICE_ROLE_KEY wajib disetel pada environment (fallback ke anon key / placeholder ditiadakan).'
    );
  }

  return { supabaseUrl, serviceRoleKey };
}

const { supabaseUrl, serviceRoleKey } = loadSupabaseServerConfig();

const defaultSupabaseAdmin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

let activeClient: SupabaseClient = defaultSupabaseAdmin;

export function setSupabaseAdminClient(clientInstance: SupabaseClient) {
  activeClient = clientInstance;
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (activeClient as any)[prop];
  },
});

export const getSupabaseAdmin = () => activeClient;
export default supabaseAdmin;
