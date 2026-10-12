import React from 'react';
import { FolderKanban, KeyRound } from 'lucide-react';
import { Modal } from '../../common/Modal';
import { Badge } from '../../common/Badge';
import { Button } from '../../common/Button';
import { TeamMember } from '../../../types';
import { AppRole } from '../../../types/rbac';
import { ALL_ROLES, ROLE_DEFINITIONS, hasGlobalProjectAccess } from '../../../lib/rbac';

interface TeamMemberDetailModalProps {
  member: TeamMember | null;
  onClose: () => void;
}

export const TeamMemberDetailModal: React.FC<TeamMemberDetailModalProps> = ({ member, onClose }) => {
  if (!member) return null;

  const rKey = (ALL_ROLES.includes(member.role as AppRole)
    ? member.role
    : 'Site Manager / Supervisor') as AppRole;
  const auths = ROLE_DEFINITIONS[rKey]?.approvalAuthorities;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`Profil Personil & Wewenang — ${member.name}`}
      description={`NIP: ${member.nip} · Departemen: ${member.department}`}
      maxWidth="md"
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Tutup
        </Button>
      }
    >
      <div className="space-y-4 text-xs">
        <div className="p-3.5 bg-[#FAFBFB] rounded-lg border border-[#E2E8E4] space-y-2">
          <div className="flex justify-between">
            <span className="text-[#69766F]">Peran Struktural:</span>
            <span className="font-bold text-[#12352B]">{member.role}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#69766F]">Email Korporat:</span>
            <span className="font-mono text-[#202B26]">{member.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#69766F]">Nomor Telepon:</span>
            <span className="font-mono text-[#202B26]">{member.phone}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#69766F]">Status Akun:</span>
            <Badge variant={member.status === 'Aktif' ? 'success' : 'neutral'} size="sm">
              {member.status}
            </Badge>
          </div>
        </div>

        <div>
          <h4 className="font-bold text-[#202B26] mb-2 flex items-center gap-1.5">
            <FolderKanban className="w-4 h-4 text-[#285744]" />
            <span>Proyek yang Ditugaskan:</span>
          </h4>
          <div className="p-2.5 bg-[#FAFBFB] rounded-lg border border-[#E2E8E4] space-y-1">
            {hasGlobalProjectAccess(member.role) ? (
              <p className="text-[#1C6843] font-medium">
                ✓ Akses portofolio penuh ke seluruh proyek PT Indotek Bangun Nusantara (Global Scope).
              </p>
            ) : (member.assignedProjects?.length || 0) > 0 ? (
              (member.assignedProjects || []).map((p, idx) => (
                <div key={idx} className="flex items-center gap-1.5 text-[#202B26]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#12352B]" />
                  <span>{p}</span>
                </div>
              ))
            ) : (
              <p className="text-[#69766F]">Belum ditugaskan ke proyek aktif.</p>
            )}
          </div>
        </div>

        <div>
          <h4 className="font-bold text-[#202B26] mb-2 flex items-center gap-1.5">
            <KeyRound className="w-4 h-4 text-[#9E6B05]" />
            <span>Wewenang Otoritas Sistem:</span>
          </h4>
          <div className="p-2.5 bg-[#FAFBFB] rounded-lg border border-[#E2E8E4] space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-[#69766F]">Approval Addendum Revisi RAB</span>
              <Badge variant={auths?.budgetRevision ? 'success' : 'neutral'} size="sm">
                {auths?.budgetRevision ? 'Berwenang' : 'Dibatasi'}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#69766F]">Approval Purchase Order (PO)</span>
              <Badge variant={auths?.purchaseOrder ? 'success' : 'neutral'} size="sm">
                {auths?.purchaseOrder ? 'Berwenang' : 'Dibatasi'}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#69766F]">Approval Opname / Koreksi Stok</span>
              <Badge variant={auths?.stockAdjustment ? 'success' : 'neutral'} size="sm">
                {auths?.stockAdjustment ? 'Berwenang' : 'Dibatasi'}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#69766F]">Verifikasi & Approval Laporan Site</span>
              <Badge variant={auths?.fieldReport ? 'success' : 'neutral'} size="sm">
                {auths?.fieldReport ? 'Berwenang' : 'Dibatasi'}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#69766F]">Sign-off BAST Milestone Proyek</span>
              <Badge variant={auths?.milestoneSignOff ? 'success' : 'neutral'} size="sm">
                {auths?.milestoneSignOff ? 'Berwenang' : 'Dibatasi'}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#69766F]">Manajemen Peran & Personil</span>
              <Badge variant={auths?.roleManagement ? 'success' : 'neutral'} size="sm">
                {auths?.roleManagement ? 'Berwenang' : 'Dibatasi'}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#69766F]">Pencairan & Approval Kas Kecil</span>
              <Badge variant={auths?.pettyCash ? 'success' : 'neutral'} size="sm">
                {auths?.pettyCash ? 'Berwenang' : 'Dibatasi'}
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
