import { Request, Response, NextFunction } from 'express';
import { adminAuth, adminDb } from './firebaseAdmin';
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
 * Middleware that authenticates the caller via Supabase JWT or Firebase Auth ID Token,
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

    // Test bypass for emulator & test scripts (ONLY permitted when FIRESTORE_EMULATOR_HOST is set AND NODE_ENV !== 'production')
    if (token.startsWith('test-actor:')) {
      const isEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
      const isNotProd = process.env.NODE_ENV !== 'production';

      if (!isEmulator || !isNotProd) {
        res.status(401).json({
          error: 'Unauthorized: Test actor tokens are strictly forbidden in this environment.',
        });
        return;
      }

      // Format: test-actor:<role>:<uid>:<name>:<email>:<workspaceId>
      const parts = token.split(':');
      const testRole = (parts[1] as AppRole) || 'Owner / Director';
      uid = parts[2] || 'test-user-id';
      name = parts[3] || 'Test Actor';
      email = parts[4] || '';
      const wsId = parts[5] || (req.headers['x-workspace-id'] as string) || (req.body?.workspaceId as string) || 'default-ws';

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

    // 1. Attempt token verification with Supabase Auth if Supabase is configured and token is JWT
    let verifiedViaSupabase = false;
    const isJwtFormat = token.split('.').length === 3 && token.startsWith('eyJ');
    if (isSupabaseConfigured() && isJwtFormat) {
      try {
        const { data: supaUser, error: supaErr } = await supabaseAdmin.auth.getUser(token);
        if (!supaErr && supaUser?.user) {
          verifiedViaSupabase = true;
          uid = supaUser.user.id;
          email = supaUser.user.email || '';
          name = supaUser.user.user_metadata?.full_name || (email ? email.split('@')[0] : 'User');
        }
      } catch {
        // Fall through to Firebase verification
      }
    }

    // 2. Fallback to Firebase Admin token verification if not verified by Supabase
    let decodedToken: any = null;
    if (!verifiedViaSupabase) {
      decodedToken = await adminAuth.verifyIdToken(token);
      uid = decodedToken.uid;
      email = decodedToken.email || '';
      name = decodedToken.name || (email ? email.split('@')[0] : 'User');
    }

    // Determine target workspace ID
    let requestedWsId = (req.headers['x-workspace-id'] as string) || (decodedToken?.workspaceId as string) || '';

    // If verified via Supabase, resolve membership from Supabase Postgres
    if (verifiedViaSupabase) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle();

      if (profile?.full_name) {
        name = profile.full_name;
      }

      let supaMemberQuery = supabaseAdmin
        .from('workspace_members')
        .select('*, workspaces(*)')
        .eq('user_id', uid);

      if (requestedWsId) {
        supaMemberQuery = supaMemberQuery.eq('workspace_id', requestedWsId);
      }

      const { data: members } = await supaMemberQuery;
      const member = members && members.length > 0 ? members[0] : null;

      if (member) {
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
          const { data: pMembers } = await supabaseAdmin
            .from('project_members')
            .select('project_id')
            .eq('workspace_id', wsId)
            .eq('user_id', uid);
          assignedProjectIds = pMembers?.map((p: any) => p.project_id) || [];
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
        return;
      }
    }

    // Check user profile document in /users/{uid}
    const userDoc = await adminDb.collection('users').doc(uid).get();
    let userDocData: FirebaseFirestore.DocumentData | undefined;
    if (userDoc.exists) {
      userDocData = userDoc.data();
      if (!requestedWsId) {
        requestedWsId = userDocData?.workspaceId || userDocData?.defaultWorkspaceId || '';
      }
      if (userDocData?.name) {
        name = userDocData.name;
      }
    }

    if (!requestedWsId) {
      requestedWsId = 'indotek-enterprise';
    }

    // 2. Strict Workspace Membership Validation:
    // x-workspace-id only accepted if uid is registered in workspaces/{wsId}/members/{uid} with status 'Aktif'
    // Non-member or non-active member => 403 Forbidden (unless platform admin via custom claim or admins/{uid})
    const memberDoc = await adminDb
      .collection('workspaces')
      .doc(requestedWsId)
      .collection('members')
      .doc(uid)
      .get();

    let trustedRole: AppRole | null = null;
    let trustedStatus: 'Aktif' | 'Nonaktif' | 'Menunggu Undangan' = 'Aktif';
    let assignedProjectIds: string[] = ['*'];
    let department = 'Operasional';

    if (memberDoc.exists) {
      const data = memberDoc.data()!;
      trustedStatus = data.status || 'Aktif';

      if (trustedStatus !== 'Aktif') {
        res.status(403).json({
          error: `Akses Ditolak: Keanggotaan Anda pada workspace "${requestedWsId}" berstatus ${trustedStatus}. Hubungi Administrator.`,
        });
        return;
      }

      if (data.role && data.role in ROLE_DEFINITIONS) {
        trustedRole = data.role as AppRole;
      }
      if (Array.isArray(data.assignedProjectIds)) {
        assignedProjectIds = data.assignedProjectIds;
      } else if (Array.isArray(data.assignedProjects)) {
        assignedProjectIds = data.assignedProjects;
      }
      if (data.department) department = data.department;
      if (data.name) name = data.name;
    } else {
      // Not a member in workspaces/{requestedWsId}/members/{uid}.
      // Check platform owner / admin authority: ONLY via custom claim (admin === true || role) or admins/{uid} document.
      // NO hardcoded emails!
      let isSystemAdmin = false;

      if (decodedToken.admin === true) {
        isSystemAdmin = true;
      } else {
        const adminDoc = await adminDb.collection('admins').doc(uid).get();
        if (adminDoc.exists && adminDoc.data()?.status !== 'Nonaktif') {
          isSystemAdmin = true;
        }
      }

      if (isSystemAdmin) {
        trustedRole = (decodedToken.role as AppRole) || 'Owner / Director';
        assignedProjectIds = ['*'];
        trustedStatus = 'Aktif';
      } else {
        // Non-member without admin credentials => 403 Forbidden, NOT default role!
        res.status(403).json({
          error: `Akses Ditolak: Pengguna (${uid}) tidak terdaftar sebagai anggota aktif pada workspace "${requestedWsId}".`,
        });
        return;
      }
    }

    if (!trustedRole || !(trustedRole in ROLE_DEFINITIONS)) {
      trustedRole = 'Read-only Auditor';
    }

    req.actor = {
      uid,
      email,
      name,
      role: trustedRole,
      department,
      assignedProjectIds,
      status: trustedStatus,
      workspaceId: requestedWsId,
    };

    const idempKey = (req.headers['x-idempotency-key'] as string) || req.body?.idempotencyKey;
    if (idempKey) {
      req.idempotencyKey = String(idempKey);
    }

    next();
  } catch (err: any) {
    console.error('Authentication Error:', err);
    res.status(401).json({
      error: `Autentikasi gagal: ${err?.message || 'Token tidak valid atau kedaluwarsa.'}`,
    });
  }
}
