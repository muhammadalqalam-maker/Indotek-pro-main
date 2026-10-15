import React from 'react';
import { History, GitCompare } from 'lucide-react';
import { Badge } from '../../common/Badge';
import { EmptyState } from '../../common/EmptyState';
import { BudgetVersion, Project } from '../../../types';
import { formatCurrencyIDR, formatCompactIDR, formatPercent, formatDateIndo } from '../../../utils/formatters';

interface BudgetVersionsTabProps {
  currentProject: Project;
  budgetVersions: BudgetVersion[];
  compareVersionAId: string;
  setCompareVersionAId: (id: string) => void;
  compareVersionBId: string;
  setCompareVersionBId: (id: string) => void;
}

export const BudgetVersionsTab: React.FC<BudgetVersionsTabProps> = ({
  currentProject,
  budgetVersions,
  compareVersionAId,
  setCompareVersionAId,
  compareVersionBId,
  setCompareVersionBId,
}) => {
  const versionA = budgetVersions.find((v) => v.id === compareVersionAId);
  const versionB = budgetVersions.find((v) => v.id === compareVersionBId);

  return (
    <div className="space-y-6">
      {/* Version History Timeline Cards */}
      <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E2E8E4]">
          <div>
            <h2 className="text-sm font-bold text-[#202B26] flex items-center gap-2">
              <History className="w-4 h-4 text-[#12352B]" />
              <span>Riwayat Versi Anggaran (v0 Kontrak Induk & Addendum)</span>
            </h2>
            <p className="text-xs text-[#69766F] mt-0.5">
              Tersimpan di subkoleksi <span className="font-mono">workspaces/{currentProject.code}/projects/{currentProject.id}/budget_versions</span>
            </p>
          </div>
          <span className="px-2.5 py-1 rounded bg-[#EAEFEA] text-[#12352B] text-xs font-mono font-semibold">
            Total Versi: {budgetVersions.length}
          </span>
        </div>

        {budgetVersions.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="Belum Ada Snapshot Versi"
              description="Riwayat versi anggaran dibuat secara otomatis saat kontrak awal dibuat atau saat addendum revisi anggaran disetujui."
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
            {budgetVersions.map((ver) => (
              <div
                key={ver.id}
                className="p-4 rounded-xl border border-[#E2E8E4] bg-[#FAFBFB] relative hover:border-[#12352B]/40 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs font-bold text-[#12352B] px-2 py-0.5 bg-[#EAEFEA] rounded">
                    {ver.versionNumber}
                  </span>
                  <span className="text-xs font-mono text-[#69766F]">
                    {formatDateIndo(ver.effectiveDate || ver.createdAt || '')}
                  </span>
                </div>
                <div className="text-xs font-bold text-[#202B26] mb-1">
                  {formatCurrencyIDR(ver.totalPlannedAmount)}
                </div>
                <p className="text-xs text-[#69766F] line-clamp-2 mb-3">
                  {ver.description}
                </p>
                <div className="text-xs text-[#69766F] font-mono pt-2 border-t border-[#E2E8E4] flex justify-between items-center">
                  <span>Disahkan: {ver.approvedBy}</span>
                  {ver.revisionNumber && <span className="font-semibold text-[#12352B]">{ver.revisionNumber}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Side-by-Side Version Comparison (Sebelum vs Sesudah) */}
      {budgetVersions.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#E2E8E4]">
            <div>
              <h3 className="text-sm font-bold text-[#202B26] flex items-center gap-2">
                <GitCompare className="w-4 h-4 text-[#D6A85C]" />
                <span>Komparasi Sebelum vs Sesudah Addendum</span>
              </h3>
              <p className="text-xs text-[#69766F] mt-0.5">
                Pilih dua versi anggaran untuk meninjau perbedaan pagu per divisi pekerjaan
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs">
                <label htmlFor="select-version-a" className="text-[#69766F] font-medium">Versi A (Basis):</label>
                <select
                  id="select-version-a"
                  value={compareVersionAId}
                  onChange={(e) => setCompareVersionAId(e.target.value)}
                  className="h-8 bg-white border border-[#E2E8E4] rounded-lg px-2.5 text-xs font-semibold text-[#202B26]"
                >
                  {budgetVersions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.versionNumber} ({formatCompactIDR(v.totalPlannedAmount)})
                    </option>
                  ))}
                </select>
              </div>

              <span className="text-[#69766F] font-bold" aria-hidden="true">vs</span>

              <div className="flex items-center gap-1.5 text-xs">
                <label htmlFor="select-version-b" className="text-[#69766F] font-medium">Versi B (Revisi):</label>
                <select
                  id="select-version-b"
                  value={compareVersionBId}
                  onChange={(e) => setCompareVersionBId(e.target.value)}
                  className="h-8 bg-white border border-[#E2E8E4] rounded-lg px-2.5 text-xs font-semibold text-[#202B26]"
                >
                  {budgetVersions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.versionNumber} ({formatCompactIDR(v.totalPlannedAmount)})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {versionA && versionB ? (
            <div className="space-y-4 pt-4">
              {/* High Level Diff Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-[#FAFBFB] border border-[#E2E8E4]">
                <div>
                  <div className="text-xs text-[#69766F] font-medium">Total Pagu: {versionA.versionNumber}</div>
                  <div className="text-sm font-bold font-mono text-[#202B26] mt-0.5">
                    {formatCurrencyIDR(versionA.totalPlannedAmount)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#69766F] font-medium">Total Pagu: {versionB.versionNumber}</div>
                  <div className="text-sm font-bold font-mono text-[#202B26] mt-0.5">
                    {formatCurrencyIDR(versionB.totalPlannedAmount)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#69766F] font-medium">Selisih Addendum (+/-)</div>
                  <div
                    className={`text-sm font-bold font-mono mt-0.5 ${
                      versionB.totalPlannedAmount - versionA.totalPlannedAmount > 0
                        ? 'text-[#9E6B05]'
                        : versionB.totalPlannedAmount - versionA.totalPlannedAmount < 0
                        ? 'text-[#1C6843]'
                        : 'text-[#202B26]'
                    }`}
                  >
                    {versionB.totalPlannedAmount - versionA.totalPlannedAmount > 0 ? '+' : ''}
                    {formatCurrencyIDR(versionB.totalPlannedAmount - versionA.totalPlannedAmount)}
                    <span className="text-xs font-normal ml-1">
                      (
                      {formatPercent(
                        ((versionB.totalPlannedAmount - versionA.totalPlannedAmount) /
                          (versionA.totalPlannedAmount || 1)) *
                          100
                      )}
                      )
                    </span>
                  </div>
                </div>
              </div>

              {/* Division Breakdown Diff Table */}
              <div className="overflow-x-auto border border-[#E2E8E4] rounded-lg">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#FAFBFB] text-[#69766F] border-b border-[#E2E8E4]">
                      <th className="py-2.5 px-3 font-semibold">Divisi Pekerjaan</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Nilai {versionA.versionNumber}</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Nilai {versionB.versionNumber}</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Selisih (+/-)</th>
                      <th className="py-2.5 px-3 font-semibold text-center">Catatan Perubahan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8E4]/70">
                    {Array.from(
                      new Set([
                        ...Object.keys(versionA.divisionAmounts || {}),
                        ...Object.keys(versionB.divisionAmounts || {}),
                      ])
                    ).map((divName) => {
                      const valA = versionA.divisionAmounts?.[divName] || 0;
                      const valB = versionB.divisionAmounts?.[divName] || valA;
                      const diff = valB - valA;
                      return (
                        <tr key={divName} className="hover:bg-[#F5F7F6]/60">
                          <td className="py-3 px-3 font-semibold text-[#202B26]">{divName}</td>
                          <td className="py-3 px-3 font-mono tabular-nums text-right text-[#69766F]">
                            {valA > 0 ? formatCurrencyIDR(valA) : '—'}
                          </td>
                          <td className="py-3 px-3 font-mono tabular-nums text-right font-bold text-[#202B26]">
                            {valB > 0 ? formatCurrencyIDR(valB) : '—'}
                          </td>
                          <td
                            className={`py-3 px-3 font-mono tabular-nums text-right font-bold ${
                              diff > 0 ? 'text-[#9E6B05]' : diff < 0 ? 'text-[#1C6843]' : 'text-[#69766F]'
                            }`}
                          >
                            {diff > 0 ? '+' : ''}
                            {diff !== 0 ? formatCurrencyIDR(diff) : '0'}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {diff !== 0 ? (
                              <Badge variant={diff > 0 ? 'warning' : 'info'} size="sm">
                                {diff > 0 ? 'Penambahan Pagu' : 'Pengurangan Pagu'}
                              </Badge>
                            ) : (
                              <span className="text-xs text-[#4F5D56] font-mono">Tetap</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
