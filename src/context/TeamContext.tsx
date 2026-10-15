/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Team Domain Context
 * Synchronizes team members and RBAC authority settings.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { TeamMember } from '../types';
import { AppRole, APP_ROLE_TO_DB_ROLE } from '../types/rbac';
import { dataService, ActorInfo } from '../services/dataService';
import { useAuth } from './AuthContext';
import { useLocation } from 'react-router-dom';
import { useUI, getScreenIdFromPathname } from './UIContext';
import { supabase } from '../lib/supabase';

export interface TeamContextType {
  teamMembers: TeamMember[];
  setTeamMembers: React.Dispatch<React.SetStateAction<TeamMember[]>>;
  updateTeamMemberRole: (memberId: string, newRole: AppRole, assignedProjects: string[]) => Promise<void>;
  toggleTeamMemberStatus: (memberId: string) => Promise<void>;
  inviteTeamMember: (member: Omit<TeamMember, 'id' | 'lastActive' | 'permissions'>) => Promise<void>;
  loadTeamData: () => Promise<void>;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

export const TeamProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const { workspaceId, actorInfo, addToast, setLoadingTeam } = useUI();
  const location = useLocation();
  const screenId = getScreenIdFromPathname(location.pathname);

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  const loadTeamData = async () => {
    setLoadingTeam(true);
    try {
      const members = await dataService.getTeamMembers(workspaceId);
      if (members) setTeamMembers(members);
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Gagal Memuat Data Tim',
        message: err?.message || 'Terjadi kesalahan saat memuat data tim.',
      });
    } finally {
      setLoadingTeam(false);
    }
  };

  // Initial load
  useEffect(() => {
    if (!currentUser) return;
    let isMounted = true;
    setLoadingTeam(true);
    dataService.getTeamMembers(workspaceId)
      .then((members) => {
        if (isMounted && members) setTeamMembers(members);
      })
      .catch((err: any) => {
        addToast({
          type: 'danger',
          title: 'Gagal Memuat Tim',
          message: err?.message || 'Tidak dapat mengambil data tim.',
        });
      })
      .finally(() => {
        if (isMounted) setLoadingTeam(false);
      });
    return () => { isMounted = false; };
  }, [currentUser, workspaceId]);

  // Load on demand when team screen active
  useEffect(() => {
    if (!currentUser || screenId !== 'team') return;
    let isMounted = true;
    setLoadingTeam(true);
    dataService.getTeamMembers(workspaceId)
      .then((members) => {
        if (isMounted && members) setTeamMembers(members);
      })
      .catch((err: any) => {
        addToast({
          type: 'danger',
          title: 'Gagal Memuat Tim',
          message: err?.message || 'Tidak dapat mengambil data tim.',
        });
      })
      .finally(() => {
        if (isMounted) setLoadingTeam(false);
      });
    return () => { isMounted = false; };
  }, [currentUser, location.pathname, workspaceId]);

  const updateTeamMemberRole = async (memberId: string, newRole: AppRole, assignedProjects: string[]) => {
    try {
      await dataService.updateTeamMember(memberId, {
        role: newRole,
        assignedProjectIds: assignedProjects,
        assignedProjects,
      }, actorInfo, workspaceId);
      await loadTeamData();
      addToast({
        type: 'success',
        title: 'Peran Diperbarui',
        message: `Wewenang personil ${memberId} berhasil diperbarui menjadi ${newRole}.`,
      });
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Gagal Mengubah Peran',
        message: err?.message || 'Hanya Owner / Director yang berwenang mengubah peran.',
      });
      throw err;
    }
  };

  const toggleTeamMemberStatus = async (memberId: string) => {
    const member = teamMembers.find((m) => m.id === memberId);
    if (!member) return;
    const newStatus = member.status === 'Aktif' ? 'Nonaktif' : 'Aktif';
    try {
      await dataService.updateTeamMember(memberId, { status: newStatus }, actorInfo, workspaceId);
      await loadTeamData();
      addToast({
        type: 'info',
        title: 'Status Personil Diubah',
        message: `Status ${member.name} kini "${newStatus}".`,
      });
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Gagal Mengubah Status',
        message: err?.message || 'Kesalahan saat mengubah status.',
      });
      throw err;
    }
  };

  const inviteTeamMember = async (memberData: Omit<TeamMember, 'id' | 'lastActive' | 'permissions'>) => {
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) {
      throw new Error('Authentication required. User not logged in.');
    }
    
    try {
      const response = await fetch('/api/invite-member', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          workspaceId,
          email: memberData.email,
          role: APP_ROLE_TO_DB_ROLE[memberData.role as AppRole],
          department: memberData.department,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Invitation failed: ${response.statusText}`);
      }

      await loadTeamData();
      addToast({
        type: 'success',
        title: 'Undangan Dikirim',
        message: `Personil ${memberData.name} telah didaftarkan ke workspace.`,
      });
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Gagal Menambah Personil',
        message: err?.message || 'Kesalahan saat menambahkan anggota tim.',
      });
      throw err;
    }
  };

  return (
    <TeamContext.Provider
      value={{
        teamMembers,
        setTeamMembers,
        updateTeamMemberRole,
        toggleTeamMemberStatus,
        inviteTeamMember,
        loadTeamData,
      }}
    >
      {children}
    </TeamContext.Provider>
  );
};

export const useTeam = (): TeamContextType => {
  const context = useContext(TeamContext);
  if (!context) throw new Error('useTeam must be used within a TeamProvider');
  return context;
};
