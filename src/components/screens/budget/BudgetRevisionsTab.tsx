import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../common/Button';
import { Badge } from '../../common/Badge';
import { EmptyState } from '../../common/EmptyState';
import { BudgetRevision } from '../../../types';
import { formatCurrencyIDR, formatDateIndo } from '../../../utils/formatters';

interface BudgetRevisionsTabProps {
  projectRevisions: BudgetRevision[];
  hasAccessToProject: boolean;
  canApprove: boolean;
  approverName: string;
  onOpenNewRevision: () => void;
  onApproveRevision: (revId: string) => void;
  onRequestRejectRevision: (rev: BudgetRevision) => void;
}

export const BudgetRevisionsTab: React.FC<BudgetRevisionsTabProps> = ({
  projectRevisions,
  hasAccessToProject,
  canApprove,
  approverName,
  onOpenNewRevision,
  onApproveRevision,
  onRequestRejectRevision,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white rounded-xl border border-[#E2E8E4] shadow-2xs">
        <div>
          <h2 className="text-sm font-bold text-[#202B26]">Addendum & Revisi Pagu RAB</h2>
          <p className="text-xs text-[#69766F] mt-0.5">
            Persetujuan addendum akan otomatis menyesuaikan baris RAB dan mencatat riwayat versi baru di Firestore
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={onOpenNewRevision}
        >
          Ajukan Revisi Anggaran
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs overflow-hidden">
        {projectRevisions.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="Belum Ada Pengajuan Addendum"
              description="Belum ada riwayat pengajuan revisi anggaran untuk proyek ini."
              actionLabel={hasAccessToProject ? 'Ajukan Addendum Baru' : undefined}
              onAction={hasAccessToProject ? onOpenNewRevision : undefined}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#FAFBFB] text-[#69766F] border-b border-[#E2E8E4]">
                  <th className="py-3 px-4 font-semibold text-left">No. Addendum</th>
                  <th className="py-3 px-4 font-semibold text-left">Divisi & Judul Usulan</th>
                  <th className="py-3 px-4 font-semibold text-right">Pagu Semula</th>
                  <th className="py-3 px-4 font-semibold text-right">Usulan Pagu</th>
                  <th className="py-3 px-4 font-semibold text-right">Selisih (+/-)</th>
                  <th className="py-3 px-4 font-semibold text-left">Status</th>
                  <th className="py-3 px-4 font-semibold text-left">Pengaju</th>
                  <th className="py-3 px-4 font-semibold text-center">Otorisasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8E4]/70">
                {projectRevisions.map((rev) => {
                  const isPending = rev.status === 'Menunggu';

                  return (
                    <tr key={rev.id} className="hover:bg-[#F5F7F6]/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-[#12352B]">
                        {rev.revisionNumber}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[#202B26]">{rev.title}</div>
                        <div className="text-[11px] text-[#69766F] mt-0.5">
                          {rev.divisionName} · {rev.justification}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono tabular-nums text-right text-[#69766F]">
                        {formatCurrencyIDR(rev.originalAmount)}
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold tabular-nums text-right text-[#202B26]">
                        {formatCurrencyIDR(rev.proposedAmount)}
                      </td>

                      <td
                        className={`py-3.5 px-4 font-mono font-bold tabular-nums text-right ${
                          rev.varianceAmount > 0 ? 'text-[#9E6B05]' : 'text-[#1C6843]'
                        }`}
                      >
                        {rev.varianceAmount > 0 ? '+' : ''}
                        {formatCurrencyIDR(rev.varianceAmount)}
                      </td>

                      <td className="py-3.5 px-4">
                        <Badge
                          variant={
                            rev.status === 'Disetujui'
                              ? 'success'
                              : rev.status === 'Ditolak'
                              ? 'danger'
                              : 'warning'
                          }
                          size="sm"
                        >
                          {rev.status}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4 text-[#69766F]">
                        <div>{rev.submittedBy}</div>
                        <div className="text-[10px] font-mono text-[#4F5D56]">
                          {formatDateIndo(rev.submittedAt)}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        {isPending && canApprove ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => onApproveRevision(rev.id)}
                              className="px-2.5 py-1 text-[11px] font-semibold text-white bg-[#12352B] hover:bg-[#1C4D3F] rounded transition-colors cursor-pointer"
                            >
                              Setujui
                            </button>
                            <button
                              onClick={() => onRequestRejectRevision(rev)}
                              className="px-2.5 py-1 text-[11px] font-semibold text-[#A82A20] bg-white border border-[#A82A20]/30 hover:bg-[#FDEDEC] rounded transition-colors cursor-pointer"
                            >
                              Tolak
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-[#4F5D56] font-mono">
                            {rev.reviewedBy ? `Oleh ${rev.reviewedBy}` : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
