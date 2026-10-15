import React, { useState, useMemo } from 'react';
import {
  FileCheck2,
  Plus,
  CloudSun,
  Users,
  AlertTriangle,
  Camera,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  ExternalLink,
  Check,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  Edit3,
  FileText,
  Printer,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { MetricCard } from '../common/MetricCard';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { SearchInput } from '../common/SearchInput';
import { Modal } from '../common/Modal';
import { FieldReport, FieldReportStatus } from '../../types';
import { formatDateIndo } from '../../utils/formatters';
import { AttachmentUploader } from '../common/AttachmentUploader';
import { generateFieldReportPDF } from '../../utils/pdfGenerator';
import { enqueueOfflineFieldReport } from '../../utils/offlineQueue';
import { compressImage } from '../../utils/imageCompression';

export const FieldReportsScreen: React.FC = () => {
  const { fieldReports, addFieldReport, reviewFieldReport, projects, addToast } = useApp();
  const { activeRole, hasAuthority, userProfile, currentUser } = useAuth();

  const canApproveReport =
    hasAuthority('fieldReport') ||
    activeRole === 'Owner / Director' ||
    activeRole === 'Project Manager';

  const [search, setSearch] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('Semua');
  const [selectedReportId, setSelectedReportId] = useState<string>(
    fieldReports[0]?.id || ''
  );

  // Modal for New Field Report
  const [isNewReportModalOpen, setIsNewReportModalOpen] = useState(false);
  const [reportForm, setReportForm] = useState({
    projectId: projects[0]?.id || '',
    weatherMorning: 'Cerah' as const,
    weatherAfternoon: 'Hujan Ringan' as const,
    workingHours: '8',
    siteSupervisor: 'Suryanto (Pengawas Lapangan)',
    tukangCount: '45',
    helperCount: '30',
    completedWork: 'Pengecoran balok zona C lantai 22 dan perakitan rebar kolom.',
    blockers: 'Hujan sore selama 40 menit, pekerjaan luar ditunda sebentar.',
  });

  // Modal for Requesting Revision
  const [isRevisionModalOpen, setIsRevisionModalOpen] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState('Volume pengecoran beton belum dilengkapi lampiran delivery ticket readymix.');

  const selectedReport =
    fieldReports.find((r) => r.id === selectedReportId) || fieldReports[0] || null;

  const filteredReports = useMemo(() => {
    return fieldReports.filter((r) => {
      const matchSearch =
        r.reportNumber.toLowerCase().includes(search.toLowerCase()) ||
        r.projectName.toLowerCase().includes(search.toLowerCase()) ||
        r.siteSupervisor.toLowerCase().includes(search.toLowerCase());

      const matchProj =
        selectedProjectId === 'Semua' || r.projectId === selectedProjectId;

      return matchSearch && matchProj;
    });
  }, [fieldReports, search, selectedProjectId]);

  const [reportPhotos, setReportPhotos] = useState<File[]>([]);
  const [photoCaptions, setPhotoCaptions] = useState<string[]>(['', '', '']);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    const proj = projects.find((p) => p.id === reportForm.projectId);
    if (!proj) return;

    setIsSubmittingReport(true);
    try {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

      // Kompres seluruh foto yang dipilih (maks 3)
      const compressedPhotos: Array<{ id: string; blob: Blob; fileName: string; mimeType: string; sizeBytes: number; caption: string }> = [];
      const uiPhotos: Array<{ url: string; caption: string }> = [];

      for (let i = 0; i < reportPhotos.length; i++) {
        const file = reportPhotos[i];
        const res = await compressImage(file, 1600, 0.75);
        const caption = photoCaptions[i] || `Foto Fisik Lapangan ${i + 1}`;
        compressedPhotos.push({
          id: `photo-${Date.now()}-${i}`,
          blob: res.blob,
          fileName: res.fileName,
          mimeType: res.mimeType,
          sizeBytes: res.compressedSize,
          caption,
        });
        uiPhotos.push({
          url: URL.createObjectURL(res.blob),
          caption,
        });
      }

      if (isOffline) {
        // Simpan ke antrean offline IndexedDB dengan idempotency key
        await enqueueOfflineFieldReport({
          workspaceId: userProfile?.workspaceId || '',
          projectId: proj.id,
          projectName: proj.name,
          reportDate: new Date().toISOString().split('T')[0],
          weatherMorning: reportForm.weatherMorning,
          weatherAfternoon: reportForm.weatherAfternoon,
          workingHours: Number(reportForm.workingHours) || 8,
          siteSupervisor: reportForm.siteSupervisor,
          workforce: [
            { role: 'Tukang Besi & Cor', count: Number(reportForm.tukangCount) || 0 },
            { role: 'Helper & Pekerja Umum', count: Number(reportForm.helperCount) || 0 },
          ],
          completedWorks: [reportForm.completedWork],
          materialsUsed: [
            { name: 'Beton Readymix FC 35', quantity: '48 m³' },
            { name: 'Besi D16 BJTS 420B', quantity: '180 batang' },
          ],
          equipmentUsed: [
            { name: 'Tower Crane 01', hours: 7 },
            { name: 'Concrete Pump Trailer', hours: 5 },
          ],
          blockers: reportForm.blockers,
          photos: compressedPhotos,
        });

        // Tambah optimis ke layar agar pengawas tetap bisa melihat draft
        addFieldReport({
          projectId: proj.id,
          projectName: proj.name,
          date: new Date().toISOString().split('T')[0],
          weatherMorning: reportForm.weatherMorning,
          weatherAfternoon: reportForm.weatherAfternoon,
          workingHours: Number(reportForm.workingHours) || 8,
          siteSupervisor: reportForm.siteSupervisor,
          workforce: [
            { role: 'Tukang Besi & Cor', count: Number(reportForm.tukangCount) || 0 },
            { role: 'Helper & Pekerja Umum', count: Number(reportForm.helperCount) || 0 },
          ],
          completedWorks: [reportForm.completedWork],
          materialsUsed: [
            { name: 'Beton Readymix FC 35', quantity: '48 m³' },
            { name: 'Besi D16 BJTS 420B', quantity: '180 batang' },
          ],
          equipmentUsed: [
            { name: 'Tower Crane 01', hours: 7 },
            { name: 'Concrete Pump Trailer', hours: 5 },
          ],
          blockers: reportForm.blockers,
          photos: uiPhotos.length > 0 ? uiPhotos : [
            {
              url: 'https://images.unsplash.com/photo-1541888946425-d0fbb18615f3?auto=format&fit=crop&w=800&q=80',
              caption: 'Inspeksi penulangan slab lantai zona C sebelum pengecoran',
            },
          ],
        });

        addToast({
          type: 'warning',
          title: 'Tersimpan di Antrean Offline (Mode Pesawat)',
          message: `Laporan dan ${compressedPhotos.length} foto disimpan di memori perangkat. Akan otomatis disinkronkan saat online.`,
        });
      } else {
        // Online: simpan langsung
        addFieldReport({
          projectId: proj.id,
          projectName: proj.name,
          date: new Date().toISOString().split('T')[0],
          weatherMorning: reportForm.weatherMorning,
          weatherAfternoon: reportForm.weatherAfternoon,
          workingHours: Number(reportForm.workingHours) || 8,
          siteSupervisor: reportForm.siteSupervisor,
          workforce: [
            { role: 'Tukang Besi & Cor', count: Number(reportForm.tukangCount) || 0 },
            { role: 'Helper & Pekerja Umum', count: Number(reportForm.helperCount) || 0 },
          ],
          completedWorks: [reportForm.completedWork],
          materialsUsed: [
            { name: 'Beton Readymix FC 35', quantity: '48 m³' },
            { name: 'Besi D16 BJTS 420B', quantity: '180 batang' },
          ],
          equipmentUsed: [
            { name: 'Tower Crane 01', hours: 7 },
            { name: 'Concrete Pump Trailer', hours: 5 },
          ],
          blockers: reportForm.blockers,
          photos: uiPhotos.length > 0 ? uiPhotos : [
            {
              url: 'https://images.unsplash.com/photo-1541888946425-d0fbb18615f3?auto=format&fit=crop&w=800&q=80',
              caption: 'Inspeksi penulangan slab lantai zona C sebelum pengecoran',
            },
          ],
        });

        addToast({
          type: 'success',
          title: 'Laporan Diterbitkan',
          message: `Laporan harian berhasil dikirim ke server.`,
        });
      }

      setReportPhotos([]);
      setPhotoCaptions(['', '', '']);
      setIsNewReportModalOpen(false);
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Gagal Menyimpan Laporan',
        message: err.message,
      });
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleReviewAction = async (status: FieldReportStatus, notes?: string) => {
    if (!selectedReport) return;

    if (status === 'Disetujui' && !canApproveReport) {
      addToast({
        type: 'danger',
        title: 'Akses Ditolak',
        message: 'Hanya Manajer Proyek atau Direksi yang berwenang memberikan paraf persetujuan resmi.',
      });
      return;
    }

    const reviewer = userProfile?.name || currentUser?.displayName || `${activeRole}`;
    await reviewFieldReport(selectedReport.id, reviewer, status, notes);

    if (status === 'Perlu Revisi') {
      setIsRevisionModalOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E2E8E4]">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#69766F] mb-1">
            <span>Operasional Lapangan</span>
            <span aria-hidden="true">·</span>
            <span>Laporan Harian Proyek (LHP) & Tata Kelola Inspeksi</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#202B26]">
            Laporan Harian & Pengawasan Site
          </h1>
          <p className="text-xs text-[#69766F] mt-0.5">
            Dokumentasi kemajuan kerja mandor, absensi tukang, cuaca site, kendala teknis K3, dan alur verifikasi resmi
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => setIsNewReportModalOpen(true)}
          className="self-start sm:self-auto"
        >
          Buat Laporan Harian
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Laporan Terbit"
          value={`${fieldReports.length} Laporan`}
          subtitle="Arsip digital terpusat"
          icon={<FileCheck2 className="w-4 h-4 text-[#12352B]" />}
        />
        <MetricCard
          label="Telah Disetujui PM"
          value={`${fieldReports.filter((r) => r.status === 'Disetujui').length} Laporan`}
          subtitle="Verifikasi konsultan pengawas lengkap"
          trend={{ value: '100% Sah', isPositive: true }}
          icon={<CheckCircle2 className="w-4 h-4 text-[#1C6843]" />}
        />
        <MetricCard
          label="Jam Kerja Efektif Rata-rata"
          value="8,2 Jam / Hari"
          subtitle="Toleransi lembur cuaca 1,5 jam"
          icon={<Clock className="w-4 h-4 text-[#285744]" />}
        />
        <MetricCard
          label="Catatan Kendala & K3"
          value={`${fieldReports.filter((r) => r.blockers).length} Catatan`}
          subtitle="Semua blocker tertangani di site"
          trend={{ value: 'Zero Incident', isPositive: true }}
          icon={<AlertTriangle className="w-4 h-4 text-[#9E6B05]" />}
        />
      </div>

      {/* Main Layout: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Report List */}
        <div className="lg:col-span-1 space-y-3">
          <div className="bg-white p-3 rounded-xl border border-[#E2E8E4] shadow-2xs space-y-2">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Cari nomor, pengawas, proyek..."
            />

            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full h-8 bg-white border border-[#E2E8E4] rounded-lg px-2 text-xs font-medium text-[#202B26] focus:outline-none focus:border-[#12352B] cursor-pointer"
            >
              <option value="Semua">Semua Proyek</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* List of Reports */}
          <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
            {filteredReports.map((report) => {
              const isSelected = selectedReport?.id === report.id;
              const totalWorkers = report.workforce.reduce((a, b) => a + b.count, 0);

              const statusVariant =
                report.status === 'Disetujui'
                  ? 'success'
                  : report.status === 'Diverifikasi'
                  ? 'primary'
                  : report.status === 'Perlu Revisi'
                  ? 'danger'
                  : 'neutral';

              return (
                <div
                  key={report.id}
                  onClick={() => setSelectedReportId(report.id)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer text-xs ${
                    isSelected
                      ? 'bg-white border-[#12352B] shadow-sm ring-1 ring-[#12352B]'
                      : 'bg-white border-[#E2E8E4] hover:border-[#CBD5CF]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono font-bold text-[#12352B]">
                      {report.reportNumber}
                    </span>
                    <Badge variant={statusVariant} size="sm" dot>
                      {report.status}
                    </Badge>
                  </div>

                  <div className="font-semibold text-[#202B26] mb-1 leading-snug">
                    {report.projectName}
                  </div>

                  <div className="text-xs text-[#69766F] space-y-1">
                    <div className="flex justify-between">
                      <span>Tanggal:</span>
                      <span className="font-mono tabular-nums text-[#202B26]">
                        {formatDateIndo(report.date)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pengawas:</span>
                      <span className="text-[#202B26]">{report.siteSupervisor.split(' ')[0]}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tenaga Kerja:</span>
                      <span className="font-mono tabular-nums text-[#202B26]">
                        {totalWorkers} Orang
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Detailed Report Inspection Card */}
        {selectedReport ? (
          <div className="lg:col-span-2 bg-white rounded-xl border border-[#E2E8E4] shadow-2xs p-6 space-y-6">
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-[#E2E8E4]">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono font-bold text-sm text-[#12352B]">
                    {selectedReport.reportNumber}
                  </span>
                  <Badge
                    variant={
                      selectedReport.status === 'Disetujui'
                        ? 'success'
                        : selectedReport.status === 'Diverifikasi'
                        ? 'primary'
                        : selectedReport.status === 'Perlu Revisi'
                        ? 'danger'
                        : 'neutral'
                    }
                    size="sm"
                    dot
                  >
                    {selectedReport.status}
                  </Badge>
                </div>
                <h2 className="text-base font-bold text-[#202B26]">
                  {selectedReport.projectName}
                </h2>
                <div className="text-xs text-[#69766F] mt-1 flex items-center gap-2">
                  <span>Tanggal Kerja: {formatDateIndo(selectedReport.date, true)}</span>
                  <span>·</span>
                  <span>Jam Kerja: {selectedReport.workingHours} Jam Efektif</span>
                </div>
              </div>

              <div className="flex flex-col sm:items-end gap-2 text-xs">
                <Button
                  variant="secondary"
                  size="xs"
                  leftIcon={<Printer className="w-3.5 h-3.5" />}
                  onClick={() => generateFieldReportPDF(selectedReport)}
                  className="min-h-[44px]"
                >
                  Cetak PDF (A4)
                </Button>
                <div className="text-right">
                  <span className="text-[#69766F] block text-xs">Pengawas Pembuat Laporan</span>
                  <span className="font-semibold text-[#202B26]">{selectedReport.siteSupervisor}</span>
                </div>
              </div>
            </div>

            {/* Approval / Review Verification Status Box */}
            <div className="p-3.5 rounded-lg border border-[#E2E8E4] bg-[#FAFBFB] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 font-semibold text-[#202B26]">
                  {selectedReport.status === 'Disetujui' ? (
                    <>
                      <ShieldCheck className="w-4 h-4 text-[#1C6843]" />
                      <span className="text-[#1C6843]">Laporan Resmi Telah Disetujui (Sign-off PM)</span>
                    </>
                  ) : selectedReport.status === 'Diverifikasi' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-[#285744]" />
                      <span className="text-[#285744]">Telah Diverifikasi Lapangan (Menunggu Sign-off PM)</span>
                    </>
                  ) : selectedReport.status === 'Perlu Revisi' ? (
                    <>
                      <AlertTriangle className="w-4 h-4 text-[#A82A20]" />
                      <span className="text-[#A82A20]">Dikembalikan untuk Perbaikan (Perlu Revisi)</span>
                    </>
                  ) : (
                    <>
                      <Clock className="w-4 h-4 text-[#9E6B05]" />
                      <span className="text-[#9E6B05]">Draft Laporan (Belum Diverifikasi)</span>
                    </>
                  )}
                </div>
                {selectedReport.verifiedBy && (
                  <p className="text-[#69766F] text-xs">
                    Diverifikasi oleh: <strong className="text-[#202B26]">{selectedReport.verifiedBy}</strong>
                    {selectedReport.verifiedAt && ` pada ${formatDateIndo(selectedReport.verifiedAt.split('T')[0])}`}
                  </p>
                )}
                {selectedReport.reviewerNotes && (
                  <p className="text-xs text-[#A82A20] font-medium bg-[#FCE8E6] p-1.5 rounded mt-1">
                    Catatan Review: {selectedReport.reviewerNotes}
                  </p>
                )}
              </div>

              {/* Action Buttons for Review */}
              <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                {selectedReport.status !== 'Disetujui' && (
                  <>
                    {selectedReport.status === 'Draft' && (
                      <Button
                        variant="secondary"
                        size="xs"
                        leftIcon={<Check className="w-3 h-3" />}
                        onClick={() => handleReviewAction('Diverifikasi')}
                      >
                        Verifikasi Site
                      </Button>
                    )}

                    {canApproveReport ? (
                      <>
                        <Button
                          variant="primary"
                          size="xs"
                          leftIcon={<ShieldCheck className="w-3 h-3" />}
                          onClick={() => handleReviewAction('Disetujui')}
                        >
                          Setujui (PM)
                        </Button>
                        <Button
                          variant="danger"
                          size="xs"
                          leftIcon={<XCircle className="w-3 h-3" />}
                          onClick={() => setIsRevisionModalOpen(true)}
                        >
                          Minta Revisi
                        </Button>
                      </>
                    ) : (
                      <span className="text-xs text-[#9E6B05] bg-[#FFF8EC] px-2 py-1 rounded border border-[#FCE6B1]">
                        Menunggu Paraf PM
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Weather & Workforce Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-lg bg-[#FAFBFB] border border-[#E2E8E4]">
                <div className="flex items-center gap-2 font-semibold text-[#202B26] mb-2">
                  <CloudSun className="w-4 h-4 text-[#9E6B05]" />
                  <span>Kondisi Cuaca Lapangan</span>
                </div>
                <div className="space-y-1 text-[#69766F]">
                  <div className="flex justify-between">
                    <span>Sesi Pagi:</span>
                    <span className="font-medium text-[#202B26]">{selectedReport.weatherMorning}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Sesi Siang/Sore:</span>
                    <span className="font-medium text-[#202B26]">{selectedReport.weatherAfternoon}</span>
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-[#FAFBFB] border border-[#E2E8E4]">
                <div className="flex items-center gap-2 font-semibold text-[#202B26] mb-2">
                  <Users className="w-4 h-4 text-[#285744]" />
                  <span>Rekapitulasi Tenaga Kerja</span>
                </div>
                <div className="space-y-1 text-[#69766F]">
                  {selectedReport.workforce.map((w, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span>{w.role}:</span>
                      <span className="font-mono font-medium text-[#202B26] tabular-nums">
                        {w.count} org
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Completed Works List */}
            <div>
              <h3 className="text-xs font-bold text-[#202B26] uppercase tracking-wider mb-2">
                Pekerjaan Terlaksana Hari Ini:
              </h3>
              <ul className="list-disc pl-5 space-y-1.5 text-xs text-[#202B26]">
                {selectedReport.completedWorks.map((work, idx) => (
                  <li key={idx} className="leading-relaxed">
                    {work}
                  </li>
                ))}
              </ul>
            </div>

            {/* Materials & Equipment */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <h4 className="font-bold text-[#202B26] mb-2">Pemakaian Material:</h4>
                <div className="bg-[#FAFBFB] rounded-lg p-3 border border-[#E2E8E4] space-y-1.5">
                  {selectedReport.materialsUsed.map((m, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span className="text-[#69766F]">{m.name}</span>
                      <span className="font-mono font-semibold text-[#202B26] tabular-nums">
                        {m.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-bold text-[#202B26] mb-2">Alat Berat Beroperasi:</h4>
                <div className="bg-[#FAFBFB] rounded-lg p-3 border border-[#E2E8E4] space-y-1.5">
                  {selectedReport.equipmentUsed.map((eq, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span className="text-[#69766F]">{eq.name}</span>
                      <span className="font-mono font-semibold text-[#202B26] tabular-nums">
                        {eq.hours} jam
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Blockers / Kendala */}
            {selectedReport.blockers && (
              <div className="p-3.5 rounded-lg bg-[#FFF8EC] border border-[#FCE6B1] text-xs">
                <div className="flex items-center gap-2 font-semibold text-[#9E6B05] mb-1">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Catatan Kendala / Safety K3:</span>
                </div>
                <p className="text-[#69766F] leading-relaxed">{selectedReport.blockers}</p>
              </div>
            )}

            {/* Photos Documentation */}
            {selectedReport.photos && selectedReport.photos.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-[#202B26] uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Camera className="w-4 h-4 text-[#69766F]" />
                  <span>Dokumentasi Foto Fisik Lapangan</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedReport.photos.map((photo, idx) => (
                    <div key={idx} className="rounded-lg overflow-hidden border border-[#E2E8E4] bg-[#FAFBFB]">
                      <div className="h-44 bg-slate-900 overflow-hidden">
                        <img
                          src={photo.url}
                          alt={photo.caption}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="p-2.5 text-xs text-[#4F5D56] bg-white">
                        {photo.caption}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Attachment Uploader & Signed URL Gallery */}
            <AttachmentUploader
              workspaceId={selectedReport.workspaceId || userProfile?.workspaceId || ''}
              recordType="field_report"
              recordId={selectedReport.id}
              title="Galeri Foto & Bukti Dokumen Lapangan Resmi"
            />
          </div>
        ) : (
          <div className="lg:col-span-2 bg-white rounded-xl border border-[#E2E8E4] p-12 text-center text-xs text-[#69766F]">
            Pilih laporan harian di sisi kiri untuk melihat detail lengkap.
          </div>
        )}
      </div>

      {/* Modal: Create Daily Report */}
      <Modal
        isOpen={isNewReportModalOpen}
        onClose={() => setIsNewReportModalOpen(false)}
        title="Input Laporan Harian Konstruksi"
        description="Catat progres harian mandor, absensi tukang, dan kendala cuaca untuk verifikasi konsultan pengawas."
        maxWidth="lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setIsNewReportModalOpen(false)} className="min-h-[44px]">
              Batal
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreateReport} disabled={isSubmittingReport} className="min-h-[44px]">
              {isSubmittingReport ? 'Menyimpan & Mengompres...' : 'Simpan & Terbitkan Laporan'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateReport} className="space-y-4 text-xs">
          <div>
            <label className="block font-medium text-[#202B26] mb-1">Pilih Proyek</label>
            <select
              value={reportForm.projectId}
              onChange={(e) => setReportForm({ ...reportForm, projectId: e.target.value })}
              className="w-full min-h-[44px] p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[#202B26] mb-1">Cuaca Pagi</label>
              <select
                value={reportForm.weatherMorning}
                onChange={(e) => setReportForm({ ...reportForm, weatherMorning: e.target.value as any })}
                className="w-full min-h-[44px] p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
              >
                <option value="Cerah">Cerah</option>
                <option value="Berawan">Berawan</option>
                <option value="Hujan Ringan">Hujan Ringan</option>
                <option value="Hujan Deras">Hujan Deras</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-[#202B26] mb-1">Cuaca Sore</label>
              <select
                value={reportForm.weatherAfternoon}
                onChange={(e) => setReportForm({ ...reportForm, weatherAfternoon: e.target.value as any })}
                className="w-full min-h-[44px] p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
              >
                <option value="Cerah">Cerah</option>
                <option value="Berawan">Berawan</option>
                <option value="Hujan Ringan">Hujan Ringan</option>
                <option value="Hujan Deras">Hujan Deras</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[#202B26] mb-1">Jumlah Tukang</label>
              <input
                type="number"
                value={reportForm.tukangCount}
                onChange={(e) => setReportForm({ ...reportForm, tukangCount: e.target.value })}
                className="w-full min-h-[44px] p-2 bg-white border border-[#E2E8E4] rounded-lg font-mono text-[#202B26]"
              />
            </div>

            <div>
              <label className="block font-medium text-[#202B26] mb-1">Jumlah Helper / Pekerja</label>
              <input
                type="number"
                value={reportForm.helperCount}
                onChange={(e) => setReportForm({ ...reportForm, helperCount: e.target.value })}
                className="w-full min-h-[44px] p-2 bg-white border border-[#E2E8E4] rounded-lg font-mono text-[#202B26]"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-[#202B26] mb-1">Uraian Pekerjaan Terlaksana</label>
            <textarea
              rows={2}
              value={reportForm.completedWork}
              onChange={(e) => setReportForm({ ...reportForm, completedWork: e.target.value })}
              className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26] min-h-[60px]"
            />
          </div>

          <div>
            <label className="block font-medium text-[#202B26] mb-1">Kendala / Catatan Khusus</label>
            <input
              type="text"
              value={reportForm.blockers}
              onChange={(e) => setReportForm({ ...reportForm, blockers: e.target.value })}
              className="w-full min-h-[44px] p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
            />
          </div>

          {/* Foto Dokumentasi Fisik Lapangan (Maks 3 Foto) */}
          <div className="p-3 bg-[#FAFBFB] rounded-lg border border-[#E2E8E4] space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block font-bold text-[#202B26]">
                Foto Dokumentasi Lapangan (Maks 3 Foto):
              </label>
              <span className="text-xs text-[#69766F] font-mono">{reportPhotos.length}/3 dipilih</span>
            </div>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []).slice(0, 3);
                setReportPhotos(files);
              }}
              className="w-full text-xs text-[#202B26] file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#12352B] file:text-white hover:file:bg-[#1C4D3F] cursor-pointer min-h-[44px]"
            />
            {reportPhotos.map((file, idx) => (
              <div key={idx} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                <span className="font-mono text-xs text-[#285744] shrink-0 truncate max-w-[140px]">
                  📷 {file.name}
                </span>
                <input
                  type="text"
                  placeholder={`Keterangan foto ${idx + 1} (contoh: Pengecoran Zona A)...`}
                  value={photoCaptions[idx] || ''}
                  onChange={(e) => {
                    const next = [...photoCaptions];
                    next[idx] = e.target.value;
                    setPhotoCaptions(next);
                  }}
                  className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26] min-h-[44px]"
                />
              </div>
            ))}
            <p className="text-xs text-[#69766F]">
              * Foto otomatis dikompres ke maks 1600px JPEG 75% di perangkat. Dapat diunggah saat offline / mode pesawat.
            </p>
          </div>
        </form>
      </Modal>

      {/* Modal: Request Revision on Field Report */}
      {isRevisionModalOpen && selectedReport && (
        <Modal
          isOpen={true}
          onClose={() => setIsRevisionModalOpen(false)}
          title={`Minta Revisi Laporan — ${selectedReport.reportNumber}`}
          description={`Kembalikan laporan ${selectedReport.projectName} ke ${selectedReport.siteSupervisor} untuk dilengkapi.`}
          maxWidth="md"
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={() => setIsRevisionModalOpen(false)}>
                Batal
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  if (!revisionNotes.trim()) {
                    addToast({
                      type: 'warning',
                      message: 'Catatan revisi wajib diisi untuk instruksi perbaikan.',
                    });
                    return;
                  }
                  handleReviewAction('Perlu Revisi', revisionNotes.trim());
                }}
              >
                Kirim Catatan Revisi
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-medium text-[#202B26] mb-1">
                Catatan Instruksi Perbaikan / Kekurangan Dokumen <span className="text-[#A82A20]">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
                placeholder="Contoh: Bukti foto pengecoran zona B belum terlampir, mohon upload foto rebar."
                className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26] focus:outline-none focus:border-[#12352B]"
              />
              <p className="text-xs text-[#69766F] mt-1">
                Catatan ini akan tersimpan permanen pada riwayat verifikasi laporan dan terkirim ke pengawas.
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
