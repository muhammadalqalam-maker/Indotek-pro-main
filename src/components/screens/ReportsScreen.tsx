import React, { useState } from 'react';
import { BarChart3, Download, TrendingUp, Coins, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { MetricCard } from '../common/MetricCard';
import { Button } from '../common/Button';
import { DataCard } from '../common/DataCard';
import { ResponsiveTable } from '../common/ResponsiveTable';
import {
  formatCompactIDR,
  formatPercent,
  getWitaDateISO,
  formatDateWITA,
} from '../../utils/formatters';
import {
  exportExecutiveReportToCSV,
  exportMaterialsToCSV
} from '../../utils/exportUtils';

export const ReportsScreen: React.FC = () => {
  const { projects, materials, addToast } = useApp();

  const [reportType, setReportType] = useState('weekly_progress');
  const [targetProject, setTargetProject] = useState('all');
  const [isExporting, setIsExporting] = useState(false);
  const totalApprovedBudget = projects.reduce((total, project) => total + project.approvedBudget, 0);
  const totalActualCost = projects.reduce((total, project) => total + project.actualCost, 0);
  const totalEarnedValue = projects.reduce(
    (total, project) => total + project.approvedBudget * project.progressActual / 100,
    0
  );
  const totalPlannedValue = projects.reduce(
    (total, project) => total + project.approvedBudget * project.progressPlanned / 100,
    0
  );
  const portfolioSPI = totalPlannedValue > 0 ? totalEarnedValue / totalPlannedValue : null;
  const portfolioCPI = totalActualCost > 0 ? totalEarnedValue / totalActualCost : null;
  const budgetUtilization = totalApprovedBudget > 0 ? totalActualCost / totalApprovedBudget * 100 : null;
  const snapshotDate = getWitaDateISO();

  const handleExport = (e: React.FormEvent) => {
    e.preventDefault();
    setIsExporting(true);

    try {
      const filteredProjects =
        targetProject === 'all'
          ? projects
          : projects.filter((p) => p.id === targetProject);

      const typeLabel =
        reportType === 'weekly_progress'
          ? 'Laporan_Progres_Portofolio'
          : reportType === 'cost_control'
          ? 'Laporan_Evaluasi_RAB'
          : 'Rekap_Logistik_Material';

      if (reportType === 'materials') {
        exportMaterialsToCSV(materials);
      } else {
        exportExecutiveReportToCSV(filteredProjects, `${typeLabel}_${snapshotDate}`);
      }

      addToast({
        type: 'success',
        title: 'Laporan Berhasil Diunduh',
        message: 'Berkas laporan CSV berhasil dibuat dan diunduh ke perangkat Anda.',
      });
    } catch (err) {
      addToast({
        type: 'danger',
        title: 'Gagal Menghasilkan Laporan',
        message: 'Terjadi kendala teknis saat menyusun berkas laporan.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E2E8E4]">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#69766F] mb-1">
            <span>Analitika & Pelaporan</span>
            <span aria-hidden="true">·</span>
            <span>Laporan Berkala Direksi & Konsultan</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#202B26]">
            Laporan Eksekutif & Analitika Proyek
          </h1>
          <p className="text-xs text-[#69766F] mt-0.5">
            Ringkasan progres dan anggaran berdasarkan data portofolio yang tersimpan
          </p>
        </div>
      </div>

      {/* KPI Performance Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="SPI (Schedule Performance Index)"
          value={portfolioSPI === null ? '—' : portfolioSPI.toFixed(2)}
          subtitle={portfolioSPI === null ? 'Data progres rencana belum tersedia' : 'EV / PV portofolio'}
          trend={portfolioSPI === null ? undefined : {
            value: portfolioSPI >= 1 ? 'Sesuai rencana' : 'Di bawah rencana',
            isPositive: portfolioSPI >= 1,
          }}
          icon={<TrendingUp className="w-4 h-4 text-[#1C6843]" />}
        />
        <MetricCard
          label="CPI (Cost Performance Index)"
          value={portfolioCPI === null ? '—' : portfolioCPI.toFixed(2)}
          subtitle={portfolioCPI === null ? 'Data realisasi biaya belum tersedia' : 'EV / AC portofolio'}
          trend={portfolioCPI === null ? undefined : {
            value: portfolioCPI >= 1 ? 'Efisien' : 'Perlu perhatian',
            isPositive: portfolioCPI >= 1,
          }}
          icon={<Coins className="w-4 h-4 text-[#285744]" />}
        />
        <MetricCard
          label="Tingkat Serapan Anggaran"
          value={budgetUtilization === null ? '—' : formatPercent(budgetUtilization)}
          subtitle={budgetUtilization === null
            ? 'Nilai pagu RAB belum tersedia'
            : `${formatCompactIDR(totalActualCost)} dari ${formatCompactIDR(totalApprovedBudget)}`}
          icon={<BarChart3 className="w-4 h-4 text-[#12352B]" />}
        />
        <MetricCard
          label="Data Keselamatan Kerja (K3)"
          value="—"
          subtitle="Belum tersedia pada sumber data proyek"
          icon={<ShieldCheck className="w-4 h-4 text-[#1C6843]" />}
        />
      </div>

      {/* 2-Column Split: Export Generator on Left + Summary Table on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Export Form Generator */}
        <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs p-5">
          <div className="flex items-center gap-2 font-bold text-sm text-[#202B26] mb-1">
            <Download className="w-4 h-4 text-[#12352B]" />
            <span>Pusat Ekspor Laporan</span>
          </div>
          <p className="text-xs text-[#69766F] mb-4">
            Ekspor CSV snapshot progres, anggaran, atau material dari data yang tersimpan
          </p>

          <form onSubmit={handleExport} className="space-y-4 text-xs">
            <div>
              <label className="block font-medium text-[#202B26] mb-1">Jenis Laporan</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
              >
                <option value="weekly_progress">Snapshot Progres Portofolio</option>
                <option value="cost_control">Laporan Evaluasi Anggaran & RAB (Cost Control)</option>
                <option value="materials">Laporan Logistik & Mutasi Material</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-[#202B26] mb-1">Lingkup Proyek</label>
              <select
                value={targetProject}
                onChange={(e) => setTargetProject(e.target.value)}
                className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
              >
                <option value="all">Seluruh Portofolio (Konsolidasi)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="block font-medium text-[#202B26] mb-1">Tanggal Snapshot (WITA)</span>
              <p className="rounded-lg border border-[#E2E8E4] bg-[#FAFBFB] p-2 text-[#69766F]">
                {formatDateWITA()}
              </p>
            </div>

            <Button
              variant="primary"
              size="md"
              type="submit"
              isLoading={isExporting}
              leftIcon={<Download className="w-4 h-4" />}
              className="w-full mt-2"
            >
              Generate & Unduh Laporan
            </Button>
          </form>
        </div>

        {/* Right 2-Span: Performance Metric Comparison Table */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-[#E2E8E4] shadow-2xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-5 border-b border-[#E2E8E4]">
              <h2 className="text-sm font-bold text-[#202B26]">
                Matriks Kinerja Multi-Proyek Terkonsolidasi
              </h2>
              <p className="text-xs text-[#69766F] mt-0.5">
                Perbandingan progres dan efisiensi biaya; data keselamatan belum tersedia
              </p>
            </div>

            <ResponsiveTable
              data={projects.slice(0, 5)}
              renderTable={() => (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#FAFBFB] text-[#69766F] border-b border-[#E2E8E4]">
                        <th className="py-2.5 px-4 font-semibold text-left">Nama Proyek</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Progres Aktual</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Deviasi Jadwal</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Utilisasi RAB</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Indeks Biaya (CPI)</th>
                        <th className="py-2.5 px-4 font-semibold text-left">Status HSE</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8E4]/70">
                      {projects.slice(0, 5).map((p) => {
                        const dev = p.progressActual - p.progressPlanned;
                        const isPositive = dev >= 0;
                        const earnedValue = p.approvedBudget * p.progressActual / 100;
                        const cpiVal = p.actualCost > 0 ? earnedValue / p.actualCost : null;

                        return (
                          <tr key={p.id} className="hover:bg-[#F5F7F6]/80 transition-colors">
                            <td className="py-3 px-4">
                              <div className="font-semibold text-[#202B26] leading-snug">{p.name}</div>
                              <div className="text-xs text-[#69766F] font-mono tabular-nums">{p.code}</div>
                            </td>

                            <td className="py-3 px-4 font-mono font-bold text-[#202B26] tabular-nums text-right">
                              {formatPercent(p.progressActual)}
                            </td>

                            <td className="py-3 px-4 font-mono font-medium tabular-nums whitespace-nowrap text-right">
                              <span className={isPositive ? 'text-[#1C6843]' : 'text-[#A82A20]'}>
                                {isPositive ? '+' : ''}
                                {dev.toFixed(1)}%
                              </span>
                            </td>

                            <td className="py-3 px-4 font-mono tabular-nums text-[#202B26] text-right">
                              {p.approvedBudget > 0 ? formatPercent((p.actualCost / p.approvedBudget) * 100) : '—'}
                            </td>

                            <td className="py-3 px-4 font-mono font-medium text-[#202B26] tabular-nums text-right">
                              {cpiVal === null ? '—' : `${cpiVal.toFixed(2)} (${cpiVal >= 1 ? 'Efisien' : 'Perlu perhatian'})`}
                            </td>

                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className="text-[#69766F]">Belum tersedia</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              renderCard={(p) => {
                const dev = p.progressActual - p.progressPlanned;
                const isPositive = dev >= 0;
                const earnedValue = p.approvedBudget * p.progressActual / 100;
                const cpiVal = p.actualCost > 0 ? earnedValue / p.actualCost : null;
                
                return (
                  <DataCard
                    title={p.name}
                    subtitle={p.code}
                    metadata={[
                      { label: 'Progres Aktual', value: formatPercent(p.progressActual), highlight: true },
                      {
                        label: 'Deviasi Jadwal',
                        value: (
                          <span className={isPositive ? 'text-[#1C6843]' : 'text-[#A82A20]'}>
                            {isPositive ? '+' : ''}{dev.toFixed(1)}%
                          </span>
                        ),
                      },
                      { label: 'Utilisasi RAB', value: p.approvedBudget > 0 ? formatPercent((p.actualCost / p.approvedBudget) * 100) : '—' },
                      { label: 'Indeks Biaya (CPI)', value: cpiVal === null ? '—' : `${cpiVal.toFixed(2)} (${cpiVal >= 1 ? 'Efisien' : 'Perlu perhatian'})` },
                      { label: 'Status HSE', value: 'Belum tersedia' },
                    ]}
                  />
                );
              }}
            />
            {projects.length === 0 && (
              <p className="py-8 text-center text-xs text-[#69766F]">
                Belum ada data proyek untuk ditampilkan.
              </p>
            )}
          </div>

          <div className="p-4 bg-[#FAFBFB] border-t border-[#E2E8E4] flex items-center justify-between text-xs text-[#69766F]">
            <span>Indikator EVM dihitung dari anggaran dan progres proyek</span>
            <span className="font-mono">Snapshot: {snapshotDate} · Supabase</span>
          </div>
        </div>
      </div>
    </div>
  );
};
