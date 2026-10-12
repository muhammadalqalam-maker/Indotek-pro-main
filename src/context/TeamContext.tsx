/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Team Domain Context
 * Synchronizes team members and RBAC authority settings.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { TeamMember, AppRole } from '../types';
import { firestoreService } from '../services/firestoreService';
import { useAuth } from './AuthContext';
import { useUI } from './UIContext';

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
  const { workspaceId, actorInfo, currentScreen, addToast } = useUI();

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  const loadTeamData = async () => {
    try {
      const members = await firestoreService.getTeamMembers(false, workspaceId);
      if (members) setTeamMembers(members);
    } catch (err) {
      console.warn('Team data load notice:', err);
    }
  };

  // Initial load
  useEffect(() => {
    if (!currentUser) return;
    let isMounted = true;
    firestoreService.getTeamMembers(false, workspaceId).then((members) => {
      if (isMounted && members) setTeamMembers(members);
    }).catch(console.warn);
    return () => { isMounted = false; };
  }, [currentUser, workspaceId]);

  // Load on demand when team screen active
  useEffect(() => {
    if (!currentUser || currentScreen !== 'team') return;
    let isMounted = true;
    firestoreService.getTeamMembers(false, workspaceId).then((members) => {
      if (isMounted && members) setTeamMembers(members);
    }).catch(console.warn);
    return () => { isMounted = false; };
  }, [currentUser, currentScreen, workspaceId]);

  const updateTeamMemberRole = async (memberId: string, newRole: AppRole, assignedProjects: string[]) => {
    try {
      await firestoreService.updateTeamMember(memberId, {
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
      await firestoreService.updateTeamMember(memberId, { status: newStatus }, actorInfo, workspaceId);
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
    const id = `tm-${Date.now().toString(36)}`;
    const fullMember: TeamMember = {
      ...memberData,
      id,
      lastActive: new Date().toISOString(),
      permissions: {
        canViewBudget: true,
        canEditBudget: memberData.role.includes('Director') || memberData.role.includes('Estimator'),
        canApprovePO: memberData.role.includes('Director') || memberData.role.includes('Finance'),
        canCreateFieldReport: memberData.role.includes('Supervisor') || memberData.role.includes('Manager'),
      },
      assignedProjectIds: memberData.assignedProjectIds || ['*'],
      assignedProjects: memberData.assignedProjectIds || ['*'],
    };
    try {
      await firestoreService.addTeamMember(fullMember, actorInfo, workspaceId);
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
