import React, { useState } from 'react';
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  FileText,
  Calendar,
  TrendingUp,
  Coins,
  Boxes,
  ShieldCheck,
  CheckCircle2,
  Filter
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { MetricCard } from '../common/MetricCard';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import {
  formatCurrencyIDR,
  formatCompactIDR,
  formatPercent
} from '../../utils/formatters';
import {
  exportExecutiveReportToCSV,
  exportMaterialsToCSV,
  downloadDocumentTemplate
} from '../../utils/exportUtils';

export const ReportsScreen: React.FC = () => {
  const { projects, materials, addToast } = useApp();

  const [reportType, setReportType] = useState('weekly_progress');
  const [targetProject, setTargetProject] = useState('all');
  const [exportFormat, setExportFormat] = useState('pdf');
  const [periodRange, setPeriodRange] = useState('oktober_2026');
  const [isExporting, setIsExporting] = useState(false);

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
          ? 'Laporan_Progres_Mingguan'
          : reportType === 'cost_control'
          ? 'Laporan_Evaluasi_RAB'
          : reportType === 'materials'
          ? 'Rekap_Logistik_Material'
          : 'Laporan_K3_HSE';

      if (reportType === 'materials') {
        exportMaterialsToCSV(materials);
      } else if (reportType === 'hse') {
        const projName = filteredProjects[0]?.name || 'Portofolio Seluruh Proyek';
        downloadDocumentTemplate(`Laporan_Audit_K3_HSE_${periodRange}`, projName);
      } else {
        exportExecutiveReportToCSV(filteredProjects, `${typeLabel}_${periodRange}`);
      }

      addToast({
        type: 'success',
        title: 'Laporan Berhasil Diunduh',
        message: `Berkas ${typeLabel}_${periodRange}.${exportFormat === 'excel' ? 'csv' : 'csv'} berhasil dibuat dan diunduh ke perangkat Anda.`,
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
            Kompilasi otomatis capaian fisik, deviasi kurva-s, efisiensi anggaran, dan rasio K3
          </p>
        </div>
      </div>

      {/* KPI Performance Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="SPI (Schedule Performance Index)"
          value="1.01"
          subtitle="Rasio kecepatan pelaksanaan"
          trend={{ value: 'Tepat Waktu', isPositive: true }}
          icon={<TrendingUp className="w-4 h-4 text-[#1C6843]" />}
        />
        <MetricCard
          label="CPI (Cost Performance Index)"
          value="1.02"
          subtitle="Efisiensi pemakaian biaya"
          trend={{ value: 'Hemat 2,0%', isPositive: true }}
          icon={<Coins className="w-4 h-4 text-[#285744]" />}
        />
        <MetricCard
          label="Tingkat Serapan Anggaran"
          value="60,6%"
          subtitle="Rp 186,3 M dari total pagu"
          trend={{ value: 'Sesuai Termin', isPositive: true }}
          icon={<BarChart3 className="w-4 h-4 text-[#12352B]" />}
        />
        <MetricCard
          label="Safety Compliance (K3)"
          value="99,4%"
          subtitle="Audit Kemenaker Q3 2026"
          trend={{ value: 'Sangat Baik', isPositive: true }}
          icon={<ShieldCheck className="w-4 h-4 text-[#1C6843]" />}
        />
      </div>

      {/* 2-Column Split: Export Generator on Left + Summary Table on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Export Form Generator */}
        <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs p-5">
          <div className="flex items-center gap-2 font-bold text-sm text-[#202B26] mb-1">
            <Download className="w-4 h-4 text-[#12352B]" />
            <span>Pusat Unduh & Cetak Laporan</span>
          </div>
          <p className="text-xs text-[#69766F] mb-4">
            Ekspor komprehensif siap presentasi untuk owner dan konsultan manajemen konstruksi
          </p>

          <form onSubmit={handleExport} className="space-y-4 text-xs">
            <div>
              <label className="block font-medium text-[#202B26] mb-1">Jenis Laporan</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
              >
                <option value="weekly_progress">Laporan Progres Mingguan (Weekly Report)</option>
                <option value="cost_control">Laporan Evaluasi Anggaran & RAB (Cost Control)</option>
                <option value="materials">Laporan Logistik & Mutasi Material</option>
                <option value="hse">Laporan K3 & Keselamatan Kerja (HSE)</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-[#202B26] mb-1">Lingkup Proyek</label>
              <select
                value={targetProject}
                onChange={(e) => setTargetProject(e.target.value)}
                className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
              >
                <option value="all">Seluruh Portofolio Aktif (Konsolidasi)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-[#202B26] mb-1">Periode Waktu</label>
              <select
                value={periodRange}
                onChange={(e) => setPeriodRange(e.target.value)}
                className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
              >
                <option value="minggu_ini">Minggu Ini (3 - 9 Okt 2026)</option>
                <option value="oktober_2026">Bulan Berjalan (Oktober 2026)</option>
                <option value="q3_2026">Kuartal III 2026</option>
                <option value="ytd_2026">Tahun Berjalan (Year to Date 2026)</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-[#202B26] mb-1">Format Berkas</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setExportFormat('pdf')}
                  className={`p-2.5 rounded-lg border text-left flex items-center gap-2 transition-all ${
                    exportFormat === 'pdf'
                      ? 'border-[#12352B] bg-[#EAEFEA] text-[#12352B] font-semibold'
                      : 'border-[#E2E8E4] hover:bg-[#F5F7F6] text-[#202B26]'
                  }`}
                >
                  <FileText className="w-4 h-4 text-[#A82A20]" />
                  <span>PDF Eksekutif</span>
                </button>

                <button
                  type="button"
                  onClick={() => setExportFormat('xlsx')}
                  className={`p-2.5 rounded-lg border text-left flex items-center gap-2 transition-all ${
                    exportFormat === 'xlsx'
                      ? 'border-[#12352B] bg-[#EAEFEA] text-[#12352B] font-semibold'
                      : 'border-[#E2E8E4] hover:bg-[#F5F7F6] text-[#202B26]'
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4 text-[#1C6843]" />
                  <span>Excel (XLSX)</span>
                </button>
              </div>
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
                Perbandingan deviasi progres, efisiensi biaya, dan status keselamatan per proyek
              </p>
            </div>

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
                    const cpiVal = (p.approvedBudget * (p.progressActual / 100)) / (p.actualCost || 1);

                    return (
                      <tr key={p.id} className="hover:bg-[#F5F7F6]/80 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#202B26] leading-snug">{p.name}</div>
                          <div className="text-[11px] text-[#69766F] font-mono tabular-nums">{p.code}</div>
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
                          {formatPercent((p.actualCost / p.approvedBudget) * 100)}
                        </td>

                        <td className="py-3 px-4 font-mono font-medium text-[#202B26] tabular-nums text-right">
                          {cpiVal > 1.05 ? '1.04 (Efisien)' : cpiVal > 0.95 ? '1.01 (Normal)' : '0.94 (Kritis)'}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          <Badge variant="success" size="sm">
                            Zero Accident
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-4 bg-[#FAFBFB] border-t border-[#E2E8E4] flex items-center justify-between text-xs text-[#69766F]">
            <span>Metodologi standar: Earned Value Management (EVM) PMI</span>
            <span className="font-mono">Pembaruan data: Tiap 24 jam</span>
          </div>
        </div>
      </div>
    </div>
  );
};
