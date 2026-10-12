import React from 'react';
import { ShieldCheck, Edit3, UserX, UserCheck } from 'lucide-react';
import { Button } from '../../common/Button';
import { Badge } from '../../common/Badge';
import { TeamMember } from '../../../types';
import { hasGlobalProjectAccess } from '../../../lib/rbac';

interface TeamMembersTableProps {
  filteredMembers: TeamMember[];
  canManageRoles: boolean;
  onSelectMember: (member: TeamMember) => void;
  onOpenEdit: (member: TeamMember) => void;
  onConfirmToggle: (member: TeamMember) => void;
}

export const TeamMembersTable: React.FC<TeamMembersTableProps> = ({
  filteredMembers,
  canManageRoles,
  onSelectMember,
  onOpenEdit,
  onConfirmToggle,
}) => {
  return (
    <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs overflow-hidden">
      <div className="p-4 border-b border-[#E2E8E4] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-[#202B26]">Direktori Keanggotaan & Penugasan Proyek</h2>
          <p className="text-xs text-[#69766F] mt-0.5">
            Pengguna nonaktif secara otomatis diblokir dari aksi tulis pada data operasional & finansial
          </p>
        </div>
        <span className="text-xs text-[#69766F] font-mono">
          Menampilkan {filteredMembers.length} personil
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#FAFBFB] text-[#69766F] border-b border-[#E2E8E4]">
              <th className="py-3 px-4 font-semibold">Nama & NIP</th>
              <th className="py-3 px-4 font-semibold">Peran Struktural</th>
              <th className="py-3 px-4 font-semibold hidden md:table-cell">Kontak Personil</th>
              <th className="py-3 px-4 font-semibold">Cakupan Penugasan</th>
              <th className="py-3 px-4 font-semibold">Status</th>
              <th className="py-3 px-4 font-semibold text-right">Aksi Manajemen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8E4]/70">
            {filteredMembers.map((member) => {
              const isDeactivated = member.status === 'Nonaktif';
              const isGlobal = hasGlobalProjectAccess(member.role);

              const statusVariant =
                member.status === 'Aktif'
                  ? 'success'
                  : member.status === 'Di Lapangan'
                  ? 'info'
                  : member.status === 'Nonaktif'
                  ? 'danger'
                  : 'neutral';

              return (
                <tr
                  key={member.id}
                  className={`transition-colors ${
                    isDeactivated
                      ? 'bg-[#FAFBFB]/70 opacity-70'
                      : 'hover:bg-[#F5F7F6]/80'
                  }`}
                >
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className="font-bold text-[#202B26] flex items-center gap-1.5">
                      <span>{member.name}</span>
                      {isDeactivated && (
                        <span className="text-[10px] bg-[#FCE8E6] text-[#A82A20] px-1 rounded font-normal">
                          Nonaktif
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#69766F] font-mono tabular-nums">
                      {member.nip} · {member.department}
                    </div>
                  </td>

                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <span className="font-semibold text-[#12352B] bg-[#EAEFEA] px-2 py-0.5 rounded text-[11px]">
                      {member.role}
                    </span>
                  </td>

                  <td className="py-3.5 px-4 hidden md:table-cell text-[#69766F]">
                    <div className="truncate max-w-[180px]">{member.email}</div>
                    <div className="text-[11px] font-mono tabular-nums">{member.phone}</div>
                  </td>

                  <td className="py-3.5 px-4 max-w-[220px]">
                    {isGlobal ? (
                      <div className="flex items-center gap-1 text-[11px] text-[#1C6843] font-semibold">
                        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                        <span>Akses Global (Seluruh Proyek)</span>
                      </div>
                    ) : (
                      <div>
                        <div className="truncate font-medium text-[#202B26]">
                          {(member.assignedProjects && member.assignedProjects[0]) ||
                            (member.assignedProjectIds && member.assignedProjectIds[0]) ||
                            'Belum ditugaskan'}
                        </div>
                        {(member.assignedProjects?.length || 0) > 1 && (
                          <div className="text-[10px] text-[#285744] font-semibold">
                            +{(member.assignedProjects?.length || 0) - 1} proyek lainnya
                          </div>
                        )}
                      </div>
                    )}
                  </td>

                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <Badge variant={statusVariant} size="sm" dot>
                      {member.status}
                    </Badge>
                  </td>

                  <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-1.5">
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={() => onSelectMember(member)}
                    >
                      Detail
                    </Button>

                    {canManageRoles && (
                      <>
                        <Button
                          variant="secondary"
                          size="xs"
                          leftIcon={<Edit3 className="w-3 h-3" />}
                          onClick={() => onOpenEdit(member)}
                        >
                          Ubah Peran
                        </Button>

                        <button
                          onClick={() => onConfirmToggle(member)}
                          className={`p-1.5 rounded border transition-colors cursor-pointer inline-flex items-center align-middle ${
                            isDeactivated
                              ? 'border-[#CDE9D7] bg-[#E5F4EB] text-[#1C6843] hover:bg-[#c3e8d2]'
                              : 'border-[#FAD899] bg-[#FEF6E7] text-[#9E6B05] hover:bg-[#faeacc]'
                          }`}
                          title={isDeactivated ? 'Aktifkan Akun' : 'Nonaktifkan Akun'}
                          aria-label={isDeactivated ? `Aktifkan akun ${member.name}` : `Nonaktifkan akun ${member.name}`}
                        >
                          {isDeactivated ? (
                            <UserCheck className="w-3.5 h-3.5" />
                          ) : (
                            <UserX className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
