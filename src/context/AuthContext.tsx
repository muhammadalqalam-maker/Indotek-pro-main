import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  GoogleAuthProvider
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
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
  currentUser: AppAuthUser | FirebaseUser | null;
  userProfile: UserProfile | null;
  isLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  reloadUserVerification: () => Promise<boolean>;
  isLoginModalOpen: boolean;
  setIsLoginModalOpen: (open: boolean) => void;
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
  const [currentUser, setCurrentUser] = useState<AppAuthUser | FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [activeRole, setActiveRole] = useState<AppRole>('Read-only Auditor');
  const [isPendingApproval, setIsPendingApproval] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);

  useEffect(() => {
    const handleAuthRequired = () => {
      setIsLoginModalOpen(true);
    };
    window.addEventListener('auth:required', handleAuthRequired);
    return () => window.removeEventListener('auth:required', handleAuthRequired);
  }, []);

  // 1. Supabase Auth Listener (Primary if Supabase is configured)
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    let isMounted = true;

    async function syncSupabaseUser(sessionUser: any) {
      if (!sessionUser) {
        if (isMounted) {
          setCurrentUser(null);
          setUserProfile(null);
          setActiveRole('Read-only Auditor');
          setIsAdminUser(false);
          setIsPendingApproval(false);
          setIsLoading(false);
        }
        return;
      }

      const email = sessionUser.email || '';
      const baseName =
        sessionUser.user_metadata?.full_name ||
        (email ? email.split('@')[0].toUpperCase() : 'Pengguna');

      const appUser: AppAuthUser = {
        uid: sessionUser.id,
        email,
        displayName: baseName,
        emailVerified: Boolean(sessionUser.email_confirmed_at),
        providerData: [{ providerId: sessionUser.app_metadata?.provider || 'supabase' }],
        getIdToken: async () => {
          const s = await supabase.auth.getSession();
          return s.data.session?.access_token || '';
        },
      };

      if (isMounted) {
        setCurrentUser(appUser);
      }

      // Query membership from Supabase Postgres
      try {
        const { data: members } = await supabase
          .from('workspace_members')
          .select('*, workspaces(*)')
          .eq('user_id', sessionUser.id);

        const member = members && members.length > 0 ? members[0] : null;

        if (member) {
          const dbRole = member.role as string;
          const mappedRole = DB_ROLE_TO_APP_ROLE[dbRole] || (dbRole as AppRole);
          const isAct = member.status === 'Aktif';

          // Query assigned project IDs if not all projects
          let assignedIds: string[] = ['*'];
          if (!member.all_projects && !['owner', 'finance', 'auditor'].includes(dbRole)) {
            const { data: pMembers } = await supabase
              .from('project_members')
              .select('project_id')
              .eq('workspace_id', member.workspace_id)
              .eq('user_id', sessionUser.id);
            assignedIds = pMembers?.map((p: any) => p.project_id) || [];
          }

          if (isMounted) {
            setUserProfile({
              uid: sessionUser.id,
              name: baseName,
              email,
              role: mappedRole,
              department: member.department || ROLE_DEFINITIONS[mappedRole]?.department || 'Operasional',
              nip: '-',
              workspaceId: member.workspace_id,
              assignedProjectIds: assignedIds,
              assignedProjects: assignedIds,
              status: isAct ? 'Aktif' : 'Nonaktif',
            });
            setActiveRole(mappedRole in ROLE_DEFINITIONS ? mappedRole : 'Read-only Auditor');
            setIsAdminUser(dbRole === 'owner');
            setIsPendingApproval(!isAct);
          }
        } else {
          // User exists in auth but no workspace membership yet
          if (isMounted) {
            setUserProfile({
              uid: sessionUser.id,
              name: baseName,
              email,
              role: 'Menunggu Undangan',
              department: 'Menunggu Undangan',
              nip: '-',
              workspaceId: 'indotek-jkt',
              assignedProjectIds: [],
              assignedProjects: [],
              status: 'Nonaktif',
            });
            setActiveRole('Read-only Auditor');
            setIsAdminUser(false);
            setIsPendingApproval(true);
          }
        }
      } catch (err) {
        console.warn('[Supabase Auth Sync Notice]:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    // Initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      syncSupabaseUser(session?.user);
    }).catch((err) => {
      console.warn('[Supabase Auth GetSession Notice]:', err);
      if (isMounted) setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      syncSupabaseUser(session?.user);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // 2. Firebase Auth Listener (Fallback if Supabase is not configured)
  useEffect(() => {
    if (isSupabaseConfigured()) return;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDocSnap = await getDoc(userDocRef);

          let baseName = user.displayName || (user.email ? user.email.split('@')[0].toUpperCase() : 'Pengguna Baru');

          if (!userDocSnap.exists()) {
            const newUserData = {
              uid: user.uid,
              name: baseName,
              email: user.email || '',
              status: 'Menunggu Undangan',
              role: 'Menunggu Undangan',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            try {
              await setDoc(userDocRef, newUserData);
            } catch (err) {
              console.warn('Initial user profile notice (expected if email unverified):', err);
            }
          } else {
            const data = userDocSnap.data();
            baseName = data.name || baseName;
          }

          const tokenResult = await user.getIdTokenResult(true);
          const memberDocRef = doc(db, 'workspaces', 'indotek-jkt', 'members', user.uid);
          const memberSnap = await getDoc(memberDocRef);

          let verifiedRole: AppRole = 'Read-only Auditor';
          let verifiedAdmin = false;

          if (memberSnap.exists()) {
            const mData = memberSnap.data();
            verifiedRole = (mData.role as AppRole) in ROLE_DEFINITIONS ? (mData.role as AppRole) : 'Read-only Auditor';
            const verifiedStatus = mData.status || 'Aktif';

            if (verifiedStatus !== 'Aktif') {
              setIsPendingApproval(true);
              setActiveRole('Read-only Auditor');
            } else {
              setIsPendingApproval(false);
              setActiveRole(verifiedRole);
            }

            if (tokenResult.claims?.admin === true || verifiedRole === 'Owner / Director') {
              verifiedAdmin = true;
            }

            setUserProfile({
              uid: user.uid,
              name: mData.name || baseName,
              email: user.email || '',
              role: verifiedRole,
              department: mData.department || 'Operasional',
              nip: mData.nip || '-',
              workspaceId: 'indotek-jkt',
              assignedProjectIds: mData.assignedProjectIds || ['*'],
              assignedProjects: mData.assignedProjectIds || ['*'],
              status: verifiedStatus === 'Aktif' ? 'Aktif' : 'Nonaktif',
            });
          } else {
            if (tokenResult.claims?.admin === true) {
              verifiedRole = 'Owner / Director';
              verifiedAdmin = true;
              setIsPendingApproval(false);
              setActiveRole(verifiedRole);
              setUserProfile({
                uid: user.uid,
                name: baseName,
                email: user.email || '',
                role: verifiedRole,
                department: 'Direksi & Eksekutif',
                nip: '-',
                workspaceId: 'indotek-jkt',
                assignedProjectIds: ['*'],
                assignedProjects: ['*'],
                status: 'Aktif',
              });
            } else {
              setIsPendingApproval(true);
              setActiveRole('Read-only Auditor');
              setUserProfile({
                uid: user.uid,
                name: baseName,
                email: user.email || '',
                role: 'Menunggu Undangan',
                department: 'Menunggu Verifikasi Admin',
                nip: '-',
                workspaceId: 'indotek-jkt',
                assignedProjectIds: [],
                assignedProjects: [],
                status: 'Nonaktif',
              });
            }
          }

          setIsAdminUser(verifiedAdmin);
        } catch (error) {
          console.error('Error fetching user profile:', error);
          setUserProfile(null);
          setActiveRole('Read-only Auditor');
          setIsPendingApproval(false);
        }
      } else {
        setUserProfile(null);
        setActiveRole('Read-only Auditor');
        setIsPendingApproval(false);
        setIsAdminUser(false);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    if (isSupabaseConfigured()) {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? `${window.location.origin}` : undefined,
        },
      });
      if (error) throw error;
      return;
    }
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      setIsLoginModalOpen(false);
    } catch (error: any) {
      if (error?.code !== 'auth/popup-closed-by-user') {
        console.error('Error signing in with Google:', error);
      }
      throw error;
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      if (isSupabaseConfigured()) {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        setIsLoginModalOpen(false);
        return;
      }
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setIsLoginModalOpen(false);
    } catch (error: any) {
      console.error('Error signing in with email:', error);
      throw error;
    }
  };

  const signUpWithEmail = async (
    email: string,
    password: string,
    name: string
  ) => {
    if (password.length < 12) {
      throw new Error('Kata sandi minimal 12 karakter untuk memenuhi standar keamanan enterprise.');
    }

    try {
      if (isSupabaseConfigured()) {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: name },
          },
        });
        if (error) throw error;
        setIsLoginModalOpen(false);
        return;
      }

      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const user = cred.user;

      try {
        await sendEmailVerification(user);
      } catch (e) {
        console.warn('Notice: Email verification trigger:', e);
      }

      const userProfileData = {
        uid: user.uid,
        name,
        email: user.email || email,
        status: 'Menunggu Undangan',
        role: 'Menunggu Undangan',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      try {
        await setDoc(doc(db, 'users', user.uid), userProfileData);
      } catch (e) {
        console.warn('User profile create notice:', e);
      }

      setUserProfile({
        ...userProfileData,
        role: 'Menunggu Undangan',
        department: 'Menunggu Verifikasi Admin',
        nip: '-',
        workspaceId: 'indotek-jkt',
        assignedProjectIds: [],
        assignedProjects: [],
        status: 'Nonaktif',
      });
      setActiveRole('Read-only Auditor');
      setIsPendingApproval(true);
      setIsLoginModalOpen(false);
    } catch (error: any) {
      console.error('Error registering with email:', error);
      throw error;
    }
  };

  const reloadUserVerification = async (): Promise<boolean> => {
    if (isSupabaseConfigured()) {
      const { data } = await supabase.auth.getUser();
      return Boolean(data.user?.email_confirmed_at);
    }
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    return Boolean(auth.currentUser.emailVerified);
  };

  const sendPasswordReset = async (email: string) => {
    try {
      if (isSupabaseConfigured()) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
        if (error) throw error;
        return;
      }
      await sendPasswordResetEmail(auth, email.trim());
    } catch (error: any) {
      console.error('Error sending password reset email:', error);
      throw error;
    }
  };

  const signOutUser = async () => {
    try {
      if (isSupabaseConfigured()) {
        await supabase.auth.signOut();
      } else {
        await signOut(auth);
      }
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
    } else {
      console.warn('Role switcher is disabled in production for non-administrative accounts.');
    }
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
      currentUser.providerData?.some((p: any) => p.providerId === 'google.com' || p.providerId === 'supabase')
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
        signUpWithEmail,
        sendPasswordReset,
        signOutUser,
        reloadUserVerification,
        isLoginModalOpen,
        setIsLoginModalOpen,
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
