import React from 'react';
import { Modal } from '../../common/Modal';
import { Button } from '../../common/Button';
import { Project } from '../../../types';
import { AppRole } from '../../../types/rbac';
import { ALL_ROLES, ROLE_DEFINITIONS, hasGlobalProjectAccess } from '../../../lib/rbac';

interface TeamInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  inviteForm: {
    name: string;
    email: string;
    nip: string;
    role: AppRole;
    department: string;
    phone: string;
    assignedProjects: string[];
  };
  setInviteForm: React.Dispatch<
    React.SetStateAction<{
      name: string;
      email: string;
      nip: string;
      role: AppRole;
      department: string;
      phone: string;
      assignedProjects: string[];
    }>
  >;
  projects: Project[];
  onSubmit: (e: React.FormEvent) => void;
}

export const TeamInviteModal: React.FC<TeamInviteModalProps> = ({
  isOpen,
  onClose,
  inviteForm,
  setInviteForm,
  projects,
  onSubmit,
}) => {
  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Undang Personil Baru ke Workspace"
      description="Tetapkan peran, nomor identitas pegawai (NIP), dan alokasi proyek awal."
      maxWidth="md"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Batal
          </Button>
          <Button variant="primary" size="sm" onClick={onSubmit}>
            Kirim Undangan & Terbitkan Akun
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-3.5 text-xs">
        <div>
          <label htmlFor="invite-name" className="block font-medium text-[#202B26] mb-1">
            Nama Lengkap & Gelar <span className="text-[#A82A20]">*</span>
          </label>
          <input
            id="invite-name"
            type="text"
            required
            value={inviteForm.name}
            onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
            placeholder="Contoh: Ir. Muhammad Rizky, S.T., IPM"
            className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="invite-email" className="block font-medium text-[#202B26] mb-1">
              Email Perusahaan <span className="text-[#A82A20]">*</span>
            </label>
            <input
              id="invite-email"
              type="email"
              required
              value={inviteForm.email}
              onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
              placeholder="rizky.site@indotekpro.id"
              className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
            />
          </div>

          <div>
            <label htmlFor="invite-nip" className="block font-medium text-[#202B26] mb-1">
              Nomor Induk Pegawai (NIP) <span className="text-[#A82A20]">*</span>
            </label>
            <input
              id="invite-nip"
              type="text"
              required
              value={inviteForm.nip}
              onChange={(e) => setInviteForm({ ...inviteForm, nip: e.target.value })}
              placeholder="IP-2026-SITE-088"
              className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg font-mono text-[#202B26]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="invite-role" className="block font-medium text-[#202B26] mb-1">
              Peran Struktural (RBAC) <span className="text-[#A82A20]">*</span>
            </label>
            <select
              id="invite-role"
              value={inviteForm.role}
              onChange={(e) => {
                const newRole = e.target.value as AppRole;
                setInviteForm({
                  ...inviteForm,
                  role: newRole,
                  department: ROLE_DEFINITIONS[newRole]?.department || inviteForm.department,
                });
              }}
              className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
            >
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="invite-dept" className="block font-medium text-[#202B26] mb-1">Departemen / Divisi</label>
            <input
              id="invite-dept"
              type="text"
              value={inviteForm.department}
              onChange={(e) => setInviteForm({ ...inviteForm, department: e.target.value })}
              className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
            />
          </div>
        </div>

        <div>
          <label htmlFor="invite-phone" className="block font-medium text-[#202B26] mb-1">Nomor Telepon Seluler</label>
          <input
            id="invite-phone"
            type="text"
            value={inviteForm.phone}
            onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })}
            className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg font-mono text-[#202B26]"
          />
        </div>

        <div>
          <label className="block font-medium text-[#202B26] mb-1">Alokasi Proyek Penugasan</label>
          {hasGlobalProjectAccess(inviteForm.role) ? (
            <div className="p-2.5 bg-[#E5F4EB] text-[#1C6843] rounded-lg border border-[#CDE9D7]">
              Peran ini memiliki akses portofolio ke seluruh proyek secara otomatis.
            </div>
          ) : (
            <div className="space-y-1.5 p-2.5 bg-[#FAFBFB] rounded-lg border border-[#E2E8E4] max-h-36 overflow-y-auto">
              {projects.map((proj) => {
                const isChecked = inviteForm.assignedProjects.includes(proj.name);
                return (
                  <label key={proj.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setInviteForm({
                            ...inviteForm,
                            assignedProjects: [...inviteForm.assignedProjects, proj.name],
                          });
                        } else {
                          setInviteForm({
                            ...inviteForm,
                            assignedProjects: inviteForm.assignedProjects.filter(
                              (p) => p !== proj.name
                            ),
                          });
                        }
                      }}
                      className="rounded text-[#12352B] focus:ring-[#12352B]"
                    />
                    <span className="text-[#202B26]">{proj.name}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
};
