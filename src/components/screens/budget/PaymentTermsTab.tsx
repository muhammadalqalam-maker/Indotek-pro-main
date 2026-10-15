/**
 * PaymentTermsTab.tsx
 * Jadwal Termin Pembayaran Proyek: Uang Muka, Termin, dan Retensi.
 * Finance Manager atau Owner yang dapat mengubah status (SoD).
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  CreditCard, Plus, Trash2, Edit2, RefreshCw, CheckCircle2,
  ChevronRight
} from 'lucide-react';
import { useUI } from '../../../context/UIContext';
import { useAuth } from '../../../context/AuthContext';
import { supabaseDataService } from '../../../services/supabaseDataService';
import { PaymentTerm, PaymentSchedule, PaymentTermJenis, PaymentTermStatus } from '../../../types/rab';
import { formatCurrencyIDR, formatPercent } from '../../../utils/formatters';

interface PaymentTermsTabProps {
  projectId: string;
  projectName: string;
}

const STATUS_BADGE: Record<PaymentTermStatus, { label: string; cls: string }> = {
  Draft:  { label: 'Draft',    cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  Tagih:  { label: 'Ditagih', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  Lunas:  { label: 'Lunas',   cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
};

const JENIS_OPTIONS: PaymentTermJenis[] = ['UangMuka', 'Termin', 'Retensi'];
const JENIS_LABEL: Record<PaymentTermJenis, string> = {
  UangMuka: 'Uang Muka',
  Termin:   'Termin',
  Retensi:  'Retensi',
};

export const PaymentTermsTab: React.FC<PaymentTermsTabProps> = ({ projectId, projectName }) => {
  const { workspaceId, addToast } = useUI();
  const { activeRole } = useAuth();

  const [schedule, setSchedule] = useState<PaymentSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTerm, setEditingTerm] = useState<PaymentTerm | null>(null);
  const [form, setForm] = useState({
    jenis: 'Termin' as PaymentTermJenis,
    urutan: 1,
    label: '',
    persen: '',
    keterangan: '',
    masaPemeliharaanHari: '',
  });
  const [formSaving, setFormSaving] = useState(false);
  const [statusTerm, setStatusTerm] = useState<PaymentTerm | null>(null);
  const [statusTarget, setStatusTarget] = useState<'Tagih' | 'Lunas'>('Tagih');
  const [statusTanggal, setStatusTanggal] = useState(new Date().toISOString().split('T')[0]);
  const [statusKet, setStatusKet] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);

  const canChangeStatus = activeRole === 'Finance / Accounting' || activeRole === 'Owner / Director';

  const showToast = (msg: string, type: 'success' | 'warning' | 'danger' | 'info' = 'info') =>
    addToast({ type, title: type === 'danger' ? 'Kesalahan' : type === 'success' ? 'Sukses' : 'Info', message: msg });

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await supabaseDataService.getPaymentSchedule(projectId, workspaceId);
      setSchedule(data);
    } catch (err: any) {
      showToast('Gagal memuat jadwal termin: ' + err.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [projectId, workspaceId]);

  const totalPersen = useMemo(() => schedule?.summary.totalPersen ?? 0, [schedule]);
  const sisaPersen = Math.max(0, 100 - totalPersen);

  const openAddModal = () => {
    setEditingTerm(null);
    const nextUrutan = (schedule?.terms.length ?? 0) + 1;
    setForm({ jenis: 'Termin', urutan: nextUrutan, label: '', persen: '', keterangan: '', masaPemeliharaanHari: '' });
    setShowModal(true);
  };

  const openEditModal = (term: PaymentTerm) => {
    setEditingTerm(term);
    setForm({
      jenis: term.jenis,
      urutan: term.urutan,
      label: term.label,
      persen: String(term.persen),
      keterangan: term.keterangan || '',
      masaPemeliharaanHari: term.masaPemeliharaanHari ? String(term.masaPemeliharaanHari) : '',
    });
    setShowModal(true);
  };

  const handleSaveTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    const persen = parseFloat(form.persen);
    if (isNaN(persen) || persen <= 0 || persen > 100) {
      showToast('Persentase harus antara 0.01 dan 100.', 'warning');
      return;
    }
    setFormSaving(true);
    try {
      const res = await supabaseDataService.upsertPaymentTerm({
        workspaceId,
        projectId,
        id: editingTerm?.id,
        jenis: form.jenis,
        urutan: form.urutan,
        label: form.label,
        persen,
        masaPemeliharaanHari: form.masaPemeliharaanHari ? parseInt(form.masaPemeliharaanHari) : null,
        keterangan: form.keterangan || null,
      });
      showToast(res.message + ' Nominal: ' + formatCurrencyIDR(res.nominal), 'success');
      setShowModal(false);
      await loadData();
    } catch (err: any) {
      showToast('Gagal menyimpan termin: ' + err.message, 'danger');
    } finally {
      setFormSaving(false);
    }
  };

  const handleDelete = async (term: PaymentTerm) => {
    if (!window.confirm('Hapus termin "' + term.label + '"?')) return;
    try {
      const res = await supabaseDataService.deletePaymentTerm(projectId, term.id, workspaceId);
      showToast(res.message, 'success');
      await loadData();
    } catch (err: any) {
      showToast('Gagal menghapus termin: ' + err.message, 'danger');
    }
  };

  const openStatusModal = (term: PaymentTerm, target: 'Tagih' | 'Lunas') => {
    setStatusTerm(term);
    setStatusTarget(target);
    setStatusTanggal(new Date().toISOString().split('T')[0]);
    setStatusKet('');
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusTerm) return;
    setStatusSaving(true);
    try {
      const res = await supabaseDataService.updatePaymentTermStatus({
        workspaceId,
        projectId,
        id: statusTerm.id,
        status: statusTarget,
        tanggal: statusTanggal,
        keterangan: statusKet || undefined,
      });
      showToast(res.message, 'success');
      setStatusTerm(null);
      await loadData();
    } catch (err: any) {
      showToast('Gagal mengubah status: ' + err.message, 'danger');
    } finally {
      setStatusSaving(false);
    }
  };

  const summaryCards = [
    {
      label: 'Total Termin',
      value: formatCurrencyIDR(schedule?.summary.totalNominal ?? 0),
      sub: formatPercent(schedule?.summary.totalPersen ?? 0, 1) + ' dari kontrak',
      cls: 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700',
    },
    {
      label: 'Telah Ditagih',
      value: formatCurrencyIDR(schedule?.summary.totalTagih ?? 0),
      sub: (schedule?.summary.countTagih ?? 0) + ' termin',
      cls: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
    },
    {
      label: 'Sudah Lunas',
      value: formatCurrencyIDR(schedule?.summary.totalLunas ?? 0),
      sub: (schedule?.summary.countLunas ?? 0) + ' termin',
      cls: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800',
    },
    {
      label: 'Sisa Alokasi',
      value: formatPercent(sisaPersen, 1),
      sub: sisaPersen > 0 ? 'Belum dialokasikan' : 'Sudah penuh',
      cls: sisaPersen > 0
        ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
        : 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800',
    },
  ];

  return (
    <div className="space-y-6">
      {/* RINGKASAN PEMBAYARAN */}
      {schedule && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {summaryCards.map(card => (
            <div key={card.label} className={`p-4 rounded-xl border ${card.cls}`}>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{card.label}</div>
              <div className="text-lg font-bold font-mono text-slate-900 dark:text-white mt-1">{card.value}</div>
              <div className="text-xs text-slate-400 mt-0.5">{card.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* TOOLBAR */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-slate-800 dark:text-white text-sm">Jadwal Termin Pembayaran</h3>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadData} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition" title="Muat ulang">
            <RefreshCw className="w-4 h-4 text-slate-500" />
          </button>
          <button
            onClick={openAddModal}
            disabled={sisaPersen <= 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Termin</span>
          </button>
        </div>
      </div>

      {/* TABEL TERMIN */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-300 text-xs font-semibold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="py-3 px-4 w-8">No</th>
                <th className="py-3 px-4">Label Termin</th>
                <th className="py-3 px-4 w-24 text-center">Jenis</th>
                <th className="py-3 px-4 text-right w-20">Persen</th>
                <th className="py-3 px-4 text-right w-36">Nominal (Rp)</th>
                <th className="py-3 px-4 text-center w-24">Status</th>
                <th className="py-3 px-4 text-center w-28">Tanggal</th>
                <th className="py-3 px-4 text-center w-32">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
                    Memuat...
                  </td>
                </tr>
              ) : !schedule?.terms.length ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center">
                    <CreditCard className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                    <p className="font-semibold text-slate-700 dark:text-slate-300">Belum ada jadwal termin</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Klik &quot;Tambah Termin&quot; untuk membuat termin uang muka, termin, atau retensi.
                    </p>
                  </td>
                </tr>
              ) : (
                schedule.terms.map((term, idx) => (
                  <tr key={term.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-700/20 transition group">
                    <td className="py-3 px-4 text-center text-xs text-slate-400 font-mono">{idx + 1}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">{term.label}</div>
                      {term.keterangan && (
                        <div className="text-xs text-slate-400 truncate max-w-xs">{term.keterangan}</div>
                      )}
                      {term.masaPemeliharaanHari && (
                        <div className="text-xs text-slate-400">
                          Masa pemeliharaan: {term.masaPemeliharaanHari} hari
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                        {JENIS_LABEL[term.jenis]}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700 dark:text-slate-300">
                      {formatPercent(term.persen, 1)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {formatCurrencyIDR(term.nominal)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[term.status].cls}`}>
                        {STATUS_BADGE[term.status].label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center text-xs text-slate-400">
                      {term.status === 'Lunas' && term.tanggalLunas
                        ? term.tanggalLunas
                        : term.status === 'Tagih' && term.tanggalTagih
                        ? term.tanggalTagih
                        : '\u2014'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition">
                        {term.status === 'Draft' && (
                          <>
                            <button
                              onClick={() => openEditModal(term)}
                              className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-600 transition"
                              title="Edit"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            {canChangeStatus && (
                              <button
                                onClick={() => openStatusModal(term, 'Tagih')}
                                className="p-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-600 transition"
                                title="Tagih"
                              >
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(term)}
                              className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 text-red-500 transition"
                              title="Hapus"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {term.status === 'Tagih' && canChangeStatus && (
                          <button
                            onClick={() => openStatusModal(term, 'Lunas')}
                            className="p-1.5 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-600 transition"
                            title="Tandai Lunas"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {term.status === 'Lunas' && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL FORM TERMIN */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-5 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {editingTerm ? 'Edit Termin' : 'Tambah Termin Pembayaran'}
              </h2>
            </div>
            <form onSubmit={handleSaveTerm} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Jenis *</label>
                  <select
                    value={form.jenis}
                    onChange={e => setForm(f => ({ ...f, jenis: e.target.value as PaymentTermJenis }))}
                    className="mt-1 w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  >
                    {JENIS_OPTIONS.map(j => <option key={j} value={j}>{JENIS_LABEL[j]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Urutan *</label>
                  <input
                    type="number" min={1}
                    value={form.urutan}
                    onChange={e => setForm(f => ({ ...f, urutan: parseInt(e.target.value) || 1 }))}
                    className="mt-1 w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Label Termin</label>
                <input
                  type="text"
                  placeholder={JENIS_LABEL[form.jenis] + ' ' + form.urutan}
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Persentase (%) * {'\u2014'} Sisa: {formatPercent(sisaPersen + (editingTerm ? editingTerm.persen : 0), 1)}
                </label>
                <input
                  type="number" min={0.01} max={100} step={0.01} required placeholder="0.00"
                  value={form.persen}
                  onChange={e => setForm(f => ({ ...f, persen: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
                />
                <p className="text-xs text-slate-400 mt-0.5">
                  Nominal dihitung server dari nilai kontrak (budget_lines). Tidak dapat diinput manual.
                </p>
              </div>
              {form.jenis === 'Retensi' && (
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Masa Pemeliharaan (hari)</label>
                  <input
                    type="number" min={1} placeholder="180"
                    value={form.masaPemeliharaanHari}
                    onChange={e => setForm(f => ({ ...f, masaPemeliharaanHari: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Keterangan</label>
                <textarea
                  rows={2} placeholder="Uraian kondisi pembayaran (opsional)..."
                  value={form.keterangan}
                  onChange={e => setForm(f => ({ ...f, keterangan: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white resize-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button" onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition"
                >
                  Batal
                </button>
                <button
                  type="submit" disabled={formSaving}
                  className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-50"
                >
                  {formSaving ? 'Menyimpan...' : 'Simpan Termin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL UPDATE STATUS */}
      {statusTerm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-5 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Tandai {statusTarget === 'Tagih' ? 'Ditagih' : 'Lunas'}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {statusTerm.label} {'\u2014'} {formatCurrencyIDR(statusTerm.nominal)}
              </p>
            </div>
            <form onSubmit={handleUpdateStatus} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Tanggal {statusTarget === 'Tagih' ? 'Tagihan' : 'Pelunasan'} *
                </label>
                <input
                  type="date" required value={statusTanggal}
                  onChange={e => setStatusTanggal(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Catatan (opsional)</label>
                <input
                  type="text" placeholder="No. kwitansi, bank transfer, dll."
                  value={statusKet} onChange={e => setStatusKet(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button" onClick={() => setStatusTerm(null)}
                  className="flex-1 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 rounded-lg transition"
                >
                  Batal
                </button>
                <button
                  type="submit" disabled={statusSaving}
                  className={`flex-1 px-4 py-2 text-sm font-semibold text-white rounded-lg transition disabled:opacity-50 ${statusTarget === 'Lunas' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'}`}
                >
                  {statusSaving ? 'Menyimpan...' : 'Konfirmasi ' + (statusTarget === 'Tagih' ? 'Tagih' : 'Lunas')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
