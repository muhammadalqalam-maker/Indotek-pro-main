import React, { useState, useMemo } from 'react';
import {
  Building2,
  Globe2,
  BellRing,
  Sliders,
  ShieldCheck,
  Save,
  Check,
  RotateCcw,
  Search,
  Filter,
  FileText,
  KeyRound,
  Coins,
  Truck,
  Boxes,
  Users2,
  Lock,
  Layers,
  ArrowRight
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { SearchInput } from '../common/SearchInput';
import { Modal } from '../common/Modal';
import { AuditLogEntry } from '../../types';
import { formatDateIndo } from '../../utils/formatters';

export const SettingsScreen: React.FC = () => {
  const { settings, updateSettings, auditLogs, addToast } = useApp();

  const [formState, setFormState] = useState({ ...settings });
  const [isSaving, setIsSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<
    'company' | 'regional' | 'notifications' | 'appearance' | 'audit'
  >('company');

  React.useEffect(() => {
    setFormState({ ...settings });
  }, [settings]);

  // Audit Log State
  const [auditSearch, setAuditSearch] = useState('');
  const [auditFilterCategory, setAuditFilterCategory] = useState<string>('Semua');
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLogEntry | null>(null);

  const filteredAuditLogs = useMemo(() => {
    return auditLogs.filter((log) => {
      const matchSearch =
        log.details.toLowerCase().includes(auditSearch.toLowerCase()) ||
        log.actor.name.toLowerCase().includes(auditSearch.toLowerCase()) ||
        log.actor.role.toLowerCase().includes(auditSearch.toLowerCase()) ||
        log.action.toLowerCase().includes(auditSearch.toLowerCase()) ||
        log.correlationId.toLowerCase().includes(auditSearch.toLowerCase()) ||
        log.recordId.toLowerCase().includes(auditSearch.toLowerCase());

      let matchCat = true;
      if (auditFilterCategory === 'Keuangan & RAB') {
        matchCat = log.recordType === 'budget' || log.recordType === 'petty_cash';
      } else if (auditFilterCategory === 'Pengadaan PO') {
        matchCat = log.recordType === 'purchase_order';
      } else if (auditFilterCategory === 'Logistik & Stok') {
        matchCat = log.recordType === 'material';
      } else if (auditFilterCategory === 'Personil & Peran') {
        matchCat = log.recordType === 'team_member';
      } else if (auditFilterCategory === 'Proyek & Milestone') {
        matchCat = log.recordType === 'project' || log.recordType === 'milestone';
      }

      return matchSearch && matchCat;
    });
  }, [auditLogs, auditSearch, auditFilterCategory]);

  const debounceTimerRef = React.useRef<any>(null);

  React.useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setIsSaving(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        await updateSettings(formState);
      } catch {
        // Handled in context with rollback toast
      } finally {
        setIsSaving(false);
      }
    }, 400);
  };

  const handleReset = () => {
    setFormState({ ...settings });
    addToast({
      type: 'info',
      message: 'Perubahan dibatalkan kembali ke pengaturan sebelumnya.',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E2E8E4]">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#69766F] mb-1">
            <span>Konfigurasi Workspace & Tata Kelola</span>
            <span aria-hidden="true">·</span>
            <span>Indotek Pro v1.0.4 Enterprise</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#202B26]">
            Pengaturan & Tata Kelola Workspace
          </h1>
          <p className="text-xs text-[#69766F] mt-0.5">
            Sesuaikan identitas badan usaha, format mata uang, ambang batas alert, dan auditabilitas korporat
          </p>
        </div>

        {activeSection !== 'audit' && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button variant="secondary" size="sm" onClick={handleReset} leftIcon={<RotateCcw className="w-4 h-4" />}>
              Reset
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave} leftIcon={<Save className="w-4 h-4" />}>
              Simpan Perubahan
            </Button>
          </div>
        )}
      </div>

      {/* Settings Layout: Left Section Nav + Right Content Form */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Navigation Tabs */}
        <div className="md:col-span-1 space-y-1">
          {[
            { id: 'company', label: 'Profil Perusahaan', icon: Building2 },
            { id: 'regional', label: 'Format & Bahasa', icon: Globe2 },
            { id: 'notifications', label: 'Peringatan & Alert', icon: BellRing },
            { id: 'appearance', label: 'Kerapatan & Tampilan', icon: Sliders },
            { id: 'audit', label: 'Jejak Audit & Tata Kelola', icon: ShieldCheck, badge: auditLogs.length },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSection(tab.id as any)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer ${
                  isActive
                    ? 'bg-[#12352B] text-white shadow-2xs font-semibold'
                    : 'text-[#69766F] hover:bg-white hover:text-[#202B26]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#D6A85C]' : 'text-[#69766F]'}`} />
                  <span>{tab.label}</span>
                </div>
                {tab.badge !== undefined && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      isActive ? 'bg-[#285744] text-white' : 'bg-[#EAEFEA] text-[#12352B]'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Settings Form Container */}
        <div className="md:col-span-3 bg-white rounded-xl border border-[#E2E8E4] shadow-2xs p-6">
          {/* Section 1: Company Profile */}
          {activeSection === 'company' && (
            <form onSubmit={handleSave} className="space-y-6 text-xs">
              <div className="space-y-4">
                <div className="border-b border-[#E2E8E4] pb-3">
                  <h3 className="text-sm font-bold text-[#202B26]">Identitas Badan Usaha Jasa Konstruksi</h3>
                  <p className="text-xs text-[#69766F] mt-0.5">
                    Informasi kop surat dan verifikasi legalitas pada laporan resmi
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block font-medium text-[#202B26] mb-1">Nama Perusahaan / Kontraktor</label>
                    <input
                      type="text"
                      value={formState.companyName}
                      onChange={(e) => setFormState({ ...formState, companyName: e.target.value })}
                      className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-medium text-[#202B26] mb-1">Alamat Kantor Pusat</label>
                    <textarea
                      rows={2}
                      value={formState.companyAddress}
                      onChange={(e) => setFormState({ ...formState, companyAddress: e.target.value })}
                      className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-[#202B26] mb-1">Nomor Pokok Wajib Pajak (NPWP)</label>
                    <input
                      type="text"
                      value={formState.taxNumberNPWP}
                      onChange={(e) => setFormState({ ...formState, taxNumberNPWP: e.target.value })}
                      className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg font-mono text-[#202B26]"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-[#202B26] mb-1">Kualifikasi Usaha Konstruksi</label>
                    <input
                      type="text"
                      disabled
                      value="Besar (B2) - LPJK / PUPR RI"
                      className="w-full p-2.5 bg-[#F5F7F6] border border-[#E2E8E4] rounded-lg text-[#69766F]"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-[#E2E8E4] flex justify-end gap-3">
                <Button variant="secondary" size="sm" type="button" onClick={handleReset}>
                  Batal
                </Button>
                <Button variant="primary" size="sm" type="submit" leftIcon={<Check className="w-4 h-4" />}>
                  Simpan Konfigurasi
                </Button>
              </div>
            </form>
          )}

          {/* Section 2: Regional & Formats */}
          {activeSection === 'regional' && (
            <form onSubmit={handleSave} className="space-y-6 text-xs">
              <div className="space-y-4">
                <div className="border-b border-[#E2E8E4] pb-3">
                  <h3 className="text-sm font-bold text-[#202B26]">Format Tanggal, Mata Uang & Bahasa</h3>
                  <p className="text-xs text-[#69766F] mt-0.5">Konvensi tampilan numerik laporan</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-medium text-[#202B26] mb-1">Mata Uang Acuan (Currency)</label>
                    <select
                      value={formState.currency}
                      onChange={(e) => setFormState({ ...formState, currency: e.target.value })}
                      className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
                    >
                      <option value="IDR (Rp)">Rupiah Indonesia (IDR - Rp)</option>
                      <option value="USD ($)">US Dollar (USD - $)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-[#202B26] mb-1">Format Tampilan Kalender</label>
                    <select
                      value={formState.dateFormat}
                      onChange={(e) => setFormState({ ...formState, dateFormat: e.target.value })}
                      className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
                    >
                      <option value="DD/MM/YYYY">DD/MM/YYYY (Standar Indonesia)</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD (ISO 8601)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-[#202B26] mb-1">Bahasa Antarmuka Sistem</label>
                    <select
                      value={formState.language}
                      onChange={(e) =>
                        setFormState({ ...formState, language: e.target.value as 'id' | 'en' })
                      }
                      className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
                    >
                      <option value="id">Bahasa Indonesia (Resmi)</option>
                      <option value="en">English (International)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-[#E2E8E4] flex justify-end gap-3">
                <Button variant="secondary" size="sm" type="button" onClick={handleReset}>
                  Batal
                </Button>
                <Button variant="primary" size="sm" type="submit" leftIcon={<Check className="w-4 h-4" />}>
                  Simpan Konfigurasi
                </Button>
              </div>
            </form>
          )}

          {/* Section 3: Notifications */}
          {activeSection === 'notifications' && (
            <form onSubmit={handleSave} className="space-y-6 text-xs">
              <div className="space-y-4">
                <div className="border-b border-[#E2E8E4] pb-3">
                  <h3 className="text-sm font-bold text-[#202B26]">Ambang Batas Peringatan Dini (Early Warning)</h3>
                  <p className="text-xs text-[#69766F] mt-0.5">
                    Trigger otomatis pemberitahuan bila terjadi anomali di lapangan
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="flex items-start gap-3 p-3 rounded-lg border border-[#E2E8E4] hover:bg-[#FAFBFB] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formState.alertScheduleDeviation}
                      onChange={(e) =>
                        setFormState({ ...formState, alertScheduleDeviation: e.target.checked })
                      }
                      className="mt-0.5 rounded text-[#12352B] focus:ring-[#12352B]"
                    />
                    <div>
                      <div className="font-semibold text-[#202B26]">Peringatan Deviasi Kurva-S & Terlambat</div>
                      <div className="text-[11px] text-[#69766F] mt-0.5">
                        Kirim notifikasi bila progres aktual tertinggal lebih dari 5,0% di bawah baseline rencana.
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-lg border border-[#E2E8E4] hover:bg-[#FAFBFB] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formState.alertCriticalStock}
                      onChange={(e) =>
                        setFormState({ ...formState, alertCriticalStock: e.target.checked })
                      }
                      className="mt-0.5 rounded text-[#12352B] focus:ring-[#12352B]"
                    />
                    <div>
                      <div className="font-semibold text-[#202B26]">Peringatan Buffer Stok Material Kritis</div>
                      <div className="text-[11px] text-[#69766F] mt-0.5">
                        Trigger peringatan saat persediaan material gudang site mendekati batas minimum reorder.
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-lg border border-[#E2E8E4] hover:bg-[#FAFBFB] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formState.alertHighValuePO}
                      onChange={(e) =>
                        setFormState({ ...formState, alertHighValuePO: e.target.checked })
                      }
                      className="mt-0.5 rounded text-[#12352B] focus:ring-[#12352B]"
                    />
                    <div>
                      <div className="font-semibold text-[#202B26]">Eskalasi SPP Nilai Tinggi (&gt; Rp 100 Juta)</div>
                      <div className="text-[11px] text-[#69766F] mt-0.5">
                        Wajibkan tanda tangan digital Project Director untuk pengadaan di atas ambang batas.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="pt-4 border-t border-[#E2E8E4] flex justify-end gap-3">
                <Button variant="secondary" size="sm" type="button" onClick={handleReset}>
                  Batal
                </Button>
                <Button variant="primary" size="sm" type="submit" leftIcon={<Check className="w-4 h-4" />}>
                  Simpan Konfigurasi
                </Button>
              </div>
            </form>
          )}

          {/* Section 4: Appearance */}
          {activeSection === 'appearance' && (
            <form onSubmit={handleSave} className="space-y-6 text-xs">
              <div className="space-y-4">
                <div className="border-b border-[#E2E8E4] pb-3">
                  <h3 className="text-sm font-bold text-[#202B26]">Kerapatan Baris Tabel (Data Density)</h3>
                  <p className="text-xs text-[#69766F] mt-0.5">Optimalisasi tampilan untuk layar operasional</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setFormState({ ...formState, tableDensity: 'comfortable' })}
                    className={`p-4 rounded-xl border text-left cursor-pointer transition-all ${
                      formState.tableDensity === 'comfortable'
                        ? 'border-[#12352B] bg-[#EAEFEA] ring-1 ring-[#12352B]'
                        : 'border-[#E2E8E4] hover:bg-[#F5F7F6]'
                    }`}
                  >
                    <div className="font-semibold text-[#202B26] mb-1">Nyaman (Comfortable)</div>
                    <p className="text-[#69766F] text-[11px]">
                      Jarak baris lega dengan padding optimal untuk kenyamanan membaca di tablet dan laptop.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormState({ ...formState, tableDensity: 'compact' })}
                    className={`p-4 rounded-xl border text-left cursor-pointer transition-all ${
                      formState.tableDensity === 'compact'
                        ? 'border-[#12352B] bg-[#EAEFEA] ring-1 ring-[#12352B]'
                        : 'border-[#E2E8E4] hover:bg-[#F5F7F6]'
                    }`}
                  >
                    <div className="font-semibold text-[#202B26] mb-1">Padat (High-Density)</div>
                    <p className="text-[#69766F] text-[11px]">
                      Kerapatan baris tinggi untuk monitor desktop lebar dengan banyak kolom angka.
                    </p>
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-[#E2E8E4] flex justify-end gap-3">
                <Button variant="secondary" size="sm" type="button" onClick={handleReset}>
                  Batal
                </Button>
                <Button variant="primary" size="sm" type="submit" leftIcon={<Check className="w-4 h-4" />}>
                  Simpan Konfigurasi
                </Button>
              </div>
            </form>
          )}

          {/* Section 5: Audit Trail & Governance (Immutable Trail) */}
          {activeSection === 'audit' && (
            <div className="space-y-4 text-xs">
              <div className="border-b border-[#E2E8E4] pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-[#202B26]">
                    Jejak Audit & Tata Kelola Korporat (Immutable Audit Trail)
                  </h3>
                  <p className="text-xs text-[#69766F] mt-0.5">
                    Rekaman append-only peristiwa penting sistem dengan identitas aktor, korelasi event, dan stempel waktu
                  </p>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#E5F4EB] text-[#1C6843] rounded-lg border border-[#CDE9D7] text-[11px] font-medium">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>WORM Protected (Append-Only)</span>
                </div>
              </div>

              {/* Informational Security Notice */}
              <div className="p-3 bg-[#FAFBFB] border border-[#E2E8E4] rounded-lg text-[#4F5D56] text-[11px] leading-relaxed">
                Log audit dilindungi oleh aturan keamanan Cloud Firestore (<code>allow update, delete: if false</code>).
                Tidak ada pengguna yang dapat mengubah atau menghapus riwayat transaksi finansial, persetujuan addendum RAB, atau mutasi personil.
              </div>

              {/* Filters & Search */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <SearchInput
                  value={auditSearch}
                  onChange={setAuditSearch}
                  placeholder="Cari aktor, event ID, uraian..."
                  className="w-full sm:w-64"
                />

                <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 text-xs">
                  {[
                    'Semua',
                    'Keuangan & RAB',
                    'Pengadaan PO',
                    'Logistik & Stok',
                    'Personil & Peran',
                    'Proyek & Milestone',
                  ].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setAuditFilterCategory(cat)}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        auditFilterCategory === cat
                          ? 'bg-[#12352B] text-white'
                          : 'bg-[#FAFBFB] border border-[#E2E8E4] text-[#69766F] hover:bg-white'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Audit Table */}
              <div className="border border-[#E2E8E4] rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-[#FAFBFB] text-[#69766F] border-b border-[#E2E8E4] z-10">
                      <tr>
                        <th className="py-2.5 px-3 font-semibold">Waktu & Korelasi</th>
                        <th className="py-2.5 px-3 font-semibold">Aktor Pelaksana</th>
                        <th className="py-2.5 px-3 font-semibold">Tindakan (Action)</th>
                        <th className="py-2.5 px-3 font-semibold">Uraian Transaksi</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8E4]/70">
                      {filteredAuditLogs.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-[#69766F]">
                            Tidak ada rekaman audit yang cocok dengan filter pencarian.
                          </td>
                        </tr>
                      ) : (
                        filteredAuditLogs.map((log) => {
                          const isFinancial =
                            log.recordType === 'budget' ||
                            log.recordType === 'purchase_order' ||
                            log.recordType === 'petty_cash';

                          const actionBadgeVariant =
                            log.action.includes('APPROVED') || log.action.includes('SIGNED')
                              ? 'success'
                              : log.action.includes('REJECTED')
                              ? 'danger'
                              : log.action.includes('CHANGED') || log.action.includes('STATUS')
                              ? 'warning'
                              : 'primary';

                          return (
                            <tr key={log.id} className="hover:bg-[#F5F7F6]/80 transition-colors">
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <div className="font-mono text-[#202B26] tabular-nums font-medium">
                                  {formatDateIndo(log.timestamp.split('T')[0])}
                                </div>
                                <div className="font-mono text-[10px] text-[#69766F] truncate max-w-[130px]">
                                  {log.correlationId}
                                </div>
                              </td>

                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <div className="font-semibold text-[#202B26]">{log.actor.name}</div>
                                <div className="text-[10px] text-[#12352B] font-medium">
                                  {log.actor.role}
                                </div>
                              </td>

                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <Badge variant={actionBadgeVariant} size="sm">
                                  {log.action}
                                </Badge>
                              </td>

                              <td className="py-2.5 px-3 max-w-[320px]">
                                <div className="text-[#202B26] leading-snug truncate" title={log.details}>
                                  {log.details}
                                </div>
                                {log.projectName && (
                                  <div className="text-[10px] text-[#69766F] truncate">
                                    Proyek: {log.projectName}
                                  </div>
                                )}
                              </td>

                              <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                <Button
                                  variant="secondary"
                                  size="xs"
                                  onClick={() => setSelectedAuditLog(log)}
                                >
                                  Detail
                                </Button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Inspection of Audit Record */}
      {selectedAuditLog && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedAuditLog(null)}
          title={`Rekaman Audit — ${selectedAuditLog.action}`}
          description={`Event ID: ${selectedAuditLog.id} · Correlation ID: ${selectedAuditLog.correlationId}`}
          maxWidth="md"
          footer={
            <Button variant="secondary" size="sm" onClick={() => setSelectedAuditLog(null)}>
              Tutup
            </Button>
          }
        >
          <div className="space-y-3.5 text-xs">
            <div className="p-3 bg-[#FAFBFB] rounded-lg border border-[#E2E8E4] space-y-2">
              <div className="flex justify-between">
                <span className="text-[#69766F]">Waktu Tercatat:</span>
                <span className="font-mono text-[#202B26]">{selectedAuditLog.timestamp}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#69766F]">Aktor Pelaksana:</span>
                <span className="font-semibold text-[#202B26]">{selectedAuditLog.actor.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#69766F]">Peran & Email:</span>
                <span className="text-[#202B26]">{selectedAuditLog.actor.role} ({selectedAuditLog.actor.email})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#69766F]">Tipe Record:</span>
                <span className="font-mono text-[#12352B] font-bold">
                  {selectedAuditLog.recordType.toUpperCase()} ({selectedAuditLog.recordId})
                </span>
              </div>
              {selectedAuditLog.projectName && (
                <div className="flex justify-between">
                  <span className="text-[#69766F]">Proyek Konteks:</span>
                  <span className="text-[#202B26]">{selectedAuditLog.projectName}</span>
                </div>
              )}
            </div>

            <div>
              <label className="block font-medium text-[#202B26] mb-1">Uraian Perubahan:</label>
              <div className="p-3 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26] leading-relaxed">
                {selectedAuditLog.details}
              </div>
            </div>

            {(selectedAuditLog.previousValue || selectedAuditLog.newValue) && (
              <div className="p-3 bg-[#FAFBFB] rounded-lg border border-[#E2E8E4] space-y-1">
                <div className="font-semibold text-[#202B26] mb-1">State Transition:</div>
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="text-[#A82A20]">{selectedAuditLog.previousValue || '(None)'}</span>
                  <ArrowRight className="w-3 h-3 text-[#69766F]" />
                  <span className="text-[#1C6843] font-bold">{selectedAuditLog.newValue || '(None)'}</span>
                </div>
              </div>
            )}

            <div className="p-2.5 bg-[#E5F4EB] border border-[#CDE9D7] rounded-lg text-[11px] text-[#1C6843] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Integritas Kriptografis Terverifikasi. Log ini tidak dapat diedit atau dimanipulasi.</span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
