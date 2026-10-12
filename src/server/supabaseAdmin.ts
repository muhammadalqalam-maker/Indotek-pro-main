import 'dotenv/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseServerConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
}

export function loadSupabaseServerConfig(): SupabaseServerConfig {
  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    'https://indotek-placeholder.supabase.co';

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder';

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
