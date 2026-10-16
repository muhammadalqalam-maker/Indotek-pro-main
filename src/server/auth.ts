import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from './supabaseAdmin';
import { isSupabaseConfigured } from './supabaseWorkflowService';
import { AppRole, DB_ROLE_TO_APP_ROLE } from '../types/rbac';
import { ROLE_DEFINITIONS } from '../lib/rbac';
import { ForbiddenError } from './errors';

export { DB_ROLE_TO_APP_ROLE };

export interface TrustedActor {
  uid: string;
  email: string;
  name: string;
  role: AppRole;
  department: string;
  assignedProjectIds: string[];
  status: 'Aktif' | 'Nonaktif' | 'Menunggu Undangan';
  workspaceId: string;
  token?: string;
}

declare global {
  namespace Express {
    interface Request {
      actor?: TrustedActor;
      idempotencyKey?: string;
    }
  }
}

/**
 * Middleware that authenticates the caller via a Supabase JWT,
 * validates workspace membership strictly, and fetches the trusted role, status,
 * and assignedProjects from the database.
 * NEVER trusts the role or permissions passed in the request body.
 */
export async function authenticateTrustedActor(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Unauthorized: Missing or malformed Authorization header. Expected Bearer token.',
      });
      return;
    }

    const token = authHeader.split('Bearer ')[1].trim();
    let uid = '';
    let email = '';
    let name = '';

    // Test bypass for emulator & test scripts (ONLY permitted when NODE_ENV !== 'production')
    if (token.startsWith('test-actor:')) {
      const isNotProd = process.env.NODE_ENV !== 'production';

      if (!isNotProd) {
        res.status(401).json({
          error: 'Unauthorized: Test actor tokens are strictly forbidden in this environment.',
        });
        return;
      }

      // Format: test-actor:<role>:<uid>:<name>:<email>:<workspaceId>
      const parts = token.split(':');
      
      if (parts.length < 6) {
        res.status(400).json({
          error: 'Malformed test-actor token. Expected format: test-actor:<role>:<uid>:<name>:<email>:<workspaceId>',
        });
        return;
      }

      const testRole = parts[1] as AppRole;
      uid = parts[2];
      name = parts[3];
      email = parts[4];
      const wsId = parts[5];

      if (!uid || !name || !testRole) {
        res.status(400).json({
          error: 'Invalid test-actor token: uid, name, and role cannot be empty.',
        });
        return;
      }

      req.actor = {
        uid,
        email,
        name,
        role: testRole in ROLE_DEFINITIONS ? testRole : 'Owner / Director',
        department: ROLE_DEFINITIONS[testRole]?.department || 'Operasional',
        assignedProjectIds: ['*'],
        status: 'Aktif',
        workspaceId: wsId,
      };

      const idempKey = (req.headers['x-idempotency-key'] as string) || req.body?.idempotencyKey;
      if (idempKey) req.idempotencyKey = String(idempKey);
      next();
      return;
    }

    // Verify token with Supabase Auth
    if (!isSupabaseConfigured()) {
      res.status(503).json({
        error: 'Service Unavailable: Supabase not configured.',
      });
      return;
    }

    const { data: supaUser, error: supaErr } = await supabaseAdmin.auth.getUser(token);
    if (supaErr || !supaUser?.user) {
      res.status(401).json({
        error: `Autentikasi gagal: ${supaErr?.message || 'Token tidak valid atau kedaluwarsa.'}`,
      });
      return;
    }

    uid = supaUser.user.id;
    email = supaUser.user.email || '';
    name = supaUser.user.user_metadata?.full_name || (email ? email.split('@')[0] : 'User');

    // Get full name from profiles if available
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', uid)
      .maybeSingle();
    if (profileError) throw new Error(`Gagal memuat profil: ${profileError.message}`);

    if (profile?.full_name) {
      name = profile.full_name;
    }

    // Determine target workspace ID
    let requestedWsId = (req.headers['x-workspace-id'] as string) || '';

    // Query workspace membership
    let supaMemberQuery = supabaseAdmin
      .from('workspace_members')
      .select('*, workspaces(*)')
      .eq('user_id', uid);

    if (requestedWsId) {
      supaMemberQuery = supaMemberQuery.eq('workspace_id', requestedWsId);
    }

    const { data: members, error: membersError } = await supaMemberQuery;
    if (membersError) throw new Error(`Gagal memuat keanggotaan workspace: ${membersError.message}`);
    const member = members && members.length > 0 ? members[0] : null;

    if (!member) {
      res.status(403).json({
        error: `Akses Ditolak: Pengguna (${uid}) tidak terdaftar sebagai anggota aktif pada workspace${requestedWsId ? ` "${requestedWsId}"` : ' manapun'}.`,
      });
      return;
    }

    const wsId = member.workspace_id;
    const dbRole = member.role as string;
    const trustedRole = DB_ROLE_TO_APP_ROLE[dbRole] || (dbRole as AppRole);
    const status = member.status as 'Aktif' | 'Nonaktif' | 'Menunggu Undangan';

    if (status !== 'Aktif') {
      res.status(403).json({
        error: `Akses Ditolak: Keanggotaan Anda pada workspace "${wsId}" berstatus ${status}. Hubungi Administrator.`,
      });
      return;
    }

    let assignedProjectIds: string[] = ['*'];
    if (!member.all_projects && !['owner', 'finance', 'auditor'].includes(dbRole)) {
      const { data: pMembers, error: projectMembersError } = await supabaseAdmin
        .from('project_members')
        .select('project_id')
        .eq('workspace_id', wsId)
        .eq('user_id', uid);
      if (projectMembersError) {
        throw new Error(`Gagal memuat akses proyek: ${projectMembersError.message}`);
      }
      assignedProjectIds = (pMembers || []).map((p: any) => p.project_id);
    }

    req.actor = {
      uid,
      email,
      name,
      role: trustedRole,
      department: member.department || ROLE_DEFINITIONS[trustedRole]?.department || 'Operasional',
      assignedProjectIds,
      status,
      workspaceId: wsId,
      token,
    };

    const idempKey = (req.headers['x-idempotency-key'] as string) || req.body?.idempotencyKey;
    if (idempKey) req.idempotencyKey = String(idempKey);

    next();
  } catch (err: any) {
    console.error('Authentication Error:', err);
    res.status(500).json({
      error: `Gagal memverifikasi akses workspace: ${err?.message || 'Kesalahan server tidak diketahui.'}`,
    });
  }
}
