import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
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
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(false);
  const [activeRole, setActiveRole] = useState<AppRole>('Read-only Auditor');
  const [isPendingApproval, setIsPendingApproval] = useState<boolean>(false);
  const [isAdminUser, setIsAdminUser] = useState<boolean>(false);

  const [supabaseSyncDone, setSupabaseSyncDone] = useState(false);

  // Prevent duplicate sync
  useEffect(() => {
    let ignore = false;
    setSupabaseSyncDone(true);
    return () => { ignore = true; };
  }, []);

  // Supabase auth listener
  useEffect(() => {
    if (!supabaseSyncDone) return;

    async function syncSupabaseUser(sessionUser: any) {
      if (!sessionUser) {
        setCurrentUser(null);
        setUserProfile(null);
        setActiveRole('Read-only Auditor');
        setIsPendingApproval(false);
        setIsAdminUser(false);
        setIsLoading(false);
        return;
      }

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

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', sessionUser.id)
        .maybeSingle();

      if (profileError) {
        console.error('Error fetching user profile (Supabase):', profileError);
        setUserProfile(null);
        setActiveRole('Read-only Auditor');
        setIsPendingApproval(false);
        setIsAdminUser(false);
        setIsLoading(false);
        return;
      }

      if (!profileData) {
        setUserProfile(null);
        setActiveRole('Read-only Auditor');
        setIsPendingApproval(false);
        setIsAdminUser(false);
        setIsLoading(false);
        return;
      }

      // Get user's workspace from workspace_members table
      const { data: memberData, error: memberError } = await supabase
        .from('workspace_members')
        .select('workspace_id, role, department, status')
        .eq('user_id', sessionUser.id)
        .maybeSingle();

      if (memberError) {
        console.error('Error fetching workspace membership (Supabase):', memberError);
        setUserProfile(null);
        setActiveRole('Read-only Auditor');
        setIsPendingApproval(false);
        setIsAdminUser(false);
        setIsLoading(false);
        return;
      }

      const profile: UserProfile = {
        uid: profileData.id,
        email: profileData.email || appUser.email || '',
        name: profileData.full_name || appUser.displayName || 'User',
        role: memberData?.role?.toLowerCase() || 'auditor',
        department: memberData?.department || '',
        nip: profileData.nip || '',
        workspaceId: memberData?.workspace_id || '',
        assignedProjectIds: [],
        status: memberData?.status || 'Aktif',
      };

      setUserProfile(profile);

      const appRole = DB_ROLE_TO_APP_ROLE[memberData?.role as keyof typeof DB_ROLE_TO_APP_ROLE] || 'Read-only Auditor';
      const approvalStatus = memberData?.status === 'Aktif' ? 'approved' : 'pending';

      if (approvalStatus === 'pending') {
        setIsPendingApproval(true);
        setActiveRole('Read-only Auditor');
        setIsAdminUser(false);
      } else {
        setIsPendingApproval(false);
        setActiveRole(appRole);
        setIsAdminUser(appRole === 'Owner / Director');
      }

      setIsLoading(false);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      syncSupabaseUser(session?.user || null);
    }).catch((err: any) => {
      console.error('Error getting session (Supabase):', err);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }
      syncSupabaseUser(session?.user || null);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [supabaseSyncDone]);

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
    try {
      const { data } = await supabase.auth.getUser();
      const verified = !!data.user?.email_confirmed_at;
      return verified;
    } catch (error: any) {
      console.error('Error reloading user verification (Supabase):', error);
      return false;
    }
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
      setIsPasswordRecovery(false);
    } catch (error: any) {
      console.error('Error updating password:', error);
      throw error;
    }
  };

  const signOutUser = async () => {
    try {
      await supabase.auth.signOut();
      setUserProfile(null);
      setCurrentUser(null);
      setActiveRole('Read-only Auditor');
      setIsPendingApproval(false);
      setIsAdminUser(false);
    } catch (error) {
      console.error('Error signing out:', error);
    }
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
      currentUser.providerData?.some((p: any) => p.providerId === 'google' || p.providerId === 'supabase')
    )
  );

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        isLoading,
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
