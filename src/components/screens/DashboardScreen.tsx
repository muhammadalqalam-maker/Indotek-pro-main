import React from 'react';
import {
  FolderKanban,
  TrendingUp,
  AlertTriangle,
  Coins,
  ArrowUpRight,
  ArrowRight,
  Clock,
  Calendar,
  CheckCircle2,
  FileText,
  Boxes,
  Plus
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useUI } from '../../context/UIContext';
import { MetricCard } from '../common/MetricCard';
import { Badge } from '../common/Badge';
import { ProgressBar } from '../common/ProgressBar';
import { Button } from '../common/Button';
import {
  formatCurrencyIDR,
  formatCompactIDR,
  formatPercent,
  formatDateIndo,
  formatDateWITA,
  formatDateTimeWITA,
  getWitaDateISO,
} from '../../utils/formatters';

export const DashboardScreen: React.FC = () => {
  const navigate = useNavigate();
  const {
    projects,
    milestones,
    navigateToProjectDetail,
    setIsAddProjectModalOpen,
    activities,
  } = useApp();
  const { settings } = useUI();

  const activeProjects = projects.filter((p) => p.status === 'Berjalan');
  const completedProjects = projects.filter((p) => p.status === 'Selesai');
  const criticalProjects = projects.filter(
    (p) => p.scheduleStatus === 'Terlambat' || p.scheduleStatus === 'Kritis'
  );

  const totalRAB = projects.reduce((acc, p) => acc + p.approvedBudget, 0);
  const totalActual = projects.reduce((acc, p) => acc + p.actualCost, 0);
  const activeContractValue = activeProjects.reduce((acc, project) => acc + project.contractValue, 0);
  const avgProgress = activeContractValue > 0
    ? activeProjects.reduce((acc, project) => acc + project.progressActual * project.contractValue, 0) / activeContractValue
    : activeProjects.reduce((acc, project) => acc + project.progressActual, 0) / (activeProjects.length || 1);
  const budgetUtilization = (totalActual / (totalRAB || 1)) * 100;

  // Calculate CPI (Cost Performance Index) = Earned Value / Actual Cost
  // EV = sum of (approvedBudget * progressActual / 100) for each project
  const totalEarnedValue = projects.reduce((acc, p) => acc + (p.approvedBudget * p.progressActual / 100), 0);
  const cpi = totalActual > 0 ? totalEarnedValue / totalActual : 0;
  const cpiLabel = cpi > 1.05 ? 'Efisien' : cpi < 0.95 ? 'Overspend' : 'Sesuai';
  const cpiTrend = cpi > 1.0 ? { value: cpiLabel, isPositive: true, label: `CPI ${cpi.toFixed(2)}` } : cpi > 0 ? { value: cpiLabel, isPositive: false, label: `CPI ${cpi.toFixed(2)}` } : undefined;

  const completedTrend = completedProjects.length > 0
    ? { value: `${completedProjects.length} Proyek Selesai`, isPositive: true, label: 'di portofolio' }
    : undefined;

  // Count critical issues
  const lateProjects = projects.filter((p) => p.scheduleStatus === 'Terlambat').length;
  const criticalTrend = criticalProjects.length > 0 ? { value: lateProjects > 0 ? `${lateProjects} Terlambat` : 'Memerlukan perhatian', isPositive: false, label: '' } : undefined;

  const budgetPerformance = React.useMemo(
    () => projects
      .filter((project) => project.approvedBudget > 0 || project.actualCost > 0)
      .sort((a, b) => Math.max(b.approvedBudget, b.actualCost) - Math.max(a.approvedBudget, a.actualCost))
      .slice(0, 5),
    [projects]
  );
  const maxProjectBudget = Math.max(
    1,
    ...budgetPerformance.map((project) => Math.max(project.approvedBudget, project.actualCost))
  );
  const todayWita = getWitaDateISO();
  const nextMonthWita = new Date(`${todayWita}T00:00:00Z`);
  nextMonthWita.setUTCDate(nextMonthWita.getUTCDate() + 30);
  const upcomingMilestones = milestones
    .filter((milestone) => {
      const plannedDate = milestone.plannedDate.slice(0, 10);
      return milestone.status !== 'Selesai' && plannedDate >= todayWita && plannedDate <= nextMonthWita.toISOString().slice(0, 10);
    })
    .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))
    .slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Top Banner & Context */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#E2E8E4]">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#69766F] mb-1">
            <span>{settings.companyName || 'Perusahaan'}</span>
            <span aria-hidden="true">·</span>
            <span>{settings.companyAddress ? settings.companyAddress.split(',').pop()?.trim() : 'Kantor Pusat'}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums font-mono">WITA (UTC+8)</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#202B26]">
            Dashboard Monitoring Portofolio
          </h1>
          <p className="text-xs text-[#69766F] mt-0.5">
            Ringkasan status proyek konstruksi, jadwal kurva-s, anggaran RAB, dan logistik lapangan per{' '}
            <span className="font-semibold text-[#202B26]">{formatDateWITA()}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/laporan')}
            leftIcon={<FileText className="w-4 h-4" />}
          >
            Ekspor Laporan
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsAddProjectModalOpen(true)}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Tambah Proyek
          </Button>
        </div>
      </div>

      {/* 4 Core KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Proyek Aktif"
          value={`${activeProjects.length} Proyek`}
          subtitle={`Dari ${projects.length} total portofolio kontrak`}
          trend={completedTrend}
          icon={<FolderKanban className="w-4 h-4" />}
          onClick={() => navigate('/proyek')}
        />

        <MetricCard
          label="Rata-rata Progres Fisik"
          value={formatPercent(avgProgress)}
          subtitle="Agregat tertimbang lapangan"
          trend={undefined}
          icon={<TrendingUp className="w-4 h-4" />}
          onClick={() => navigate('/jadwal')}
        />

        <MetricCard
          label="Realisasi Anggaran RAB"
          value={formatCompactIDR(totalActual)}
          subtitle={`Pagu RAB: ${formatCompactIDR(totalRAB)} (${formatPercent(budgetUtilization)} terpakai)`}
          trend={cpiTrend}
          icon={<Coins className="w-4 h-4" />}
          onClick={() => navigate('/anggaran')}
        />

        <MetricCard
          label="Perhatian Khusus / Kritis"
          value={`${criticalProjects.length} Proyek`}
          subtitle="Memerlukan tindakan percepatan"
          trend={criticalTrend}
          icon={<AlertTriangle className="w-4 h-4 text-[#9E6B05]" />}
          onClick={() => navigate('/proyek')}
        />
      </div>

      {/* Alert Ribbon if critical projects exist */}
      {criticalProjects.length > 0 && (
        <div className="bg-[#FFF8EC] border border-[#FCE6B1] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#9E6B05] shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-[#9E6B05]">
                Peringatan Operasional: {criticalProjects.length} Proyek Butuh Eskalasi
              </span>
              <p className="text-[#69766F] mt-0.5 leading-relaxed">
                {criticalProjects.slice(0, 2).map((project) => (
                  <span key={project.id} className="block">
                    <span className="font-medium text-[#202B26]">{project.name}</span> — {project.scheduleStatus}
                  </span>
                ))}
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/proyek')}
            className="shrink-0 text-xs self-start sm:self-center"
          >
            Tinjau Eskalasi
          </Button>
        </div>
      )}

      {/* 2-Column Split: Portfolio Table + Mini Cash Flow Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main 2-Span: Active Projects Table */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-[#E2E8E4] shadow-2xs overflow-hidden flex flex-col">
          <div className="p-4 sm:p-5 border-b border-[#E2E8E4] flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#202B26]">Proyek Konstruksi Prioritas</h2>
              <p className="text-xs text-[#69766F] mt-0.5">
                Monitoring deviasi jadwal dan utilisasi biaya secara realtime
              </p>
            </div>
            <button
              onClick={() => navigate('/proyek')}
              className="text-xs font-semibold text-[#285744] hover:text-[#12352B] flex items-center gap-1 hover:underline"
            >
              Lihat Semua Proyek <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#FAFBFB] text-[#69766F] border-b border-[#E2E8E4] font-medium">
                  <th className="py-2.5 px-4 font-medium text-left">Nama Proyek & Kode</th>
                  <th className="py-2.5 px-4 font-medium text-left hidden sm:table-cell">Klien</th>
                  <th className="py-2.5 px-4 font-medium text-left">Progres Fisik</th>
                  <th className="py-2.5 px-4 font-medium text-right">Nilai Kontrak</th>
                  <th className="py-2.5 px-4 font-medium text-left">Status Jadwal</th>
                  <th className="py-2.5 px-4 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8E4]/70">
                {activeProjects.length > 0 ? activeProjects.slice(0, 5).map((project) => {
                  const scheduleVariant =
                    project.scheduleStatus === 'Tepat Waktu'
                      ? 'success'
                      : project.scheduleStatus === 'Kritis'
                      ? 'warning'
                      : 'danger';

                  return (
                    <tr
                      key={project.id}
                      className="hover:bg-[#F5F7F6]/80 transition-colors group cursor-pointer"
                      onClick={() => navigateToProjectDetail(project.id)}
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#202B26] group-hover:text-[#12352B] transition-colors">
                          {project.name}
                        </div>
                        <div className="text-xs text-[#69766F] font-mono tabular-nums">
                          {project.code} · {project.category}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-[#69766F] hidden sm:table-cell">
                        <div className="truncate max-w-[140px]">{project.client}</div>
                      </td>

                      <td className="py-3 px-4 min-w-[140px]">
                        <div className="flex items-center justify-between text-xs mb-1 font-mono tabular-nums">
                          <span className="font-semibold text-[#202B26]">
                            {formatPercent(project.progressActual)}
                          </span>
                          <span className="text-[#69766F]">
                            Plan: {formatPercent(project.progressPlanned)}
                          </span>
                        </div>
                        <ProgressBar
                          value={project.progressActual}
                          planned={project.progressPlanned}
                          size="sm"
                          variant={
                            project.progressActual >= project.progressPlanned ? 'primary' : 'warning'
                          }
                        />
                      </td>

                      <td className="py-3 px-4 font-mono font-medium text-[#202B26] tabular-nums whitespace-nowrap text-right">
                        {formatCompactIDR(project.contractValue)}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <Badge variant={scheduleVariant} size="sm" dot>
                          {project.scheduleStatus}
                        </Badge>
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigateToProjectDetail(project.id);
                          }}
                          rightIcon={<ArrowUpRight className="w-3.5 h-3.5" />}
                        >
                          Detail
                        </Button>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={6} className="py-8 px-4 text-center text-xs text-[#69766F]">
                      Belum ada proyek aktif di portofolio ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 1-Span Right: Budget Performance */}
        <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-[#202B26]">Anggaran & Realisasi Proyek</h2>
              <span className="text-xs font-mono text-[#69766F] bg-[#F1F4F2] px-2 py-0.5 rounded">IDR</span>
            </div>
            <p className="text-xs text-[#69766F] mb-4">
              Pagu RAB dibandingkan dengan biaya aktual per proyek
            </p>

            <div className="space-y-3 pt-2">
              {budgetPerformance.length > 0 ? budgetPerformance.map((project) => {
                const budgetPct = (project.approvedBudget / maxProjectBudget) * 100;
                const actualPct = (project.actualCost / maxProjectBudget) * 100;
                return (
                  <div key={project.id} className="space-y-1">
                    <div className="flex justify-between items-center gap-2 text-xs">
                      <span className="text-[#202B26] font-medium truncate">{project.name}</span>
                      <span className="font-mono tabular-nums text-[#69766F] shrink-0">
                        {formatCompactIDR(project.actualCost)} / {formatCompactIDR(project.approvedBudget)}
                      </span>
                    </div>
                    <div className="relative h-2 w-full bg-[#F1F4F2] rounded-full overflow-hidden">
                      <div className="absolute inset-y-0 left-0 bg-[#A2B8AE] rounded-full" style={{ width: `${budgetPct}%` }} />
                      <div className="absolute inset-y-0 left-0 bg-[#12352B] rounded-full" style={{ width: `${actualPct}%` }} />
                    </div>
                  </div>
                );
              }) : (
                <p className="py-8 text-center text-xs text-[#69766F]">
                  Data anggaran akan tampil setelah proyek dengan nilai RAB tersedia.
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-[#E2E8E4] flex items-center justify-between text-xs">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#12352B]" />
                <span className="text-[#69766F]">Realisasi</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#A2B8AE]" />
                <span className="text-[#69766F]">Pagu RAB</span>
              </span>
            </div>
            <button
              onClick={() => navigate('/anggaran')}
              className="text-[#285744] font-medium hover:underline flex items-center gap-1"
            >
              Rincian RAB <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Lower Grid: Recent Site Activity Stream + Upcoming Milestones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Feed */}
        <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-[#202B26]">Aktivitas Operasional Lapangan</h2>
              <p className="text-xs text-[#69766F] mt-0.5">Catatan log harian, material keluar, dan approval</p>
            </div>
            <Clock className="w-4 h-4 text-[#69766F]" />
          </div>

          <div className="divide-y divide-[#E2E8E4]/60">
            {activities.length > 0 ? activities.map((act) => (
              <div key={act.id} className="py-3 first:pt-0 last:pb-0 flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-[#285744] mt-1.5 shrink-0" />
                <div className="flex-1 min-w-0 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#202B26] truncate">{act.user}</span>
                    <span className="text-xs text-[#A2B8AE] whitespace-nowrap font-mono tabular-nums">
                      {formatDateTimeWITA(act.timestamp)}
                    </span>
                  </div>
                  <p className="text-[#4F5D56] mt-0.5">{act.action}</p>
                  <span className="text-xs text-[#69766F] font-mono mt-1 block">
                    {act.projectName}
                  </span>
                </div>
              </div>
            )) : <p className="py-4 text-xs text-[#69766F]">Belum ada aktivitas operasional.</p>}
          </div>
        </div>

        {/* Upcoming Milestones */}
        <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-[#202B26]">Target Milestone Mendatang</h2>
                <p className="text-xs text-[#69766F] mt-0.5">Jadwal krusial 30 hari ke depan</p>
              </div>
              <Calendar className="w-4 h-4 text-[#69766F]" />
            </div>

            <div className="space-y-3">
              {upcomingMilestones.length > 0 ? upcomingMilestones.map((milestone) => (
                <div key={milestone.id} className="p-3 rounded-lg border border-[#E2E8E4] bg-[#FAFBFB]">
                  <div className="flex items-center justify-between gap-2 text-xs mb-1">
                    <span className="font-semibold text-[#202B26]">{milestone.title}</span>
                    <Badge variant={milestone.status === 'Terlambat' ? 'danger' : 'info'} size="sm">
                      {formatDateIndo(milestone.plannedDate)}
                    </Badge>
                  </div>
                  <div className="text-xs text-[#69766F]">
                    {projects.find((project) => project.id === milestone.projectId)?.name || 'Proyek'} · {milestone.wbsCode}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <ProgressBar
                      value={milestone.progress}
                      size="sm"
                      variant={milestone.status === 'Terlambat' ? 'danger' : 'warning'}
                    />
                    <span className="text-xs font-mono font-medium tabular-nums text-[#202B26]">
                      {formatPercent(milestone.progress, 0)}
                    </span>
                  </div>
                </div>
              )) : (
                <p className="py-6 text-center text-xs text-[#69766F]">
                  Tidak ada milestone dalam 30 hari ke depan.
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#E2E8E4] flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/jadwal')}
              rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
            >
              Buka Jadwal & Kurva-S Lengkap
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
