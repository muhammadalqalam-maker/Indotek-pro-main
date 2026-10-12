import React, { useState } from 'react';
import {
  Users2,
  UserPlus,
  ShieldCheck,
  CheckCircle2,
  KeyRound,
  Lock,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { MetricCard } from '../common/MetricCard';
import { Button } from '../common/Button';
import { SearchInput } from '../common/SearchInput';
import { Modal } from '../common/Modal';
import { TeamMember } from '../../types';
import { AppRole } from '../../types/rbac';
import { ALL_ROLES } from '../../lib/rbac';
import { TeamMembersTable } from './team/TeamMembersTable';
import { RbacMatrixView } from './team/RbacMatrixView';
import { TeamMemberDetailModal } from './team/TeamMemberDetailModal';
import { TeamEditRoleModal } from './team/TeamEditRoleModal';
import { TeamInviteModal } from './team/TeamInviteModal';

export const TeamScreen: React.FC = () => {
  const {
    teamMembers,
    projects,
    addToast,
    updateTeamMemberRole,
    toggleTeamMemberStatus,
    inviteTeamMember,
  } = useApp();

  const { activeRole, hasAuthority, userProfile, currentUser } = useAuth();

  const canManageRoles = hasAuthority('roleManagement') || activeRole === 'Owner / Director';

  const [activeTab, setActiveTab] = useState<'directory' | 'matrix'>('directory');
  const [search, setSearch] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('Semua');

  // Modal: View Member Detail
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);

  // Modal: Edit Role & Projects
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editRoleForm, setEditRoleForm] = useState<{
    role: AppRole;
    assignedProjects: string[];
  }>({
    role: 'Site Manager / Supervisor',
    assignedProjects: [],
  });

  // Modal: Deactivate / Activate Member Confirmation
  const [confirmToggleMember, setConfirmToggleMember] = useState<TeamMember | null>(null);

  // Modal: Invite Team Member
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<{
    name: string;
    email: string;
    nip: string;
    role: AppRole;
    department: string;
    phone: string;
    assignedProjects: string[];
  }>({
    name: '',
    email: '',
    nip: '',
    role: 'Site Manager / Supervisor',
    department: 'Operasional & Supervisi Lapangan',
    phone: '0812-9876-0000',
    assignedProjects: [projects[0]?.name || 'Menara Nusantara Office Tower'],
  });

  const filteredMembers = teamMembers.filter((m) => {
    const matchSearch =
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.role.toLowerCase().includes(search.toLowerCase()) ||
      m.department.toLowerCase().includes(search.toLowerCase()) ||
      m.nip.toLowerCase().includes(search.toLowerCase());

    const matchDept = filterDepartment === 'Semua' || m.department === filterDepartment;
    return matchSearch && matchDept;
  });

  const departments = Array.from(new Set(teamMembers.map((m) => m.department)));

  const handleOpenEdit = (member: TeamMember) => {
    setEditingMember(member);
    setEditRoleForm({
      role: (ALL_ROLES.includes(member.role as AppRole)
        ? member.role
        : 'Site Manager / Supervisor') as AppRole,
      assignedProjects: [...(member.assignedProjects || member.assignedProjectIds || [])],
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;

    if (!canManageRoles) {
      addToast({
        type: 'danger',
        message: 'Wewenang tidak mencukupi untuk memodifikasi peran personil.',
      });
      return;
    }

    try {
      await updateTeamMemberRole(
        editingMember.id,
        editRoleForm.role,
        editRoleForm.assignedProjects
      );
      setEditingMember(null);
    } catch {
      // Handled in context toast
    }
  };

  const handleConfirmToggleStatus = async () => {
    if (!confirmToggleMember) return;
    try {
      await toggleTeamMemberStatus(confirmToggleMember.id);
      setConfirmToggleMember(null);
    } catch {
      // Handled in context
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageRoles) {
      addToast({
        type: 'danger',
        message: 'Hanya Administrator yang dapat mendaftarkan personil baru.',
      });
      return;
    }

    try {
      await inviteTeamMember({
        name: inviteForm.name,
        email: inviteForm.email,
        nip: inviteForm.nip,
        role: inviteForm.role,
        department: inviteForm.department,
        phone: inviteForm.phone,
        status: 'Aktif',
        assignedProjects: inviteForm.assignedProjects,
        assignedProjectIds: inviteForm.assignedProjects,
      });

      setIsInviteModalOpen(false);
      setInviteForm({
        name: '',
        email: '',
        nip: '',
        role: 'Site Manager / Supervisor',
        department: 'Operasional & Supervisi Lapangan',
        phone: '0812-9876-0000',
        assignedProjects: [projects[0]?.name || 'Menara Nusantara Office Tower'],
      });
    } catch {
      // Handled in context
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E2E8E4]">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#69766F] mb-1">
            <span>Manajemen Sumber Daya & Tata Kelola</span>
            <span aria-hidden="true">·</span>
            <span>Hak Akses Peran (Role-Based Access Control)</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#202B26]">
            Tim Proyek & Matriks Tata Kelola (RBAC)
          </h1>
          <p className="text-xs text-[#69766F] mt-0.5">
            Manajemen keanggotaan terpercaya, pemetaan 8 peran struktural, dan pemisahan batas kewenangan proyek
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {canManageRoles ? (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<UserPlus className="w-4 h-4" />}
              onClick={() => setIsInviteModalOpen(true)}
            >
              Undang Anggota Tim
            </Button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFF8EC] border border-[#FCE6B1] rounded-lg text-xs text-[#9E6B05] font-medium">
              <Lock className="w-3.5 h-3.5" />
              <span>Mode Tinjauan (Read-only)</span>
            </div>
          )}
        </div>
      </div>

      {/* Security Banner */}
      <div className="bg-[#E5F4EB] border border-[#CDE9D7] rounded-xl p-4 flex items-start gap-3 text-xs text-[#1C6843]">
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-[#1C6843]" />
        <div className="space-y-0.5">
          <div className="font-semibold text-[#12352B]">
            Pemisahan Wewenang (Segregation of Duties) Aktif:
          </div>
          <p className="text-[#202B26]/80 leading-relaxed">
            Peran Anda saat ini: <strong className="text-[#12352B] underline">{activeRole}</strong>.
            {canManageRoles
              ? ' Anda memiliki wewenang administratif untuk mengelola peran, menugaskan proyek, serta mengaktivasi atau menonaktifkan akun anggota.'
              : ' Akses modifikasi wewenang dibatasi khusus Direksi dan Manajer Proyek. Perubahan status diaudit ke immutable audit log.'}
          </p>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Personil Terdaftar"
          value={`${teamMembers.length} Personil`}
          subtitle="Teknik, QS, HSE, Logistik & Finansial"
          icon={<Users2 className="w-4 h-4 text-[#12352B]" />}
        />
        <MetricCard
          label="Personil Aktif Bertugas"
          value={`${teamMembers.filter((m) => m.status !== 'Nonaktif').length} Orang`}
          subtitle="Memiliki hak akses operasional"
          trend={{ value: `${teamMembers.filter((m) => m.status === 'Nonaktif').length} Nonaktif`, isPositive: true }}
          icon={<CheckCircle2 className="w-4 h-4 text-[#1C6843]" />}
        />
        <MetricCard
          label="Pemegang Otoritas Approval"
          value="4 Peran Kunci"
          subtitle="Direksi, PM, QS & Keuangan"
          icon={<ShieldCheck className="w-4 h-4 text-[#285744]" />}
        />
        <MetricCard
          label="Jumlah Model Peran (RBAC)"
          value={`${ALL_ROLES.length} Peran Resmi`}
          subtitle="Pemisahan level korporat & site"
          trend={{ value: 'Standar ISO 19650', isPositive: true }}
          icon={<KeyRound className="w-4 h-4 text-[#1C6843]" />}
        />
      </div>

      {/* Segmented View Switch */}
      <div className="bg-white p-3 rounded-xl border border-[#E2E8E4] shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center p-1 bg-[#EAEFEA] rounded-lg gap-1" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'directory'}
            onClick={() => setActiveTab('directory')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
              activeTab === 'directory'
                ? 'bg-white text-[#12352B] shadow-2xs font-semibold'
                : 'text-[#4F5D56] hover:text-[#202B26]'
            }`}
          >
            Direktori Anggota Tim ({teamMembers.length})
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'matrix'}
            onClick={() => setActiveTab('matrix')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
              activeTab === 'matrix'
                ? 'bg-white text-[#12352B] shadow-2xs font-semibold'
                : 'text-[#4F5D56] hover:text-[#202B26]'
            }`}
          >
            Matriks Hak Akses & Kewenangan (8 Peran)
          </button>
        </div>

        {activeTab === 'directory' && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Cari nama, NIP, peran..."
              className="w-full sm:w-60"
            />
            <select
              aria-label="Filter Departemen"
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className="h-9 bg-white border border-[#E2E8E4] rounded-lg px-2.5 text-xs font-medium text-[#202B26] focus:outline-none focus:border-[#12352B] cursor-pointer"
            >
              <option value="Semua">Semua Departemen</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Tab 1: Member Directory Table */}
      {activeTab === 'directory' && (
        <TeamMembersTable
          filteredMembers={filteredMembers}
          canManageRoles={canManageRoles}
          onSelectMember={setSelectedMember}
          onOpenEdit={handleOpenEdit}
          onConfirmToggle={setConfirmToggleMember}
        />
      )}

      {/* Tab 2: RBAC Matrix */}
      {activeTab === 'matrix' && <RbacMatrixView />}

      {/* MODAL 1: Detail Personil */}
      <TeamMemberDetailModal
        member={selectedMember}
        onClose={() => setSelectedMember(null)}
      />

      {/* MODAL 2: Ubah Peran & Penugasan Personil */}
      <TeamEditRoleModal
        member={editingMember}
        projects={projects}
        editRoleForm={editRoleForm}
        setEditRoleForm={setEditRoleForm}
        onClose={() => setEditingMember(null)}
        onSave={handleSaveEdit}
        currentUserDisplayName={userProfile?.name || currentUser?.displayName || activeRole}
      />

      {/* MODAL 3: Konfirmasi Status */}
      {confirmToggleMember && (
        <Modal
          isOpen={true}
          onClose={() => setConfirmToggleMember(null)}
          title={`${confirmToggleMember.status === 'Nonaktif' ? 'Aktifkan Kembali' : 'Nonaktifkan'} Akun Personil`}
          description={`Personil: ${confirmToggleMember.name} (${confirmToggleMember.nip})`}
          maxWidth="sm"
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={() => setConfirmToggleMember(null)}>
                Batal
              </Button>
              <Button
                variant={confirmToggleMember.status === 'Nonaktif' ? 'primary' : 'danger'}
                size="sm"
                onClick={handleConfirmToggleStatus}
              >
                {confirmToggleMember.status === 'Nonaktif' ? 'Ya, Aktifkan Akun' : 'Ya, Nonaktifkan Akun'}
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-xs">
            <p className="text-[#202B26] leading-relaxed">
              {confirmToggleMember.status === 'Nonaktif' ? (
                <>
                  Apakah Anda yakin ingin mengaktifkan kembali akun{' '}
                  <strong>{confirmToggleMember.name}</strong>? Personil ini akan kembali mendapatkan
                  akses sesuai perannya ({confirmToggleMember.role}).
                </>
              ) : (
                <>
                  Apakah Anda yakin ingin menonaktifkan akun{' '}
                  <strong>{confirmToggleMember.name}</strong>? Personil ini akan langsung diblokir
                  dari aksi approval, pengajuan RAB, mutasi, dan verifikasi laporan.
                </>
              )}
            </p>
          </div>
        </Modal>
      )}

      {/* MODAL 4: Undang Personil Baru */}
      <TeamInviteModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        inviteForm={inviteForm}
        setInviteForm={setInviteForm}
        projects={projects}
        onSubmit={handleInviteSubmit}
      />
    </div>
  );
};
