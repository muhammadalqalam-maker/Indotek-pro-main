import React from 'react';
import { Plus, Edit2 } from 'lucide-react';
import { Button } from '../../common/Button';
import { Badge } from '../../common/Badge';
import { SearchInput } from '../../common/SearchInput';
import { ProgressBar } from '../../common/ProgressBar';
import { EmptyState } from '../../common/EmptyState';
import { BudgetLine, Project } from '../../../types';
import { formatCurrencyIDR, formatCompactIDR } from '../../../utils/formatters';

interface DivisionDistributionItem {
  title: string;
  planned: number;
  actual: number;
}

interface BudgetLinesTabProps {
  currentProject: Project;
  filteredLines: BudgetLine[];
  divisionDistribution: DivisionDistributionItem[];
  search: string;
  setSearch: (val: string) => void;
  selectedCategory: string;
  setSelectedCategory: (val: string) => void;
  canEditRAB: boolean;
  hasAccessToProject: boolean;
  onOpenAddLine: () => void;
  onOpenEditLine: (line: BudgetLine) => void;
}

export const BudgetLinesTab: React.FC<BudgetLinesTabProps> = ({
  currentProject,
  filteredLines,
  divisionDistribution,
  search,
  setSearch,
  selectedCategory,
  setSelectedCategory,
  canEditRAB,
  hasAccessToProject,
  onOpenAddLine,
  onOpenEditLine,
}) => {
  return (
    <div className="space-y-6">
      {/* Dynamic Division Breakdown Cards */}
      {divisionDistribution.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs p-5">
          <h2 className="text-sm font-bold text-[#202B26] mb-1">
            Distribusi Serapan Biaya per Divisi Pekerjaan
          </h2>
          <p className="text-xs text-[#69766F] mb-4">
            Dihitung terpusat dari subkoleksi baris RAB proyek di Firestore
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {divisionDistribution.map((cat, idx) => {
              const pct = cat.planned > 0 ? (cat.actual / cat.planned) * 100 : 0;
              return (
                <div key={idx} className="p-3.5 rounded-lg border border-[#E2E8E4] bg-[#FAFBFB]">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-semibold text-xs text-[#202B26]">{cat.title}</span>
                    <span className="text-[11px] font-mono font-bold text-[#202B26] tabular-nums">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                  <ProgressBar value={pct} size="sm" variant={pct > 85 ? 'warning' : 'primary'} />
                  <div className="flex justify-between items-center text-[11px] text-[#69766F] mt-2 font-mono tabular-nums">
                    <span>Real: {formatCompactIDR(cat.actual)}</span>
                    <span>RAB: {formatCompactIDR(cat.planned)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* BOQ / RAB Line Item Detail Table */}
      <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[#E2E8E4] flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[#202B26]">Rincian Item Pekerjaan RAB / BOQ</h2>
            <p className="text-xs text-[#69766F] mt-0.5">
              Subkoleksi Firestore: <span className="font-mono">workspaces/{currentProject.code}/projects/{currentProject.id}/budget_lines</span>
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Cari uraian atau divisi..."
              className="w-full sm:w-56"
            />

            <select
              aria-label="Filter Kategori RAB"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="h-9 bg-white border border-[#E2E8E4] rounded-lg px-3 text-xs font-medium text-[#202B26] hover:border-[#CBD5CF] focus:outline-none focus:border-[#12352B] focus:ring-1 focus:ring-[#12352B] transition-colors cursor-pointer"
            >
              <option value="Semua">Semua Kategori</option>
              <option value="Pekerjaan Persiapan">Pekerjaan Persiapan</option>
              <option value="Pekerjaan Struktur">Pekerjaan Struktur</option>
              <option value="Pekerjaan Arsitektur">Pekerjaan Arsitektur</option>
              <option value="Pekerjaan MEP">Pekerjaan MEP</option>
              <option value="Manajemen & Overhead">Manajemen & Overhead</option>
            </select>

            {canEditRAB && hasAccessToProject && (
              <Button
                variant="primary"
                size="sm"
                onClick={onOpenAddLine}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Tambah Pos RAB
              </Button>
            )}
          </div>
        </div>

        {filteredLines.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="Belum Ada Item RAB"
              description="Subkoleksi proyek ini belum memiliki rincian pos anggaran RAB. Tambahkan pos pertama Anda."
              actionLabel={canEditRAB ? 'Tambah Pos RAB Baru' : undefined}
              onAction={canEditRAB ? onOpenAddLine : undefined}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#FAFBFB] text-[#69766F] border-b border-[#E2E8E4]">
                  <th className="py-3 px-4 font-semibold text-left">Kode</th>
                  <th className="py-3 px-4 font-semibold text-left">Uraian Divisi & Volume</th>
                  <th className="py-3 px-4 font-semibold text-left">Kategori</th>
                  <th className="py-3 px-4 font-semibold text-right">Pagu RAB (IDR)</th>
                  <th className="py-3 px-4 font-semibold text-right">Realisasi (IDR)</th>
                  <th className="py-3 px-4 font-semibold text-right">Sisa Pagu (IDR)</th>
                  <th className="py-3 px-4 font-semibold text-left">Status</th>
                  {canEditRAB && hasAccessToProject && (
                    <th className="py-3 px-4 font-semibold text-center">Aksi</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8E4]/70">
                {filteredLines.map((line) => {
                  const isWarning = line.status === 'Peringatan' || line.status === 'Overbudget';
                  return (
                    <tr key={line.id} className="hover:bg-[#F5F7F6]/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-[#12352B]">
                        {line.code}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[#202B26] leading-snug">
                          {line.divisionName}
                        </div>
                        <div className="text-[11px] text-[#69766F] font-mono mt-0.5 tabular-nums">
                          Volume: {(line.volume || 1).toLocaleString('id-ID')} {line.unit} · Harga Satuan: {formatCurrencyIDR(line.unitRate || line.plannedAmount)}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-[#69766F] whitespace-nowrap">
                        {line.category}
                      </td>

                      <td className="py-3.5 px-4 font-mono font-medium text-[#202B26] tabular-nums whitespace-nowrap text-right">
                        {formatCurrencyIDR(line.plannedAmount)}
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-[#202B26] tabular-nums whitespace-nowrap text-right">
                        {formatCurrencyIDR(line.actualAmount)}
                      </td>

                      <td className={`py-3.5 px-4 font-mono tabular-nums whitespace-nowrap text-right ${line.varianceAmount < 0 ? 'text-[#A82A20] font-bold' : 'text-[#1C6843]'}`}>
                        {formatCurrencyIDR(line.varianceAmount)}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <Badge variant={isWarning ? 'warning' : 'success'} size="sm">
                          {line.status}
                        </Badge>
                      </td>

                      {canEditRAB && hasAccessToProject && (
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <button
                            onClick={() => onOpenEditLine(line)}
                            className="px-2.5 py-1 text-[11px] font-medium text-[#12352B] bg-[#F1F4F2] hover:bg-[#EAEFEA] rounded border border-[#E2E8E4] transition-colors cursor-pointer inline-flex items-center gap-1"
                            aria-label={`Ubah pos ${line.code}`}
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Ubah</span>
                          </button>
                        </td>
                      )}
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
