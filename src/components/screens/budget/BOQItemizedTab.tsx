/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * BOQItemizedTab.tsx
 * Modul Rincian Bill of Quantities (BOQ / RAB per Item Pekerjaan).
 * Dilengkapi integrasi AHSP PUPR 8/2023, rollup divisi otomatis ke budget_lines,
 * pengaturan tarif PPN 11%, kalkulasi bobot %, progres fisik, dan terbilang Rupiah.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet,
  Plus,
  Search,
  Trash2,
  Edit2,
  Sparkles,
  Calculator,
  RefreshCw,
  Percent,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  X,
  Layers,
  ArrowUpDown,
  BookOpen,
  Upload,
  Download,
  FileDown,
  Printer,
} from 'lucide-react';
import { useUI } from '../../../context/UIContext';
import { useAuth } from '../../../context/AuthContext';
import { supabaseDataService } from '../../../services/supabaseDataService';
import { DataCard } from '../../common/DataCard';
import { ResponsiveTable } from '../../common/ResponsiveTable';
import {
  BOQItem,
  BOQSummary,
  DivisionCategory,
  AHSPTemplate,
} from '../../../types/rab';
import { formatCurrencyIDR, formatQuantity, formatPercent, terbilangRupiah } from '../../../utils/formatters';
import { exportBOQToExcel, downloadBOQTemplate, parseBOQExcelFile } from '../../../utils/boqExcelUtils';
import { generateBoqPDF } from '../../../utils/pdfGenerator';

interface BOQItemizedTabProps {
  projectId: string;
  projectName: string;
  onRefreshProject?: () => void;
}

export const BOQItemizedTab: React.FC<BOQItemizedTabProps> = ({
  projectId,
  projectName,
  onRefreshProject,
}) => {
  const { workspaceId, addToast } = useUI();
  const { userProfile, activeRole } = useAuth();

  const [items, setItems] = useState<BOQItem[]>([]);
  const [summary, setSummary] = useState<BOQSummary | null>(null);
  const [ahspList, setAhspList] = useState<AHSPTemplate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDivision, setSelectedDivision] = useState<string>('Semua');

  // Modal State
  const [showItemModal, setShowItemModal] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<BOQItem | null>(null);
  const [form, setForm] = useState<{
    divisionCategory: DivisionCategory;
    kode: string;
    uraian: string;
    satuan: string;
    volume: string;
    hargaSatuan: string;
    ahspId: string;
    urutan: number;
  }>({
    divisionCategory: 'Pekerjaan Struktur',
    kode: '',
    uraian: '',
    satuan: 'm3',
    volume: '1',
    hargaSatuan: '0',
    ahspId: '',
    urutan: 0,
  });
  const [formSubmitting, setFormSubmitting] = useState<boolean>(false);

  // Modal Edit PPN
  const [showPpnModal, setShowPpnModal] = useState<boolean>(false);
  const [ppnInput, setPpnInput] = useState<string>('11');
  const [ppnSubmitting, setPpnSubmitting] = useState<boolean>(false);

  // Quick Progress Modal
  const [progItem, setProgItem] = useState<BOQItem | null>(null);
  const [progInput, setProgInput] = useState<string>('0');
  const [progSubmitting, setProgSubmitting] = useState<boolean>(false);

  // Import BOQ state
  const [importLoading, setImportLoading] = useState<boolean>(false);
  const importInputRef = React.useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: 'success' | 'warning' | 'info' | 'danger' = 'info') => {
    addToast({
      type,
      title: type === 'danger' ? 'Terjadi Kesalahan' : type === 'success' ? 'Sukses' : 'Pemberitahuan',
      message,
    });
  };

  // Muat data BOQ dan Ringkasan
  const loadData = async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const [boqData, boqSum, ahspData] = await Promise.all([
        supabaseDataService.getBOQItems(projectId, workspaceId),
        supabaseDataService.getProjectBOQSummary(projectId, workspaceId),
        supabaseDataService.getAHSPTemplates({ wsId: workspaceId }),
      ]);
      setItems(boqData);
      setSummary(boqSum);
      setAhspList(ahspData);
      if (boqSum) {
        setPpnInput(String(boqSum.ppnPercent));
      }
    } catch (err: any) {
      showToast('Gagal memuat BOQ proyek: ' + err.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [projectId, workspaceId]);

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchDiv = selectedDivision === 'Semua' || item.divisionCategory === selectedDivision;
      const q = searchQuery.toLowerCase().trim();
      const matchQuery = !q || item.kode.toLowerCase().includes(q) || item.uraian.toLowerCase().includes(q);
      return matchDiv && matchQuery;
    });
  }, [items, selectedDivision, searchQuery]);

  // Handler Pilih Template AHSP di Form
  const handleSelectAHSP = async (ahspId: string) => {
    if (!ahspId) {
      setForm((prev) => ({ ...prev, ahspId: '' }));
      return;
    }
    const tpl = ahspList.find((t) => t.id === ahspId);
    if (!tpl) return;

    try {
      const calc = await supabaseDataService.calculateAHSPUnitPrice(tpl.id, '', workspaceId);
      setForm((prev) => ({
        ...prev,
        ahspId: tpl.id,
        uraian: prev.uraian || tpl.nama,
        satuan: tpl.satuan,
        hargaSatuan: String(calc.totalHargaSatuan),
      }));
    } catch {
      setForm((prev) => ({
        ...prev,
        ahspId: tpl.id,
        uraian: prev.uraian || tpl.nama,
        satuan: tpl.satuan,
      }));
    }
  };

  // Buka Form Tambah / Edit
  const openItemModal = (item?: BOQItem) => {
    if (item) {
      setEditingItem(item);
      setForm({
        divisionCategory: item.divisionCategory,
        kode: item.kode,
        uraian: item.uraian,
        satuan: item.satuan,
        volume: String(item.volume),
        hargaSatuan: String(item.hargaSatuan),
        ahspId: item.ahspId || '',
        urutan: item.urutan,
      });
    } else {
      setEditingItem(null);
      const nextNo = items.length + 1;
      setForm({
        divisionCategory: 'Pekerjaan Struktur',
        kode: `ITEM-${String(nextNo).padStart(2, '0')}`,
        uraian: '',
        satuan: 'm3',
        volume: '1',
        hargaSatuan: '0',
        ahspId: '',
        urutan: nextNo,
      });
    }
    setShowItemModal(true);
  };

  // Simpan Item BOQ
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const vol = parseFloat(form.volume);
    const harga = parseInt(form.hargaSatuan.replace(/[^0-9]/g, ''), 10);
    if (isNaN(vol) || vol < 0) {
      showToast('Volume harus berupa angka non-negatif.', 'warning');
      return;
    }
    if (isNaN(harga) || harga < 0) {
      showToast('Harga satuan harus berupa nominal valid.', 'warning');
      return;
    }

    try {
      setFormSubmitting(true);
      const res = await supabaseDataService.upsertBOQItem({
        workspaceId,
        projectId,
        id: editingItem?.id,
        divisionCategory: form.divisionCategory,
        kode: form.kode.trim(),
        uraian: form.uraian.trim(),
        satuan: form.satuan.trim(),
        volume: vol,
        hargaSatuan: harga,
        ahspId: form.ahspId || null,
        urutan: form.urutan,
      });
      showToast(res.message, 'success');
      setShowItemModal(false);
      await loadData();
      onRefreshProject?.();
    } catch (err: any) {
      showToast('Gagal menyimpan item BOQ: ' + err.message, 'danger');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Hapus Item BOQ
  const handleDeleteItem = async (item: BOQItem) => {
    if (!window.confirm(`Hapus item BOQ "${item.uraian}" (${item.kode})?`)) return;
    try {
      const res = await supabaseDataService.deleteBOQItem(projectId, item.id, workspaceId);
      showToast(res.message, 'success');
      await loadData();
      onRefreshProject?.();
    } catch (err: any) {
      showToast('Gagal menghapus item: ' + err.message, 'danger');
    }
  };

  // Update PPN
  const handleSavePPN = async (e: React.FormEvent) => {
    e.preventDefault();
    const pct = parseFloat(ppnInput);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      showToast('Tarif PPN harus antara 0% dan 100%.', 'warning');
      return;
    }
    try {
      setPpnSubmitting(true);
      const res = await supabaseDataService.updateProjectPPN(projectId, pct, workspaceId);
      showToast(res.message, 'success');
      setShowPpnModal(false);
      await loadData();
    } catch (err: any) {
      showToast('Gagal mengubah PPN: ' + err.message, 'danger');
    } finally {
      setPpnSubmitting(false);
    }
  };

  // Update Progres Item
  const handleSaveProgress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!progItem) return;
    const p = parseFloat(progInput);
    if (isNaN(p) || p < 0 || p > 100) {
      showToast('Progres harus antara 0% dan 100%.', 'warning');
      return;
    }
    try {
      setProgSubmitting(true);
      const res = await supabaseDataService.updateBOQItemProgress(projectId, progItem.id, p, workspaceId);
      showToast(res.message, 'success');
      setProgItem(null);
      await loadData();
      onRefreshProject?.();
    } catch (err: any) {
      showToast('Gagal mengupdate progres: ' + err.message, 'danger');
    } finally {
      setProgSubmitting(false);
    }
  };

  // Generator Contoh RAB Nyata (20 Item Lengkap Berdasarkan AHSP PUPR 8/2023)
  const handleSeedRealRAB = async () => {
    if (!window.confirm('Buat 20 item RAB pekerjaan sipil standar dengan volume realistis pada proyek ini?')) {
      return;
    }

    try {
      setLoading(true);
      // Data volume dan acuan harga realistis 20 item
      const sampleItems = [
        { kode: '1.1', div: 'Pekerjaan Persiapan', uraian: 'Pembersihan lapangan dan perataan', sat: 'm2', vol: 250, harga: 24500 },
        { kode: '1.2', div: 'Pekerjaan Persiapan', uraian: 'Pengukuran dan pemasangan bowplank', sat: 'm1', vol: 64, harga: 65000 },
        { kode: '2.1', div: 'Pekerjaan Struktur', uraian: 'Galian tanah pondasi batu belah', sat: 'm3', vol: 54, harga: 110250 },
        { kode: '2.2', div: 'Pekerjaan Struktur', uraian: 'Urugan tanah kembali bekas galian', sat: 'm3', vol: 18, harga: 38500 },
        { kode: '2.3', div: 'Pekerjaan Struktur', uraian: 'Urugan pasir bawah pondasi tebal 10 cm', sat: 'm3', vol: 12, harga: 426800 },
        { kode: '2.4', div: 'Pekerjaan Struktur', uraian: 'Pasangan pondasi batu belah camp. 1:4', sat: 'm3', vol: 36, harga: 1321570 },
        { kode: '2.5', div: 'Pekerjaan Struktur', uraian: 'Lantai kerja beton mutu f\'c=7.4 MPa (B-0)', sat: 'm3', vol: 8.5, harga: 1085000 },
        { kode: '2.6', div: 'Pekerjaan Struktur', uraian: 'Beton struktur f\'c=19.3 MPa (K-225)', sat: 'm3', vol: 42, harga: 1450000 },
        { kode: '2.7', div: 'Pekerjaan Struktur', uraian: 'Pembesian dengan besi beton polos BjTP 280', sat: 'kg', vol: 1850, harga: 17500 },
        { kode: '2.8', div: 'Pekerjaan Struktur', uraian: 'Pembesian dengan besi beton ulir BjTS 420', sat: 'kg', vol: 3200, harga: 18200 },
        { kode: '2.9', div: 'Pekerjaan Struktur', uraian: 'Bekisting untuk sloof kayu kelas III', sat: 'm2', vol: 85, harga: 215000 },
        { kode: '2.10', div: 'Pekerjaan Struktur', uraian: 'Bekisting untuk kolom dan balok', sat: 'm2', vol: 140, harga: 345000 },
        { kode: '3.1', div: 'Pekerjaan Arsitektur', uraian: 'Pasangan dinding bata merah tebal 1/2 bata 1:4', sat: 'm2', vol: 280, harga: 165000 },
        { kode: '3.2', div: 'Pekerjaan Arsitektur', uraian: 'Plesteran dinding tebal 15 mm camp. 1:4', sat: 'm2', vol: 560, harga: 78500 },
        { kode: '3.3', div: 'Pekerjaan Arsitektur', uraian: 'Acian dinding semen', sat: 'm2', vol: 560, harga: 42000 },
        { kode: '3.4', div: 'Pekerjaan Arsitektur', uraian: 'Pengecatan dinding interior 3 lapis', sat: 'm2', vol: 560, harga: 38500 },
        { kode: '3.5', div: 'Pekerjaan Arsitektur', uraian: 'Pemasangan keramik lantai 40x40 cm', sat: 'm2', vol: 180, harga: 225000 },
        { kode: '3.6', div: 'Pekerjaan Arsitektur', uraian: 'Pemasangan plafon gypsum 9 mm + hollow', sat: 'm2', vol: 180, harga: 135000 },
        { kode: '3.7', div: 'Pekerjaan Arsitektur', uraian: 'Pemasangan rangka atap baja ringan', sat: 'm2', vol: 210, harga: 195000 },
        { kode: '3.8', div: 'Pekerjaan Arsitektur', uraian: 'Pemasangan penutup atap genteng metal pasir', sat: 'm2', vol: 210, harga: 125000 },
      ];

      for (let i = 0; i < sampleItems.length; i++) {
        const it = sampleItems[i];
        await supabaseDataService.upsertBOQItem({
          workspaceId,
          projectId,
          divisionCategory: it.div,
          kode: it.kode,
          uraian: it.uraian,
          satuan: it.sat,
          volume: it.vol,
          hargaSatuan: it.harga,
          urutan: i + 1,
        });
      }

      showToast('Berhasil membuat 20 item RAB pekerjaan sipil!', 'success');
      await loadData();
      onRefreshProject?.();
    } catch (err: any) {
      showToast('Gagal membuat contoh RAB: ' + err.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  // Ekspor BOQ ke Excel
  const handleExportExcel = () => {
    if (!summary) {
      showToast('Tidak ada data BOQ untuk diekspor.', 'warning');
      return;
    }
    try {
      exportBOQToExcel(summary, items, 'PT Indotek Karya Nusantara');
      showToast('BOQ berhasil diekspor ke Excel.', 'success');
    } catch (err: any) {
      showToast('Gagal mengekspor BOQ: ' + err.message, 'danger');
    }
  };

  // Impor BOQ dari Excel
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    try {
      const result = await parseBOQExcelFile(file);
      if (!result.success || result.rows.length === 0) {
        showToast('Gagal membaca file: ' + (result.errors[0] || 'Format tidak dikenali.'), 'danger');
        return;
      }
      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows[i];
        await supabaseDataService.upsertBOQItem({
          workspaceId,
          projectId,
          divisionCategory: row.divisionCategory,
          kode: row.kode,
          uraian: row.uraian,
          satuan: row.satuan,
          volume: row.volume,
          hargaSatuan: row.hargaSatuan,
          urutan: i + 1,
        });
      }
      showToast(`Berhasil mengimpor ${result.totalParsed} item BOQ dari Excel.`, 'success');
      await loadData();
      onRefreshProject?.();
    } catch (err: any) {
      showToast('Gagal mengimpor BOQ: ' + err.message, 'danger');
    } finally {
      setImportLoading(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* KARTU RINGKASAN BOQ / REKAPITULASI KONTRAK */}
      {summary && (
        <div className="bg-white  rounded-xl border border-border-subtle  p-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-canvas  border border-border-subtle ">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Subtotal BOQ (Fisik)</span>
              <div className="text-xl font-bold font-mono text-text-primary  mt-1">
                {formatCurrencyIDR(summary.subtotal)}
              </div>
              <span className="text-xs text-text-muted mt-1 block">{summary.totalItems} item pekerjaan</span>
            </div>

            <div className="p-4 rounded-xl bg-canvas  border border-border-subtle ">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">PPN ({summary.ppnPercent}%)</span>
                <button
                  onClick={() => setShowPpnModal(true)}
                  className="text-xs text-primary hover:underline font-semibold"
                >
                  Ubah
                </button>
              </div>
              <div className="text-xl font-bold font-mono text-warning  mt-1">
                {formatCurrencyIDR(summary.ppnNominal)}
              </div>
              <span className="text-xs text-text-muted mt-1 block">UU HPP No. 7/2021</span>
            </div>

            <div className="p-4 rounded-xl bg-primary/10  border border-primary/20 ">
              <span className="text-xs font-semibold text-primary  uppercase tracking-wider">
                Total Kontrak (Incl. PPN)
              </span>
              <div className="text-xl font-bold font-mono text-primary  mt-1">
                {formatCurrencyIDR(summary.grandTotal)}
              </div>
              <span className="text-xs text-primary/80  mt-1 block">Nilai Pagu Anggaran</span>
            </div>

            <div className="p-4 rounded-xl bg-success-bg  border border-success-border ">
              <span className="text-xs font-semibold text-success  uppercase tracking-wider">
                Progres Fisik Terbobot
              </span>
              <div className="text-xl font-bold font-mono text-success  mt-1">
                {formatPercent(summary.progressActual, 2)}
              </div>
              <span className="text-xs text-success/80  mt-1 block">
                Agregat dari bobot BOQ
              </span>
            </div>
          </div>

          {/* Kotak Terbilang Resmi */}
          <div className="mt-4 p-3.5 bg-canvas  rounded-lg border border-border-subtle  flex items-start gap-3">
            <BookOpen className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-semibold text-text-secondary ">Terbilang Resmi: </span>
              <span className="italic text-text-secondary  font-serif">
                &ldquo;{summary.terbilang}&rdquo;
              </span>
            </div>
          </div>

          {/* Rekapitulasi Baris Divisi yang Tersinkron ke budget_lines */}
          {summary.divisions && summary.divisions.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border-subtle ">
              <div className="text-xs font-semibold text-text-muted mb-2 uppercase tracking-wider">
                Rekapitulasi Divisi (Tersinkronisasi Otomatis ke Pagu Budget Lines)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {summary.divisions.map((d) => (
                  <div key={d.kategori} className="p-2.5 rounded-lg bg-neutral-bg  text-xs">
                    <div className="font-semibold truncate text-text-primary ">{d.kategori}</div>
                    <div className="font-mono text-text-secondary  mt-1">{formatCurrencyIDR(d.total)}</div>
                    <div className="text-xs text-text-muted mt-0.5 font-mono">{formatPercent(d.bobotPersen, 2)} bobot</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TOOLBAR & FILTER */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white  p-4 rounded-xl border border-border-subtle ">
        <div className="flex items-center gap-3 w-full md:w-auto flex-1">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Cari kode item atau uraian pekerjaan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-canvas  border border-border-subtle  rounded-lg focus:ring-2 focus:ring-primary text-text-primary "
            />
          </div>

          <select
            value={selectedDivision}
            onChange={(e) => setSelectedDivision(e.target.value)}
            className="px-3 py-2 text-sm bg-canvas  border border-border-subtle  rounded-lg text-text-primary "
          >
            <option value="Semua">Semua Divisi</option>
            <option value="Pekerjaan Persiapan">Pekerjaan Persiapan</option>
            <option value="Pekerjaan Struktur">Pekerjaan Struktur</option>
            <option value="Pekerjaan Arsitektur">Pekerjaan Arsitektur</option>
            <option value="Pekerjaan MEP">Pekerjaan MEP</option>
            <option value="Manajemen & Overhead">Manajemen & Overhead</option>
          </select>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap">
          {items.length === 0 && (
            <button
              onClick={handleSeedRealRAB}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-text-primary  bg-warning-bg hover:bg-warning-bg rounded-lg transition"
              title="Buat 20 item contoh RAB pekerjaan sipil"
            >
              <Sparkles className="w-3.5 h-3.5 text-warning" />
              <span>Contoh 20 Item RAB</span>
            </button>
          )}

          {/* Unduh Template Excel */}
          <button
            onClick={downloadBOQTemplate}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-text-secondary  bg-neutral-bg hover:bg-neutral-bg   rounded-lg transition"
            title="Unduh template Excel kosong untuk impor BOQ"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Template Excel</span>
          </button>

          {/* Impor BOQ dari Excel */}
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleImportFile}
          />
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={importLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-success  bg-success-border hover:bg-success-border   rounded-lg transition disabled:opacity-50"
            title="Impor item BOQ dari berkas Excel (.xlsx) atau CSV"
          >
            {importLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            <span>{importLoading ? 'Mengimpor...' : 'Impor Excel'}</span>
          </button>

          {/* Ekspor BOQ ke Excel */}
          {items.length > 0 && (
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-primary  bg-primary/20 hover:bg-primary/20   rounded-lg transition min-h-[44px]"
              title="Ekspor BOQ ke format Excel (.xlsx) standar kontraktor"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Ekspor Excel</span>
            </button>
          )}

          {/* Ekspor BOQ ke PDF */}
          {items.length > 0 && summary && (
            <button
              onClick={() => {
                generateBoqPDF(
                  { id: projectId, name: projectName, code: projectId.substring(0, 8).toUpperCase() } as any,
                  items,
                  summary
                );
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-danger  bg-danger hover:bg-danger   rounded-lg transition min-h-[44px]"
              title="Cetak Rencana Anggaran Biaya (RAB PDF A4)"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Ekspor PDF (A4)</span>
            </button>
          )}

          <button
            onClick={() => openItemModal()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-hover rounded-lg shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Item BOQ</span>
          </button>
        </div>
      </div>

      {/* TABEL BOQ */}
      <ResponsiveTable
        data={filteredItems}
        renderTable={() => (
          <div className="bg-white  rounded-xl border border-border-subtle  overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-canvas  text-text-secondary  font-semibold border-b border-border-subtle ">
                  <tr>
                    <th className="py-3 px-3 text-center w-12">No</th>
                    <th className="py-3 px-3 w-20">Kode</th>
                    <th className="py-3 px-3">Uraian Pekerjaan</th>
                    <th className="py-3 px-3 w-16 text-center">Sat</th>
                    <th className="py-3 px-3 text-right w-24">Volume</th>
                    <th className="py-3 px-3 text-right w-36">Harga Satuan (Rp)</th>
                    <th className="py-3 px-3 text-right w-40">Jumlah Harga (Rp)</th>
                    <th className="py-3 px-3 text-right w-24">Bobot (%)</th>
                    <th className="py-3 px-3 text-center w-28">Progres</th>
                    <th className="py-3 px-3 text-center w-20">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 ">
                  {loading ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-text-muted">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                        Memuat rincian BOQ...
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center">
                        <Layers className="w-10 h-10 text-text-muted  mx-auto mb-3" />
                        <p className="font-semibold text-text-secondary ">Belum ada item pekerjaan BOQ</p>
                        <p className="text-xs text-text-muted mt-1">
                          Klik &ldquo;Tambah Item BOQ&rdquo; atau gunakan &ldquo;Contoh 20 Item RAB&rdquo; untuk mengisi otomatis.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-canvas/70  transition group">
                        <td className="py-3 px-3 text-center text-text-muted text-xs font-mono">{idx + 1}</td>
                        <td className="py-3 px-3 font-mono font-semibold text-text-secondary ">
                          {item.kode}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-medium text-text-primary ">{item.uraian}</div>
                          <div className="text-xs text-text-muted mt-0.5">
                            Divisi: {item.divisionCategory}
                            {item.ahspId && (
                              <span className="ml-2 text-primary  font-mono">
                                • [AHSP PUPR]
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-text-secondary ">
                          {item.satuan}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-text-primary ">
                          {formatQuantity(item.volume)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-text-secondary ">
                          {formatCurrencyIDR(item.hargaSatuan)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-text-primary ">
                          {formatCurrencyIDR(item.jumlahHarga)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-primary  font-semibold">
                          {formatPercent(item.bobotPersen, 2)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => {
                              setProgItem(item);
                              setProgInput(String(item.progresPersen));
                            }}
                            className="px-2 py-1 rounded text-xs font-mono font-bold bg-neutral-bg hover:bg-primary/20  text-text-primary  transition"
                            title="Klik untuk ubah progres lapangan"
                          >
                            {item.progresPersen}%
                          </button>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1 opacity-80 group-hover:opacity-100">
                            <button
                              onClick={() => openItemModal(item)}
                              title="Edit Item"
                              className="p-1 text-text-muted hover:text-primary rounded"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item)}
                              title="Hapus Item"
                              className="p-1 text-text-muted hover:text-danger rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        renderCard={(item: BOQItem) => (
          <DataCard
            title={item.uraian}
            subtitle={`${item.kode} • ${item.satuan}`}
            metadata={[
              { label: 'Volume', value: formatQuantity(item.volume) },
              { label: 'Harga Satuan', value: formatCurrencyIDR(item.hargaSatuan) },
              { label: 'Jumlah Harga', value: formatCurrencyIDR(item.jumlahHarga), highlight: true },
              { label: 'Bobot', value: formatPercent(item.bobotPersen, 2) },
              { label: 'Progres', value: `${item.progresPersen}%` },
            ]}
            actions={
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setProgItem(item);
                    setProgInput(String(item.progresPersen));
                  }}
                  className="px-2 py-1 text-xs rounded bg-primary/10 hover:bg-primary/20  text-primary  transition"
                  title="Ubah progres"
                >
                  Progress
                </button>
                <button
                  onClick={() => openItemModal(item)}
                  className="px-2 py-1 text-xs rounded bg-neutral-bg hover:bg-neutral-bg  text-text-secondary  transition"
                  title="Edit"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteItem(item)}
                  className="px-2 py-1 text-xs rounded bg-danger-bg hover:bg-danger  text-danger  transition"
                  title="Hapus"
                >
                  Hapus
                </button>
              </div>
            }
          />
        )}
        cardGridCols="grid-cols-1 md:grid-cols-2"
      />

      {/* MODAL: Tambah / Edit Item BOQ */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white  rounded-xl shadow-xl border border-border-subtle  w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-border-subtle  flex items-center justify-between">
              <h3 className="font-bold text-text-primary ">
                {editingItem ? 'Edit Item Pekerjaan BOQ' : 'Tambah Item Pekerjaan BOQ'}
              </h3>
              <button onClick={() => setShowItemModal(false)} className="text-text-muted hover:text-text-secondary">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-6 space-y-4">
              {/* Opsi Sinkronisasi dengan AHSP Template */}
              {ahspList.length > 0 && (
                <div className="p-3 bg-primary/10  rounded-lg border border-primary/20 ">
                  <label className="block text-xs font-semibold text-primary  mb-1 flex items-center gap-1.5">
                    <Calculator className="w-3.5 h-3.5 text-primary" />
                    <span>Pilih dari Pustaka AHSP PUPR (Opsional)</span>
                  </label>
                  <select
                    value={form.ahspId}
                    onChange={(e) => handleSelectAHSP(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white  border border-primary/20  rounded-lg text-text-primary "
                  >
                    <option value="">-- Pilih Template AHSP untuk mengisi otomatis --</option>
                    {ahspList.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.kode} - {tpl.nama} ({tpl.satuan})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary  mb-1">
                    Divisi Pekerjaan <span className="text-danger">*</span>
                  </label>
                  <select
                    value={form.divisionCategory}
                    onChange={(e) => setForm({ ...form, divisionCategory: e.target.value as DivisionCategory })}
                    className="w-full px-3 py-2 text-sm bg-canvas  border border-border-subtle  rounded-lg text-text-primary "
                  >
                    <option value="Pekerjaan Persiapan">Pekerjaan Persiapan</option>
                    <option value="Pekerjaan Struktur">Pekerjaan Struktur</option>
                    <option value="Pekerjaan Arsitektur">Pekerjaan Arsitektur</option>
                    <option value="Pekerjaan MEP">Pekerjaan MEP</option>
                    <option value="Manajemen & Overhead">Manajemen & Overhead</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary  mb-1">
                    Kode Item <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: 1.1, 2.1"
                    value={form.kode}
                    onChange={(e) => setForm({ ...form, kode: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono bg-canvas  border border-border-subtle  rounded-lg text-text-primary "
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary  mb-1">
                  Uraian Pekerjaan <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Pasangan pondasi batu belah camp. 1:4"
                  value={form.uraian}
                  onChange={(e) => setForm({ ...form, uraian: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-canvas  border border-border-subtle  rounded-lg text-text-primary "
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary  mb-1">
                    Satuan <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="m2, m3, kg, dll."
                    value={form.satuan}
                    onChange={(e) => setForm({ ...form, satuan: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-canvas  border border-border-subtle  rounded-lg text-text-primary "
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary  mb-1">
                    Volume <span className="text-danger">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    required
                    value={form.volume}
                    onChange={(e) => setForm({ ...form, volume: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-semibold bg-canvas  border border-border-subtle  rounded-lg text-text-primary "
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary  mb-1">
                    Harga Satuan (Rp) <span className="text-danger">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={form.hargaSatuan}
                    onChange={(e) => setForm({ ...form, hargaSatuan: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-semibold bg-canvas  border border-border-subtle  rounded-lg text-text-primary "
                  />
                </div>
              </div>

              <div className="p-3 bg-canvas  rounded-lg flex justify-between items-center text-xs">
                <span className="text-text-muted font-medium">Estimasi Subtotal Item:</span>
                <span className="font-mono font-bold text-text-primary  text-sm">
                  {formatCurrencyIDR(Math.round(parseFloat(form.volume || '0') * parseInt(form.hargaSatuan || '0', 10)))}
                </span>
              </div>

              <div className="pt-3 border-t border-border-subtle  flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="px-4 py-2 text-sm text-text-secondary  hover:bg-neutral-bg rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-hover rounded-lg flex items-center gap-2"
                >
                  {formSubmitting && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>Simpan Item BOQ</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Ubah Tarif PPN */}
      {showPpnModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white  rounded-xl shadow-xl border border-border-subtle  w-full max-w-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border-subtle  flex items-center justify-between">
              <h3 className="font-bold text-text-primary ">Ubah Tarif PPN Proyek</h3>
              <button onClick={() => setShowPpnModal(false)} className="text-text-muted hover:text-text-secondary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSavePPN} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-secondary  mb-1">
                  Persentase PPN (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  required
                  value={ppnInput}
                  onChange={(e) => setPpnInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono font-bold bg-canvas  border border-border-subtle  rounded-lg text-text-primary "
                />
                <span className="text-xs text-text-muted mt-1 block">Tarif standar UU HPP: 11%</span>
              </div>
              <div className="pt-3 border-t border-border-subtle  flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPpnModal(false)}
                  className="px-4 py-2 text-sm text-text-secondary  hover:bg-neutral-bg rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={ppnSubmitting}
                  className="px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-hover rounded-lg flex items-center gap-2"
                >
                  {ppnSubmitting && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>Simpan Tarif PPN</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Update Progres Cepat Item */}
      {progItem && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white  rounded-xl shadow-xl border border-border-subtle  w-full max-w-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border-subtle  flex items-center justify-between">
              <h3 className="font-bold text-text-primary ">Update Progres Lapangan</h3>
              <button onClick={() => setProgItem(null)} className="text-text-muted hover:text-text-secondary">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveProgress} className="p-6 space-y-4">
              <div>
                <div className="text-xs font-semibold text-text-secondary  mb-1">
                  {progItem.uraian} ({progItem.kode})
                </div>
                <div className="text-xs text-text-muted mb-3">Bobot item: {progItem.bobotPersen}% terhadap total proyek</div>
                <label className="block text-xs font-semibold text-text-secondary  mb-1">
                  Progres Aktual (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  required
                  value={progInput}
                  onChange={(e) => setProgInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono font-bold bg-canvas  border border-border-subtle  rounded-lg text-text-primary "
                />
              </div>
              <div className="pt-3 border-t border-border-subtle  flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setProgItem(null)}
                  className="px-4 py-2 text-sm text-text-secondary  hover:bg-neutral-bg rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={progSubmitting}
                  className="px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-hover rounded-lg flex items-center gap-2"
                >
                  {progSubmitting && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>Simpan Progres</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BOQItemizedTab;
