import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { Modal } from '../../common/Modal';
import { Button } from '../../common/Button';
import { TeamMember, Project } from '../../../types';
import { AppRole } from '../../../types/rbac';
import { ALL_ROLES, ROLE_DEFINITIONS, hasGlobalProjectAccess } from '../../../lib/rbac';

interface TeamEditRoleModalProps {
  member: TeamMember | null;
  projects: Project[];
  editRoleForm: {
    role: AppRole;
    assignedProjects: string[];
  };
  setEditRoleForm: React.Dispatch<
    React.SetStateAction<{
      role: AppRole;
      assignedProjects: string[];
    }>
  >;
  onClose: () => void;
  onSave: (e: React.FormEvent) => void;
  currentUserDisplayName: string;
}

export const TeamEditRoleModal: React.FC<TeamEditRoleModalProps> = ({
  member,
  projects,
  editRoleForm,
  setEditRoleForm,
  onClose,
  onSave,
  currentUserDisplayName,
}) => {
  if (!member) return null;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`Ubah Peran & Penugasan — ${member.name}`}
      description={`NIP: ${member.nip}. Modifikasi ini akan diaudit dan berlaku segera.`}
      maxWidth="md"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Batal
          </Button>
          <Button variant="primary" size="sm" onClick={onSave}>
            Simpan Perubahan Hak Akses
          </Button>
        </>
      }
    >
      <form onSubmit={onSave} className="space-y-4 text-xs">
        <div>
          <label htmlFor="edit-role-select" className="block font-medium text-[#202B26] mb-1">
            Pilih Peran Struktural (Role Model) <span className="text-[#A82A20]">*</span>
          </label>
          <select
            id="edit-role-select"
            value={editRoleForm.role}
            onChange={(e) =>
              setEditRoleForm({ ...editRoleForm, role: e.target.value as AppRole })
            }
            className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26] focus:outline-none focus:border-[#12352B]"
          >
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {r} — {ROLE_DEFINITIONS[r]?.department}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-[#69766F] mt-1">
            {ROLE_DEFINITIONS[editRoleForm.role]?.description}
          </p>
        </div>

        <div>
          <label className="block font-medium text-[#202B26] mb-1">
            Penugasan Proyek Aktif
          </label>
          {hasGlobalProjectAccess(editRoleForm.role) ? (
            <div className="p-3 bg-[#E5F4EB] text-[#1C6843] rounded-lg border border-[#CDE9D7]">
              Peran <strong className="font-semibold">{editRoleForm.role}</strong> memiliki hak
              akses global ke seluruh proyek secara default (Owner / Auditor / Finance).
            </div>
          ) : (
            <div className="space-y-2 p-3 bg-[#FAFBFB] rounded-lg border border-[#E2E8E4] max-h-48 overflow-y-auto">
              {projects.map((proj) => {
                const isChecked = editRoleForm.assignedProjects.includes(proj.name);
                return (
                  <label
                    key={proj.id}
                    className="flex items-center gap-2 cursor-pointer hover:bg-white p-1 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setEditRoleForm({
                            ...editRoleForm,
                            assignedProjects: [...editRoleForm.assignedProjects, proj.name],
                          });
                        } else {
                          setEditRoleForm({
                            ...editRoleForm,
                            assignedProjects: editRoleForm.assignedProjects.filter(
                              (p) => p !== proj.name
                            ),
                          });
                        }
                      }}
                      className="rounded text-[#12352B] focus:ring-[#12352B]"
                    />
                    <span className="text-[#202B26] font-medium">{proj.name}</span>
                    <span className="text-[#69766F] text-[10px]">({proj.code})</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-3 bg-[#FFF8EC] border border-[#FCE6B1] rounded-lg text-[11px] text-[#9E6B05] flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Perubahan peran dicatat secara permanen pada Jejak Audit Korporat dengan identitas
            Anda ({currentUserDisplayName}).
          </span>
        </div>
      </form>
    </Modal>
  );
};
