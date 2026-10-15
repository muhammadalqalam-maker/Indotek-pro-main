/**
 * Vercel Edge Function: api/invite-member.ts
 * Memanggil RPC invite_member (security definer) lalu mengirim email undangan.
 * 
 * Method: POST
 * Body: { workspaceId, email, role, department }
 * Auth: Bearer <supabase_access_token>
 */

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const config = { runtime: 'edge' };

// Rate limiting: 10 invitations per 60 seconds per IP
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_STATE = new Map<string, number[]>();

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://indotek-pro.vercel.app',
  process.env.APP_URL,
].filter(Boolean);

function getAllowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  return ALLOWED_ORIGINS.includes(origin) ? origin : null;
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  const timestamps = RATE_LIMIT_STATE.get(ip) || [];
  const recent = timestamps.filter((t) => t > windowStart);
  RATE_LIMIT_STATE.set(ip, recent);
  return recent.length < RATE_LIMIT_MAX;
}

function roleDisplayName(role: string): string {
  const ROLE_LABELS: Record<string, string> = {
    owner: 'Owner / Director',
    project_manager: 'Project Manager',
    site_engineer: 'Site Engineer',
    quantity_surveyor: 'Quantity Surveyor',
    procurement: 'Procurement',
    finance: 'Finance',
    viewer: 'Viewer',
  };
  return ROLE_LABELS[role] || role;
}

export default async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('Origin');
  const allowedOrigin = getAllowedOrigin(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': allowedOrigin || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  // CORS: Reject requests from disallowed origins
  if (origin && !allowedOrigin) {
    return new Response(JSON.stringify({ error: 'Origin tidak diizinkan.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Rate limiting by IP
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return new Response(
      JSON.stringify({ error: 'Terlalu banyak permintaan. Coba lagi dalam 1 menit.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validasi Authorization header
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Token otorisasi diperlukan.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const accessToken = authHeader.slice(7);

  // Parse body
  let body: { workspaceId: string; email: string; role: string; department?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Request body tidak valid.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { workspaceId, email, role, department = '' } = body;

  if (!workspaceId || !email || !role) {
    return new Response(
      JSON.stringify({ error: 'workspaceId, email, dan role wajib diisi.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validasi email sederhana
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(
      JSON.stringify({ error: 'Format email tidak valid.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Buat Supabase client dengan token user (RLS akan memeriksa peran)
  const supabaseUrl  = process.env.VITE_SUPABASE_URL!;
  const supabaseAnon = process.env.VITE_SUPABASE_ANON_KEY!;

  if (!supabaseUrl || !supabaseAnon) {
    return new Response(
      JSON.stringify({ error: 'Konfigurasi server tidak lengkap.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  // Panggil RPC invite_member (security definer — RLS divalidasi di PostgreSQL)
  const { data, error } = await supabase.rpc('invite_member', {
    p_workspace_id: workspaceId,
    p_email:        email.toLowerCase(),
    p_role:         role,
    p_department:   department,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Kirim email undangan via Resend
  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const inviteLink = `${appUrl}/terima-undangan?token=${data.token}`;
  const resendApiKey = process.env.RESEND_API_KEY;

  if (resendApiKey) {
    try {
      const resend = new Resend(resendApiKey);
      await resend.emails.send({
        from: 'Indotek Pro <noreply@indotek.pro>',
        to: email.toLowerCase(),
        subject: 'Undangan Bergabung ke Indotek Pro',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1e40af;">Undangan Bergabung</h2>
            <p>Anda diundang untuk bergabung sebagai <strong>${roleDisplayName(role)}</strong>.</p>
            <p>Klik tombol di bawah untuk menerima undangan:</p>
            <a href="${inviteLink}" style="display: inline-block; padding: 12px 24px; background: #1e40af; color: white; text-decoration: none; border-radius: 6px;">
              Terima Undangan
            </a>
            <p style="color: #666; font-size: 14px; margin-top: 20px;">
              Tautan berlaku 7 hari. Jika tombol tidak berfungsi, salin tautan ini ke browser:<br>
              <code style="word-break: break-all;">${inviteLink}</code>
            </p>
          </div>
        `,
      });
    } catch (emailError: any) {
      // Log error tapi tetap kembalikan token untuk link manual
      console.error('Resend error:', emailError?.message || emailError);
    }
  }

  const corsHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (allowedOrigin) {
    corsHeaders['Access-Control-Allow-Origin'] = allowedOrigin;
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: data.message,
      token: resendApiKey ? undefined : data.token, // Hanya return token jika email gagal
      expires: data.expires,
      emailSent: !!resendApiKey,
    }),
    {
      status: 200,
      headers: corsHeaders,
    }
  );
}
