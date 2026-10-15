import React, { useState, useMemo } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Filter,
  Search,
  ArrowRight,
  TrendingUp,
  Layers,
  ChevronRight,
  FileCheck2,
  ShieldCheck,
  ShieldAlert,
  Award,
  Check,
  Printer,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { MetricCard } from '../common/MetricCard';
import { Badge } from '../common/Badge';
import { ProgressBar } from '../common/ProgressBar';
import { Button } from '../common/Button';
import { SearchInput } from '../common/SearchInput';
import { Modal } from '../common/Modal';
import { SCurveChart } from '../charts/SCurveChart';
import { generateProjectSCurve } from '../../utils/scurve';
import { generateBastMilestonePDF } from '../../utils/pdfGenerator';

import { Milestone } from '../../types';
import { formatDateIndo, formatPercent } from '../../utils/formatters';

interface SignedMilestone extends Milestone {
  signedOffBy?: string;
  signedOffAt?: string;
  bastRef?: string;
}

export const ScheduleScreen: React.FC = () => {
  const {
    projects,
    selectedProjectId,
    setSelectedProjectId,
    wbsList,
    milestones,
    signOffMilestone,
    updateWBSProgress,
    addToast
  } = useApp();

  const { activeRole, hasAuthority, userProfile, currentUser } = useAuth();
  const canSignOff =
    hasAuthority('milestoneSignOff') ||
    activeRole === 'Owner / Director' ||
    activeRole === 'Project Manager';

  const [activeTab, setActiveTab] = useState<'wbs' | 'milestones'>('wbs');
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('Semua');

  // Modal State for Signing Off Milestone
  const [signingMilestone, setSigningMilestone] = useState<Milestone | null>(null);
  const [signForm, setSignForm] = useState({
    bastRef: 'BA-OPNAME-FISIK-01.pdf',
    notes: 'Pekerjaan telah diinspeksi bersama konsultan pengawas dan dinyatakan memenuhi toleransi SNI.',
    confirmQuality: true,
  });

  const currentProject =
    projects.find((p) => p.id === selectedProjectId) || projects[0];

  const scurveData = useMemo(() => {
    const projectWbs = wbsList.filter((w) => w.projectId === currentProject.id);
    return generateProjectSCurve({
      projectId: currentProject.id,
      projectName: currentProject.name,
      startDate: currentProject.startDate,
      endDate: currentProject.targetEndDate,
      currentActualProgress: currentProject.progressActual,
      reportingDate: '2026-10-09',
      wbsItems: projectWbs,
    });
  }, [currentProject, wbsList]);

  const projectMilestones = milestones.filter(
    (m) => m.projectId === currentProject.id
  );

  const filteredWBS = useMemo(() => {
    return wbsList.filter((item) => {
      const matchSearch =
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.code.toLowerCase().includes(search.toLowerCase()) ||
        item.assignedTeam.toLowerCase().includes(search.toLowerCase());

      const matchStatus =
        selectedStatus === 'Semua' || item.status === selectedStatus;

      return matchSearch && matchStatus;
    });
  }, [wbsList, search, selectedStatus]);

  const totalTasks = wbsList.length;
  const completedTasks = wbsList.filter((w) => w.status === 'Selesai').length;
  const inProgressTasks = wbsList.filter((w) => w.status === 'Berjalan').length;
  const delayedTasks = wbsList.filter((w) => w.status === 'Terlambat').length;

  const handleUpdateProgress = async (id: string, current: number) => {
    const nextVal = Math.min(100, current + 5);
    const nextStatus = nextVal >= 100 ? 'Selesai' : 'Berjalan';
    try {
      await updateWBSProgress(id, nextVal, nextStatus);
    } catch {
      // Toast already shown by AppContext rollback
    }
  };

  const handleConfirmSignOff = async () => {
    if (!signingMilestone) return;

    if (!canSignOff) {
      addToast({
        type: 'danger',
        title: 'Akses Ditolak',
        message: 'Hanya Manajer Proyek atau Direksi yang memiliki wewenang pengesahan BAST Milestone.',
      });
      return;
    }

    try {
      await signOffMilestone(signingMilestone.id, signingMilestone.title, currentProject.name, signForm.bastRef);
      setSigningMilestone(null);
    } catch {
      // Toast already shown by AppContext rollback
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E2E8E4]">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#69766F] mb-1">
            <span>Operasional Proyek & Pengendalian Jadwal</span>
            <span aria-hidden="true">·</span>
            <span>Master Scheduling, Kurva-S & Sign-off Milestone</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#202B26]">
            Jadwal Pelaksanaan & Progres Fisik
          </h1>
          <p className="text-xs text-[#69766F] mt-0.5">
            Monitoring lintasan kritis (Critical Path), jadwal WBS mingguan, deviasi Kurva-S, dan pengesahan Berita Acara BAST
          </p>
        </div>

        {/* Project Switcher */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs text-[#69766F] select-none">Proyek:</span>
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

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Paket Pekerjaan (WBS)"
          value={`${totalTasks} Item`}
          subtitle="Breakdown master schedule"
          icon={<Layers className="w-4 h-4 text-[#12352B]" />}
        />
        <MetricCard
          label="Pekerjaan Selesai"
          value={`${completedTasks} Item`}
          subtitle={`${Math.round((completedTasks / totalTasks) * 100)}% dari seluruh item WBS`}
          trend={{ value: `${completedTasks} Selesai 100%`, isPositive: true }}
          icon={<CheckCircle2 className="w-4 h-4 text-[#1C6843]" />}
        />
        <MetricCard
          label="Milestone Disahkan (BAST)"
          value={`${projectMilestones.filter((m) => m.signedOffBy).length} / ${projectMilestones.length}`}
          subtitle="Tervalidasi Berita Acara Serah Terima"
          icon={<Award className="w-4 h-4 text-[#285744]" />}
        />
        <MetricCard
          label="Pekerjaan Deviasi / Kritis"
          value={`${delayedTasks} Item`}
          subtitle="Membutuhkan jam lembur & rekayasa"
          trend={{ value: delayedTasks > 0 ? 'Perlu Eskalasi' : 'Semua On Track', isPositive: delayedTasks === 0 }}
          icon={<AlertTriangle className="w-4 h-4 text-[#9E6B05]" />}
        />
      </div>

      {/* Genuine Professional S-Curve Visualization */}
      <SCurveChart data={scurveData} />

      {/* Segmented Tab Switch: WBS vs Milestones */}
      <div className="bg-white p-3 rounded-xl border border-[#E2E8E4] shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center p-1 bg-[#EAEFEA] rounded-lg gap-1">
          <button
            onClick={() => setActiveTab('wbs')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
              activeTab === 'wbs'
                ? 'bg-white text-[#12352B] shadow-2xs font-semibold'
                : 'text-[#69766F] hover:text-[#202B26]'
            }`}
          >
            Rincian Paket Kerja WBS ({wbsList.length})
          </button>
          <button
            onClick={() => setActiveTab('milestones')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'milestones'
                ? 'bg-white text-[#12352B] shadow-2xs font-semibold'
                : 'text-[#69766F] hover:text-[#202B26]'
            }`}
          >
            <span>Milestone Kunci & Sign-off BAST</span>
            <span className="px-1.5 py-0.2 rounded-full text-xs font-mono bg-[#12352B] text-white">
              {projectMilestones.length}
            </span>
          </button>
        </div>

        {activeTab === 'wbs' && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Cari WBS atau pelaksana..."
              className="w-full sm:w-56"
            />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="h-9 bg-white border border-[#E2E8E4] rounded-lg px-3 text-xs font-medium text-[#202B26] hover:border-[#CBD5CF] focus:outline-none focus:border-[#12352B] cursor-pointer"
            >
              <option value="Semua">Semua Status</option>
              <option value="Berjalan">Sedang Berjalan</option>
              <option value="Selesai">Selesai</option>
              <option value="Terlambat">Terlambat</option>
            </select>
          </div>
        )}
      </div>

      {/* Tab 1: WBS Table */}
      {activeTab === 'wbs' && (
        <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#FAFBFB] text-[#69766F] border-b border-[#E2E8E4]">
                  <th className="py-3 px-4 font-semibold">Kode</th>
                  <th className="py-3 px-4 font-semibold">Uraian Paket Pekerjaan</th>
                  <th className="py-3 px-4 font-semibold hidden md:table-cell">Jadwal Tanggal</th>
                  <th className="py-3 px-4 font-semibold">Progres Aktual vs Target</th>
                  <th className="py-3 px-4 font-semibold hidden lg:table-cell">Gantt Visual</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8E4]/70">
                {filteredWBS.map((item) => {
                  const statusVariant =
                    item.status === 'Selesai'
                      ? 'success'
                      : item.status === 'Berjalan'
                      ? 'primary'
                      : item.status === 'Terlambat'
                      ? 'danger'
                      : 'neutral';

                  return (
                    <tr key={item.id} className="hover:bg-[#F5F7F6]/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-[#12352B]">
                        {item.code}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[#202B26] leading-snug">{item.name}</div>
                        <div className="text-xs text-[#69766F] flex items-center gap-2 mt-0.5">
                          <span>{item.category}</span>
                          <span>·</span>
                          <span>{item.assignedTeam}</span>
                          {item.criticalPath && (
                            <>
                              <span>·</span>
                              <span className="text-[#A82A20] font-semibold">Critical Path</span>
                            </>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 hidden md:table-cell whitespace-nowrap">
                        <div className="font-mono tabular-nums text-[#202B26]">
                          {formatDateIndo(item.startDate)} s/d {formatDateIndo(item.endDate)}
                        </div>
                        <div className="text-xs text-[#69766F] font-mono tabular-nums">
                          Durasi: {item.durationDays} hari kerja
                        </div>
                      </td>

                      <td className="py-3.5 px-4 min-w-[140px]">
                        <div className="flex justify-between items-center text-xs mb-1 font-mono tabular-nums">
                          <span className="font-bold text-[#202B26]">{item.actualProgress}%</span>
                          <span className="text-[#69766F]">Rencana: {item.plannedProgress}%</span>
                        </div>
                        <ProgressBar
                          value={item.actualProgress}
                          planned={item.plannedProgress}
                          size="sm"
                          variant={item.actualProgress >= item.plannedProgress ? 'primary' : 'warning'}
                        />
                      </td>

                      <td className="py-3.5 px-4 hidden lg:table-cell min-w-[160px]">
                        <div className="w-full bg-[#EAEFEA] h-3 rounded-full relative overflow-hidden">
                          <div
                            className="h-full bg-[#285744] rounded-full"
                            style={{ width: `${item.actualProgress}%` }}
                          />
                        </div>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <Badge variant={statusVariant} size="sm">
                          {item.status}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {item.actualProgress < 100 ? (
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => handleUpdateProgress(item.id, item.actualProgress)}
                          >
                            +5% Update
                          </Button>
                        ) : (
                          <span className="text-xs text-[#1C6843] font-semibold font-mono">Tuntas</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Milestones & BAST Sign-Off Workflow */}
      {activeTab === 'milestones' && (
        <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-[#E2E8E4] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#202B26]">
                Daftar Milestone Kunci & Otorisasi BAST Proyek
              </h2>
              <p className="text-xs text-[#69766F] mt-0.5">
                Pengesahan formal setiap paket fase struktur untuk syarat termin pembayaran client
              </p>
            </div>
            {!canSignOff && (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-[#FFF8EC] border border-[#FCE6B1] rounded-lg text-xs text-[#9E6B05]">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Otorisasi BAST terbatas untuk Manajer Proyek / Direksi</span>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#FAFBFB] text-[#69766F] border-b border-[#E2E8E4]">
                  <th className="py-3 px-4 font-semibold">Kode WBS</th>
                  <th className="py-3 px-4 font-semibold">Uraian Milestone Pekerjaan</th>
                  <th className="py-3 px-4 font-semibold">Target Tanggal</th>
                  <th className="py-3 px-4 font-semibold text-center">Bobot RAB</th>
                  <th className="py-3 px-4 font-semibold">Fisik Selesai</th>
                  <th className="py-3 px-4 font-semibold">Status Validasi BAST</th>
                  <th className="py-3 px-4 font-semibold text-right">Aksi Pengesahan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8E4]/70">
                {projectMilestones.map((ms) => {
                  const isSigned = !!ms.signedOffBy;
                  const isEligible = ms.progress >= 70 && !isSigned;

                  return (
                    <tr key={ms.id} className="hover:bg-[#F5F7F6]/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-[#12352B]">
                        {ms.wbsCode}
                      </td>

                      <td className="py-3.5 px-4 min-w-[240px]">
                        <div className="font-semibold text-[#202B26]">{ms.title}</div>
                        {ms.bastRef && (
                          <div className="text-xs text-[#285744] font-mono mt-0.5 flex items-center gap-1">
                            <FileCheck2 className="w-3.5 h-3.5" />
                            <span>Dokumen: {ms.bastRef}</span>
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-mono tabular-nums text-[#69766F] whitespace-nowrap">
                        {formatDateIndo(ms.plannedDate)}
                      </td>

                      <td className="py-3.5 px-4 text-center font-mono font-bold tabular-nums text-[#202B26]">
                        {ms.weightPercent}%
                      </td>

                      <td className="py-3.5 px-4 min-w-[120px]">
                        <div className="font-mono font-bold text-[#202B26] text-xs mb-1">
                          {ms.progress}%
                        </div>
                        <ProgressBar
                          value={ms.progress}
                          size="sm"
                          variant={ms.progress === 100 ? 'success' : 'primary'}
                        />
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isSigned ? (
                          <div>
                            <Badge variant="success" size="sm" dot>
                              Disahkan BAST
                            </Badge>
                            <div className="text-xs text-[#69766F] mt-1 max-w-[160px] truncate">
                              Oleh: {ms.signedOffBy?.split('(')[0]}
                            </div>
                          </div>
                        ) : (
                          <Badge variant="warning" size="sm">
                            Belum Disahkan
                          </Badge>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {isSigned ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-[#1C6843] font-semibold flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" />
                              <span>Tervalidasi</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => generateBastMilestonePDF(ms as any, currentProject)}
                              className="min-h-[44px] px-2.5 py-1 text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-xs inline-flex items-center gap-1 cursor-pointer"
                              title="Cetak Berita Acara Serah Terima (BAST PDF A4)"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>Cetak BAST</span>
                            </button>
                          </div>
                        ) : canSignOff ? (
                          <Button
                            variant="primary"
                            size="xs"
                            leftIcon={<Award className="w-3 h-3" />}
                            onClick={() => {
                              setSigningMilestone(ms);
                              setSignForm({
                                bastRef: `BAST-${ms.wbsCode}-${currentProject.code}.pdf`,
                                notes: `Pekerjaan ${ms.title} telah selesai dan diverifikasi memenuhi standar teknis toleransi mutu.`,
                                confirmQuality: true,
                              });
                            }}
                          >
                            Sign-Off BAST
                          </Button>
                        ) : (
                          <span className="text-xs text-[#69766F]">
                            Perlu PM Sign-off
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Sign-Off BAST Milestone */}
      {signingMilestone && (
        <Modal
          isOpen={true}
          onClose={() => setSigningMilestone(null)}
          title={`Pengesahan Resmi BAST — ${signingMilestone.wbsCode}`}
          description={`Pengesahan Berita Acara Serah Terima Pekerjaan (${signingMilestone.title}) pada proyek ${currentProject.name}.`}
          maxWidth="md"
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={() => setSigningMilestone(null)}>
                Batal
              </Button>
              <Button variant="primary" size="sm" onClick={handleConfirmSignOff}>
                Sahkan & Terbitkan BAST
              </Button>
            </>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="p-3.5 bg-[#FAFBFB] rounded-lg border border-[#E2E8E4] space-y-2">
              <div className="flex justify-between">
                <span className="text-[#69766F]">Paket WBS:</span>
                <span className="font-mono font-bold text-[#12352B]">{signingMilestone.wbsCode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#69766F]">Bobot Progres RAB:</span>
                <span className="font-mono font-bold text-[#202B26]">{signingMilestone.weightPercent}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#69766F]">Pejabat Penandatangan:</span>
                <span className="font-semibold text-[#202B26]">
                  {userProfile?.name || currentUser?.displayName || `${activeRole}`}
                </span>
              </div>
            </div>

            <div>
              <label className="block font-medium text-[#202B26] mb-1">
                Nomor Surat Berita Acara (BAST) <span className="text-[#A82A20]">*</span>
              </label>
              <input
                type="text"
                required
                value={signForm.bastRef}
                onChange={(e) => setSignForm({ ...signForm, bastRef: e.target.value })}
                className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg font-mono text-[#202B26]"
              />
            </div>

            <div>
              <label className="block font-medium text-[#202B26] mb-1">
                Catatan Verifikasi & Berita Acara Fisik
              </label>
              <textarea
                rows={3}
                value={signForm.notes}
                onChange={(e) => setSignForm({ ...signForm, notes: e.target.value })}
                className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
              />
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-lg bg-[#E5F4EB] border border-[#CDE9D7] cursor-pointer">
              <input
                type="checkbox"
                checked={signForm.confirmQuality}
                onChange={(e) => setSignForm({ ...signForm, confirmQuality: e.target.checked })}
                className="mt-0.5 rounded text-[#12352B] focus:ring-[#12352B]"
              />
              <span className="text-[#1C6843] leading-relaxed">
                Saya menyatakan bahwa inspeksi bersama konsultan pengawas telah dilaksanakan, mutu
                material teruji laboratorium, dan milestone ini siap diajukan untuk penagihan termin.
              </span>
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
};
