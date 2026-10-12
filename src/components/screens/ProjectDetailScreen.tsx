import React from 'react';
import {
  Calendar,
  MapPin,
  Building,
  UserCheck,
  Coins,
  FileCheck2,
  FileText,
  Download,
  Boxes,
  Clock,
  ArrowLeft,
  ChevronDown,
  Layers,
  CheckCircle2,
  AlertTriangle,
  ExternalLink
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Tabs } from '../common/Tabs';
import { Badge } from '../common/Badge';
import { ProgressBar } from '../common/ProgressBar';
import { Button } from '../common/Button';
import {
  formatCurrencyIDR,
  formatCompactIDR,
  formatPercent,
  formatDateIndo
} from '../../utils/formatters';
import { SCurveChart } from '../charts/SCurveChart';
import { generateProjectSCurve } from '../../utils/scurve';
import { downloadDocumentTemplate } from '../../utils/exportUtils';

export const ProjectDetailScreen: React.FC = () => {
  const {
    projects,
    selectedProjectId,
    setSelectedProjectId,
    projectDetailTab,
    setProjectDetailTab,
    setCurrentScreen,
    materials,
    fieldReports,
    budgetLines,
    milestones,
    wbsList,
    addToast,
  } = useApp();

  const currentProject =
    projects.find((p) => p.id === selectedProjectId) || projects[0];

  const projectMilestones = milestones.filter(
    (m) => m.projectId === currentProject.id
  );
  const projectWBS = wbsList.filter((w) => w.projectId === currentProject.id);
  const projectBudgets = budgetLines.filter(
    (b) => b.projectId === currentProject.id
  );
  const projectMaterials = materials.filter(
    (m) => m.allocatedProject.toLowerCase().includes(currentProject.name.slice(0, 10).toLowerCase())
  );
  const projectReports = fieldReports.filter(
    (r) => r.projectId === currentProject.id
  );

  const tabs = [
    { id: 'overview', label: 'Ringkasan Proyek' },
    { id: 'schedule', label: 'Jadwal & WBS', count: projectWBS.length || 8 },
    { id: 'budget', label: 'RAB & Biaya', count: projectBudgets.length || 6 },
    { id: 'materials', label: 'Material Proyek', count: projectMaterials.length || 4 },
    { id: 'field-reports', label: 'Laporan Lapangan', count: projectReports.length || 2 },
    { id: 'documents', label: 'Dokumen & Gambar', count: 5 },
  ];

  const projectSCurveData = React.useMemo(() => {
    return generateProjectSCurve({
      projectId: currentProject.id,
      projectName: currentProject.name,
      startDate: currentProject.startDate,
      endDate: currentProject.targetEndDate,
      currentActualProgress: currentProject.progressActual,
      reportingDate: '2026-10-09',
    });
  }, [currentProject]);

  const handleDownloadDoc = (docName: string) => {
    try {
      downloadDocumentTemplate(docName, currentProject.name);
      addToast({
        type: 'success',
        title: 'Dokumen Diunduh',
        message: `Berkas ${docName} berhasil diunduh dari arsip rekayasa ${currentProject.code}.`,
      });
    } catch (err) {
      addToast({
        type: 'danger',
        title: 'Gagal Mengunduh',
        message: `Tidak dapat memproses unduhan ${docName}.`,
      });
    }
  };

  const scheduleVariant =
    currentProject.scheduleStatus === 'Tepat Waktu'
      ? 'success'
      : currentProject.scheduleStatus === 'Kritis'
      ? 'warning'
      : 'danger';

  return (
    <div className="space-y-6">
      {/* Top Navigation & Back Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          onClick={() => setCurrentScreen('projects')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#285744] hover:text-[#12352B] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Portofolio Proyek</span>
        </button>

        {/* Project Selector Quick Switcher */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#69766F] select-none">Pilih Proyek:</span>
          <select
            value={currentProject.id}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="h-9 bg-white border border-[#E2E8E4] rounded-lg px-3 text-xs font-semibold text-[#202B26] hover:border-[#CBD5CF] focus:outline-none focus:border-[#12352B] focus:ring-1 focus:ring-[#12352B] transition-colors cursor-pointer"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Project Identity Hero Card */}
      <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs overflow-hidden">
        <div className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs font-mono font-bold text-[#12352B] bg-[#EAEFEA] px-2 py-0.5 rounded">
                  {currentProject.code}
                </span>
                <span className="text-xs text-[#69766F]">·</span>
                <span className="text-xs font-medium text-[#69766F]">{currentProject.category}</span>
                <span className="text-xs text-[#69766F]">·</span>
                <Badge variant={scheduleVariant} size="sm" dot>
                  {currentProject.scheduleStatus}
                </Badge>
                <Badge variant="primary" size="sm">
                  {currentProject.status}
                </Badge>
              </div>

              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#202B26] mb-2">
                {currentProject.name}
              </h1>

              <p className="text-xs text-[#69766F] leading-relaxed max-w-3xl mb-4">
                {currentProject.description}
              </p>

              {/* Meta details list */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs pt-4 border-t border-[#E2E8E4]">
                <div>
                  <span className="text-[#69766F] block text-[11px]">Klien / Pemilik</span>
                  <span className="font-semibold text-[#202B26] truncate block mt-0.5">
                    {currentProject.client}
                  </span>
                </div>

                <div>
                  <span className="text-[#69766F] block text-[11px]">Lokasi Site</span>
                  <span className="font-semibold text-[#202B26] truncate block mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#69766F] shrink-0" />
                    {currentProject.location}
                  </span>
                </div>

                <div>
                  <span className="text-[#69766F] block text-[11px]">Project Manager</span>
                  <span className="font-semibold text-[#202B26] truncate block mt-0.5">
                    {currentProject.projectManager}
                  </span>
                </div>

                <div>
                  <span className="text-[#69766F] block text-[11px]">Target Selesai</span>
                  <span className="font-semibold text-[#202B26] font-mono tabular-nums block mt-0.5 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-[#69766F] shrink-0" />
                    {formatDateIndo(currentProject.targetEndDate)}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Progress & Financial Card */}
            <div className="lg:w-72 bg-[#F9FBFA] rounded-xl p-4 border border-[#E2E8E4] flex flex-col justify-between shrink-0 space-y-4">
              <div>
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="font-medium text-[#69766F]">Progres Fisik</span>
                  <span className="font-bold font-mono text-[#202B26] tabular-nums">
                    {formatPercent(currentProject.progressActual)}
                  </span>
                </div>
                <ProgressBar
                  value={currentProject.progressActual}
                  planned={currentProject.progressPlanned}
                  size="md"
                />
                <div className="flex justify-between text-[11px] text-[#69766F] mt-1 font-mono tabular-nums">
                  <span>Realisasi</span>
                  <span>Rencana: {formatPercent(currentProject.progressPlanned)}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-[#E2E8E4] space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#69766F]">Nilai Kontrak:</span>
                  <span className="font-mono font-bold text-[#202B26] tabular-nums">
                    {formatCompactIDR(currentProject.contractValue)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#69766F]">Pagu RAB:</span>
                  <span className="font-mono font-medium text-[#202B26] tabular-nums">
                    {formatCompactIDR(currentProject.approvedBudget)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#69766F]">Realisasi Biaya:</span>
                  <span className="font-mono font-medium text-[#12352B] tabular-nums">
                    {formatCompactIDR(currentProject.actualCost)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 bg-[#FAFBFB] border-t border-[#E2E8E4]">
          <Tabs
            tabs={tabs}
            activeTab={projectDetailTab}
            onChange={setProjectDetailTab}
          />
        </div>
      </div>

      {/* Tab Content Display */}
      {projectDetailTab === 'overview' && (
        <div className="space-y-6">
          {/* Visual Construction Photo & Project Highlight */}
          {currentProject.image && (
            <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-3">
                <div className="md:col-span-1 h-56 md:h-auto relative overflow-hidden bg-slate-900">
                  <img
                    src={currentProject.image}
                    alt={currentProject.name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <span className="absolute bottom-3 left-3 text-[11px] text-white/90 font-mono bg-black/50 px-2 py-0.5 rounded">
                    Dokumentasi Terkini Site
                  </span>
                </div>

                <div className="p-5 md:col-span-2 flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-[#202B26] mb-1">
                      Kondisi Lapangan & Sorotan Pekerjaan Minggu Ini
                    </h3>
                    <p className="text-xs text-[#69766F] leading-relaxed mb-4">
                      Pekerjaan pengecoran balok dan plat lantai 21 telah rampung 100%. Tim struktur melanjutkan fabrikasi pembesian kolom zona A lantai 22. Pengujian slump beton K-350 tercapai sesuai spesifikasi teknis (12 ± 2 cm).
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                      <div className="p-3 rounded-lg bg-[#F5F7F6] border border-[#E2E8E4]">
                        <span className="text-[11px] text-[#69766F] block">Tenaga Kerja Harian</span>
                        <span className="text-base font-bold font-mono text-[#202B26] tabular-nums">
                          87 Orang
                        </span>
                      </div>
                      <div className="p-3 rounded-lg bg-[#F5F7F6] border border-[#E2E8E4]">
                        <span className="text-[11px] text-[#69766F] block">Jam Selamat K3</span>
                        <span className="text-base font-bold font-mono text-[#1C6843] tabular-nums">
                          184.200 Jam
                        </span>
                      </div>
                      <div className="p-3 rounded-lg bg-[#F5F7F6] border border-[#E2E8E4]">
                        <span className="text-[11px] text-[#69766F] block">Sisa Waktu SPMK</span>
                        <span className="text-base font-bold font-mono text-[#202B26] tabular-nums">
                          67 Hari Kerja
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#E2E8E4] flex items-center justify-between text-xs">
                    <span className="text-[#69766F]">
                      Inspektur Pengawas: {currentProject.siteEngineer}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setProjectDetailTab('field-reports')}
                    >
                      Buka Laporan Harian Lengkap →
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* S-Curve Preview & Milestone Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* S-Curve Chart Card */}
            <div className="lg:col-span-2">
              <SCurveChart data={projectSCurveData} />
            </div>

            {/* Milestones Card */}
            <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs p-5">
              <h3 className="text-sm font-bold text-[#202B26] mb-1">Milestone Utama Proyek</h3>
              <p className="text-xs text-[#69766F] mb-4">Titik capaian krusial kontrak</p>

              <div className="space-y-3">
                {projectMilestones.slice(0, 4).map((m) => (
                  <div key={m.id} className="p-3 rounded-lg border border-[#E2E8E4] bg-[#FAFBFB]">
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <span className="font-semibold text-xs text-[#202B26] leading-snug">
                        {m.title}
                      </span>
                      <Badge
                        variant={m.status === 'Selesai' ? 'success' : m.status === 'Berjalan' ? 'primary' : 'neutral'}
                        size="sm"
                      >
                        {m.status}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-[#69766F] mt-2">
                      <span className="font-mono tabular-nums">{m.wbsCode} · Bobot {m.weightPercent}%</span>
                      <span className="font-mono tabular-nums">{formatDateIndo(m.plannedDate)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Tab */}
      {projectDetailTab === 'schedule' && (
        <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs p-5">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-sm font-bold text-[#202B26]">Struktur Rincian Kerja (WBS)</h3>
              <p className="text-xs text-[#69766F]">Daftar paket pekerjaan dan bobot penyelesaian</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setCurrentScreen('schedule')}>
              Buka Modul Jadwal Penuh
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#FAFBFB] text-[#69766F] border-b border-[#E2E8E4]">
                  <th className="py-2.5 px-4 font-semibold">Kode WBS</th>
                  <th className="py-2.5 px-4 font-semibold">Uraian Pekerjaan</th>
                  <th className="py-2.5 px-4 font-semibold">Durasi</th>
                  <th className="py-2.5 px-4 font-semibold">Rencana</th>
                  <th className="py-2.5 px-4 font-semibold">Realisasi</th>
                  <th className="py-2.5 px-4 font-semibold">Status</th>
                  <th className="py-2.5 px-4 font-semibold">Pelaksana</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8E4]/70">
                {projectWBS.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F5F7F6]">
                    <td className="py-3 px-4 font-mono font-bold text-[#12352B]">{item.code}</td>
                    <td className="py-3 px-4 font-medium text-[#202B26]">{item.name}</td>
                    <td className="py-3 px-4 font-mono tabular-nums text-[#69766F]">{item.durationDays} hari</td>
                    <td className="py-3 px-4 font-mono tabular-nums">{item.plannedProgress}%</td>
                    <td className="py-3 px-4 font-mono tabular-nums font-bold text-[#202B26]">{item.actualProgress}%</td>
                    <td className="py-3 px-4">
                      <Badge
                        variant={item.status === 'Selesai' ? 'success' : item.status === 'Berjalan' ? 'primary' : 'neutral'}
                        size="sm"
                      >
                        {item.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-[#69766F]">{item.assignedTeam}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Budget Tab */}
      {projectDetailTab === 'budget' && (
        <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs p-5">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-sm font-bold text-[#202B26]">Rencana Anggaran Biaya (RAB Proyek)</h3>
              <p className="text-xs text-[#69766F]">Rincian pagu anggaran per divisi pekerjaan</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setCurrentScreen('budget')}>
              Buka Pengendalian Biaya Penuh
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#FAFBFB] text-[#69766F] border-b border-[#E2E8E4]">
                  <th className="py-2.5 px-4 font-semibold text-left">Divisi</th>
                  <th className="py-2.5 px-4 font-semibold text-left">Uraian Divisi</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Pagu RAB (IDR)</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Realisasi (IDR)</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Sisa Pagu</th>
                  <th className="py-2.5 px-4 font-semibold text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8E4]/70">
                {projectBudgets.map((b) => (
                  <tr key={b.id} className="hover:bg-[#F5F7F6]">
                    <td className="py-3 px-4 font-mono font-bold text-[#12352B]">{b.code}</td>
                    <td className="py-3 px-4 font-medium text-[#202B26]">{b.divisionName}</td>
                    <td className="py-3 px-4 font-mono tabular-nums text-right">{formatCurrencyIDR(b.plannedAmount)}</td>
                    <td className="py-3 px-4 font-mono tabular-nums font-bold text-[#202B26] text-right">{formatCurrencyIDR(b.actualAmount)}</td>
                    <td className="py-3 px-4 font-mono tabular-nums text-[#1C6843] text-right">{formatCurrencyIDR(b.varianceAmount)}</td>
                    <td className="py-3 px-4">
                      <Badge variant={b.status === 'Aman' ? 'success' : 'warning'} size="sm">
                        {b.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Materials Tab */}
      {projectDetailTab === 'materials' && (
        <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs p-5">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-sm font-bold text-[#202B26]">Logistik Material Lapangan</h3>
              <p className="text-xs text-[#69766F]">Alokasi stok dan status kebutuhan material</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setCurrentScreen('materials')}>
              Kelola Gudang Penuh
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#FAFBFB] text-[#69766F] border-b border-[#E2E8E4]">
                  <th className="py-2.5 px-4 font-semibold text-left">Kode</th>
                  <th className="py-2.5 px-4 font-semibold text-left">Nama Material</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Stok Saat Ini</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Batas Minimum</th>
                  <th className="py-2.5 px-4 font-semibold text-left">Supplier</th>
                  <th className="py-2.5 px-4 font-semibold text-left">Status Stok</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8E4]/70">
                {projectMaterials.map((m) => (
                  <tr key={m.id} className="hover:bg-[#F5F7F6]">
                    <td className="py-3 px-4 font-mono font-bold text-[#12352B]">{m.code}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#202B26]">{m.name}</div>
                      <div className="text-[11px] text-[#69766F]">{m.specification}</div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold tabular-nums text-[#202B26] text-right">
                      {m.currentStock.toLocaleString('id-ID')} {m.unit}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-[#69766F] text-right">
                      {m.minStock.toLocaleString('id-ID')} {m.unit}
                    </td>
                    <td className="py-3 px-4 text-[#69766F]">{m.primarySupplier}</td>
                    <td className="py-3 px-4">
                      <Badge
                        variant={m.status === 'Aman' ? 'success' : m.status === 'Menipis' ? 'warning' : 'danger'}
                        size="sm"
                      >
                        {m.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Field Reports Tab */}
      {projectDetailTab === 'field-reports' && (
        <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs p-5">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-sm font-bold text-[#202B26]">Laporan Harian Proyek</h3>
              <p className="text-xs text-[#69766F]">Catatan cuaca, tenaga kerja, dan aktivitas fisik harian</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setCurrentScreen('field-reports')}>
              Buka Semua Laporan Lapangan
            </Button>
          </div>

          <div className="space-y-4">
            {projectReports.map((report) => (
              <div key={report.id} className="p-4 rounded-xl border border-[#E2E8E4] bg-[#FAFBFB] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#E2E8E4]">
                  <div>
                    <span className="font-bold text-xs text-[#202B26]">{report.reportNumber}</span>
                    <span className="text-[#69766F] text-xs ml-2">· {formatDateIndo(report.date, true)}</span>
                  </div>
                  <Badge variant="success" size="sm">
                    {report.status}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-[#69766F] block text-[11px]">Pengawas Lapangan</span>
                    <span className="font-semibold text-[#202B26]">{report.siteSupervisor}</span>
                  </div>
                  <div>
                    <span className="text-[#69766F] block text-[11px]">Kondisi Cuaca</span>
                    <span className="font-semibold text-[#202B26]">Pagi: {report.weatherMorning} · Sore: {report.weatherAfternoon}</span>
                  </div>
                  <div>
                    <span className="text-[#69766F] block text-[11px]">Total Pekerja</span>
                    <span className="font-semibold text-[#202B26] font-mono tabular-nums">
                      {report.workforce.reduce((a, b) => a + b.count, 0)} Orang
                    </span>
                  </div>
                </div>

                <div className="text-xs">
                  <span className="font-semibold text-[#202B26] block mb-1">Item Pekerjaan Terlaksana:</span>
                  <ul className="list-disc pl-4 space-y-1 text-[#4F5D56]">
                    {report.completedWorks.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documents Tab */}
      {projectDetailTab === 'documents' && (
        <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs p-5">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-sm font-bold text-[#202B26]">Arsip Dokumen & Gambar Kerja</h3>
              <p className="text-xs text-[#69766F]">Kontrak kerja, BoQ disetujui, dan gambar DED / Shop Drawing</p>
            </div>
          </div>

          <div className="divide-y divide-[#E2E8E4]/70">
            {[
              {
                title: 'Surat Perjanjian Kontrak Kerja Konstruksi (Adendum 01)',
                code: 'KTR-2025-JKT-001-ADD1.pdf',
                size: '4.8 MB',
                date: '15 Jan 2026',
                type: 'PDF Kontrak',
              },
              {
                title: 'Detail Engineering Design (DED) Struktur Kolom & Balok Lt. 1-24',
                code: 'DED-STR-REV-04.dwg.pdf',
                size: '28.4 MB',
                date: '10 Feb 2026',
                type: 'Gambar Kerja',
              },
              {
                title: 'Bill of Quantities (BoQ) Terverifikasi Konsultan QS',
                code: 'BOQ-VERIFIED-FINAL.xlsx',
                size: '2.1 MB',
                date: '28 Mei 2025',
                type: 'Spreadsheet RAB',
              },
              {
                title: 'Laporan Investigasi Tanah & Bor Log Sondir Lapangan',
                code: 'SOIL-TEST-GEOTECH-REPORT.pdf',
                size: '12.0 MB',
                date: '14 Mei 2025',
                type: 'Laporan Teknis',
              },
              {
                title: 'Rencana Keselamatan Konstruksi (RKK) & Manual K3',
                code: 'RKK-HSE-INDOTEK-REV2.pdf',
                size: '3.6 MB',
                date: '01 Jun 2025',
                type: 'K3 / HSE',
              },
            ].map((doc, idx) => (
              <div key={idx} className="py-3.5 flex items-center justify-between gap-4 text-xs">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[#EAEFEA] text-[#285744] flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-[#202B26] truncate">{doc.title}</div>
                    <div className="text-[11px] text-[#69766F] font-mono mt-0.5 tabular-nums">
                      {doc.code} · {doc.size} · {doc.date}
                    </div>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => handleDownloadDoc(doc.code)}
                  leftIcon={<Download className="w-3.5 h-3.5" />}
                >
                  Unduh
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
