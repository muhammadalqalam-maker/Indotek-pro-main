import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { isPasswordRecoveryRedirect, supabase } from '../lib/supabase';
import { UserProfile } from '../types';
import { AppRole, AppModule, AppAction, RolePermissions, DB_ROLE_TO_APP_ROLE } from '../types/rbac';
import {
  ROLE_DEFINITIONS,
  canRolePerform,
  hasApprovalAuthority,
  isUserAssignedToProject
} from '../lib/rbac';

export interface AppAuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  providerData: Array<{ providerId: string }>;
  getIdToken?: (forceRefresh?: boolean) => Promise<string>;
}

interface AuthContextType {
  currentUser: AppAuthUser | null;
  userProfile: UserProfile | null;
  isLoading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  reloadUserVerification: () => Promise<boolean>;
  isLoginModalOpen: boolean;
  setIsLoginModalOpen: (open: boolean) => void;
  isPasswordRecovery: boolean;
  setIsPasswordRecovery: (state: boolean) => void;
  isAdmin: boolean;
  isEmailVerified: boolean;
  // RBAC & Governance
  activeRole: AppRole;
  setActiveRole: (role: AppRole) => void;
  hasRolePermission: (module: AppModule, action: AppAction) => boolean;
  hasAuthority: (authority: keyof RolePermissions['approvalAuthorities']) => boolean;
  canAccessProject: (projectIdOrName: string) => boolean;
  assignedProjects: string[];
  isPendingApproval: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AppAuthUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(isPasswordRecoveryRedirect);
  const [activeRole, setActiveRole] = useState<AppRole>('Read-only Auditor');
  const [isPendingApproval, setIsPendingApproval] = useState<boolean>(false);
  const [isAdminUser, setIsAdminUser] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Supabase auth listener
  useEffect(() => {
    let ignore = false;
    let latestSync = 0;
    let authSyncTimeout: ReturnType<typeof setTimeout> | null = null;

    async function syncSupabaseUser(sessionUser: any) {
      const syncId = ++latestSync;
      if (!sessionUser) {
        setCurrentUser(null);
        setUserProfile(null);
        setActiveRole('Read-only Auditor');
        setIsPendingApproval(false);
        setIsAdminUser(false);
        setAuthError(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setAuthError(null);
      const appUser: AppAuthUser = {
        uid: sessionUser.id,
        email: sessionUser.email || null,
        displayName: sessionUser.user_metadata?.full_name || sessionUser.email?.split('@')[0] || 'User',
        emailVerified: !!sessionUser.email_confirmed_at,
        providerData: sessionUser.app_metadata?.providers?.map((p: string) => ({ providerId: p })) || [{ providerId: 'supabase' }],
        getIdToken: async () => {
          const { data } = await supabase.auth.getSession();
          return data.session?.access_token || '';
        },
      };

      setCurrentUser(appUser);

      try {
        const [profileResult, membershipsResult] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, email, full_name, nip, created_at, updated_at')
            .eq('id', sessionUser.id)
            .maybeSingle(),
          supabase
            .from('workspace_members')
            .select('workspace_id, role, department, status, all_projects, created_at')
            .eq('user_id', sessionUser.id)
            .order('created_at', { ascending: true }),
        ]);

        if (ignore || syncId !== latestSync) return;
        if (profileResult.error) throw new Error(`Profil: ${profileResult.error.message}`);
        if (membershipsResult.error) throw new Error(`Keanggotaan: ${membershipsResult.error.message}`);

        const profileData = profileResult.data;
        const memberships = membershipsResult.data || [];
        const membership = memberships.find((item) => item.status === 'Aktif') || memberships[0];

        if (!membership) {
          setUserProfile(null);
          setActiveRole('Read-only Auditor');
          setIsPendingApproval(false);
          setIsAdminUser(false);
          return;
        }

        let assignedProjectIds: string[] = membership.all_projects ? ['*'] : [];
        if (!membership.all_projects) {
          const { data: projectMembers, error: projectMembersError } = await supabase
            .from('project_members')
            .select('project_id')
            .eq('workspace_id', membership.workspace_id)
            .eq('user_id', sessionUser.id);

          if (ignore || syncId !== latestSync) return;
          if (projectMembersError) throw new Error(`Akses proyek: ${projectMembersError.message}`);
          assignedProjectIds = (projectMembers || []).map((item) => item.project_id);
        }

        const appRole =
          DB_ROLE_TO_APP_ROLE[membership.role as keyof typeof DB_ROLE_TO_APP_ROLE] ||
          'Read-only Auditor';
        const profile: UserProfile = {
          uid: sessionUser.id,
          email: profileData?.email || appUser.email || '',
          name: profileData?.full_name || appUser.displayName || 'User',
          role: appRole,
          department: membership.department || '',
          nip: profileData?.nip || '',
          workspaceId: membership.workspace_id,
          assignedProjectIds,
          assignedProjects: assignedProjectIds,
          status: membership.status,
          createdAt: profileData?.created_at,
          updatedAt: profileData?.updated_at,
        };

        setUserProfile(profile);
        setIsPendingApproval(membership.status !== 'Aktif');
        setActiveRole(membership.status === 'Aktif' ? appRole : 'Read-only Auditor');
        setIsAdminUser(membership.status === 'Aktif' && appRole === 'Owner / Director');
      } catch (error) {
        if (ignore || syncId !== latestSync) return;
        setUserProfile(null);
        setActiveRole('Read-only Auditor');
        setIsPendingApproval(true);
        setIsAdminUser(false);
        setAuthError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!ignore && syncId === latestSync) setIsLoading(false);
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'USER_UPDATED') return;
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }
      if (authSyncTimeout) clearTimeout(authSyncTimeout);
      // Supabase auth callbacks run under its auth lock; defer profile queries until it is released.
      authSyncTimeout = setTimeout(() => {
        authSyncTimeout = null;
        if (!ignore) void syncSupabaseUser(session?.user || null);
      }, 0);
    });

    const initialSyncId = ++latestSync;
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) throw error;
      if (!ignore && initialSyncId === latestSync) {
        return syncSupabaseUser(data.session?.user || null);
      }
    }).catch((error: unknown) => {
      if (ignore || initialSyncId !== latestSync) return;
      setAuthError(error instanceof Error ? error.message : String(error));
      setIsLoading(false);
    });

    return () => {
      ignore = true;
      if (authSyncTimeout) clearTimeout(authSyncTimeout);
      latestSync++;
      subscription?.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      console.error('Error signing in with Google (Supabase):', error);
      throw error;
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
    } catch (error: any) {
      console.error('Error signing in with email (Supabase):', error);
      throw error;
    }
  };

  const reloadUserVerification = async (): Promise<boolean> => {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return !!data.user?.email_confirmed_at;
  };

  const sendPasswordReset = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) throw error;
    } catch (error: any) {
      console.error('Error sending password reset email:', error);
      throw error;
    }
  };

  const updatePassword = async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    } catch (error: any) {
      console.error('Error updating password:', error);
      throw error;
    }
  };

  const signOutUser = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUserProfile(null);
    setCurrentUser(null);
    setActiveRole('Read-only Auditor');
    setIsPendingApproval(false);
    setIsAdminUser(false);
    setAuthError(null);
  };

  const assignedProjects = userProfile?.assignedProjects || [];

  const handleSetActiveRole = (newRole: AppRole) => {
    if (isAdminUser || import.meta.env.DEV) {
      setActiveRole(newRole);
    }
    // Role switcher silently disabled for non-admin in production
  };

  const hasRolePermission = (module: AppModule, action: AppAction): boolean => {
    if (isPendingApproval) return false;
    return canRolePerform(activeRole, module, action);
  };

  const hasAuthority = (authority: keyof RolePermissions['approvalAuthorities']): boolean => {
    if (isPendingApproval) return false;
    return hasApprovalAuthority(activeRole, authority);
  };

  const canAccessProject = (projectIdOrName: string): boolean => {
    if (isPendingApproval) return false;
    return isUserAssignedToProject(activeRole, assignedProjects, projectIdOrName);
  };

  const isEmailVerified = Boolean(
    currentUser && (
      currentUser.emailVerified ||
      currentUser.providerData?.some((p: any) => p.providerId === 'google')
    )
  );

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        isLoading,
        authError,
        signInWithGoogle,
        signInWithEmail,
        sendPasswordReset,
        updatePassword,
        signOutUser,
        reloadUserVerification,
        isLoginModalOpen,
        setIsLoginModalOpen,
        isPasswordRecovery,
        setIsPasswordRecovery,
        isAdmin: isAdminUser,
        isEmailVerified,
        activeRole,
        setActiveRole: handleSetActiveRole,
        hasRolePermission,
        hasAuthority,
        canAccessProject,
        assignedProjects,
        isPendingApproval,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
