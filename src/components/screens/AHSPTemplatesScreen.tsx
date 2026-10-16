/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * AHSPTemplatesScreen.tsx
 * Manajemen Analisis Harga Satuan Pekerjaan (AHSP) Bidang PUPR (Permen PUPR No. 8 Tahun 2023).
 * Menghitung rincian koefisien x harga dasar bahan/upah/alat, overhead & profit, dan simulasi harga satuan.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Calculator,
  Plus,
  Search,
  RefreshCw,
  Sparkles,
  Trash2,
  Edit2,
  ChevronRight,
  Layers,
  CheckCircle2,
  AlertCircle,
  X,
  Percent,
  Sliders,
  DollarSign,
  ArrowRight,
  Info,
} from 'lucide-react';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { supabaseDataService } from '../../services/supabaseDataService';
import { DataCard } from '../common/DataCard';
import { ResponsiveTable } from '../common/ResponsiveTable';
import {
  AHSPTemplate,
  AHSPComponent,
  AHSPUnitPriceCalculation,
  AHSPComponentType,
} from '../../types/rab';
import { formatCurrencyIDR } from '../../utils/formatters';

export const AHSPTemplatesScreen: React.FC = () => {
  const { workspaceId, addToast } = useUI();
  const { userProfile } = useAuth();

  const [templates, setTemplates] = useState<AHSPTemplate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedKategori, setSelectedKategori] = useState<string>('Semua');
  const [seeding, setSeeding] = useState<boolean>(false);

  // Detail & Kalkulasi Modal
  const [activeTemplate, setActiveTemplate] = useState<AHSPTemplate | null>(null);
  const [calculation, setCalculation] = useState<AHSPUnitPriceCalculation | null>(null);
  const [loadingCalc, setLoadingCalc] = useState<boolean>(false);

  // Template Form Modal
  const [showTplModal, setShowTplModal] = useState<boolean>(false);
  const [editingTpl, setEditingTpl] = useState<AHSPTemplate | null>(null);
  const [tplForm, setTplForm] = useState<{
    kode: string;
    nama: string;
    satuan: string;
    kategori: string;
    overheadProfitPct: number;
    keterangan: string;
  }>({
    kode: '',
    nama: '',
    satuan: '',
    kategori: 'Pekerjaan Struktur Beton',
    overheadProfitPct: 10,
    keterangan: '',
  });
  const [tplSubmitting, setTplSubmitting] = useState<boolean>(false);

  // Component Form Modal
  const [showCompModal, setShowCompModal] = useState<boolean>(false);
  const [compForm, setCompForm] = useState<{
    jenis: AHSPComponentType;
    kodeSumberDaya: string;
    uraian: string;
    satuan: string;
    koefisien: string;
  }>({
    jenis: 'Tenaga',
    kodeSumberDaya: '',
    uraian: '',
    satuan: 'OH',
    koefisien: '1.0',
  });
  const [compSubmitting, setCompSubmitting] = useState<boolean>(false);

  const showToast = (message: string, type: 'success' | 'warning' | 'info' | 'danger' = 'info') => {
    addToast({
      type,
      title: type === 'danger' ? 'Terjadi Kesalahan' : type === 'success' ? 'Sukses' : 'Pemberitahuan',
      message,
    });
  };

  // Muat data template
  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = await supabaseDataService.getAHSPTemplates({
        wsId: workspaceId,
      });
      setTemplates(data);
    } catch (err: any) {
      showToast('Gagal memuat template AHSP: ' + err.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, [workspaceId]);

  // Load Breakdown Kalkulasi untuk Template Terpilih
  const viewDetail = async (tpl: AHSPTemplate) => {
    setActiveTemplate(tpl);
    try {
      setLoadingCalc(true);
      const calc = await supabaseDataService.calculateAHSPUnitPrice(tpl.id, '', workspaceId);
      setCalculation(calc);
    } catch (err: any) {
      showToast('Gagal menghitung breakdown harga: ' + err.message, 'danger');
    } finally {
      setLoadingCalc(false);
    }
  };

  // Seed 20 Item PUPR
  const handleSeedPUPR = async () => {
    if (!window.confirm('Tanam 20 item standar pekerjaan sipil dari Lampiran Permen PUPR No. 8 Tahun 2023 ke workspace ini?')) {
      return;
    }
    try {
      setSeeding(true);
      const res = await supabaseDataService.seedPUPRAHSPTemplates(workspaceId);
      showToast(res.message, 'success');
      await loadTemplates();
    } catch (err: any) {
      showToast('Gagal melakukan seed AHSP: ' + err.message, 'danger');
    } finally {
      setSeeding(false);
    }
  };

  // Simpan Template
  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tplForm.kode.trim() || !tplForm.nama.trim() || !tplForm.satuan.trim()) {
      showToast('Kode, Nama Pekerjaan, dan Satuan wajib diisi.', 'warning');
      return;
    }
    try {
      setTplSubmitting(true);
      const res = await supabaseDataService.upsertAHSPTemplate({
        workspaceId,
        id: editingTpl?.id,
        kode: tplForm.kode.trim(),
        nama: tplForm.nama.trim(),
        satuan: tplForm.satuan.trim(),
        kategori: tplForm.kategori.trim(),
        overheadProfitPct: tplForm.overheadProfitPct,
        keterangan: tplForm.keterangan.trim() || null,
      });
      showToast(res.message, 'success');
      setShowTplModal(false);
      await loadTemplates();
    } catch (err: any) {
      showToast('Gagal menyimpan template: ' + err.message, 'danger');
    } finally {
      setTplSubmitting(false);
    }
  };

  // Hapus Template
  const handleDeleteTemplate = async (tpl: AHSPTemplate) => {
    if (!window.confirm(`Hapus template AHSP "${tpl.nama}" (${tpl.kode})?`)) return;
    try {
      const res = await supabaseDataService.deleteAHSPTemplate(tpl.id, workspaceId);
      showToast(res.message, 'success');
      if (activeTemplate?.id === tpl.id) {
        setActiveTemplate(null);
        setCalculation(null);
      }
      await loadTemplates();
    } catch (err: any) {
      showToast('Gagal menghapus template: ' + err.message, 'danger');
    }
  };

  // Tambah Komponen
  const handleSaveComponent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTemplate) return;
    const koef = parseFloat(compForm.koefisien);
    if (isNaN(koef) || koef <= 0) {
      showToast('Koefisien harus berupa angka positif.', 'warning');
      return;
    }
    try {
      setCompSubmitting(true);
      const res = await supabaseDataService.upsertAHSPComponent({
        workspaceId,
        templateId: activeTemplate.id,
        jenis: compForm.jenis,
        kodeSumberDaya: compForm.kodeSumberDaya.trim(),
        uraian: compForm.uraian.trim(),
        satuan: compForm.satuan.trim(),
        koefisien: koef,
      });
      showToast(res.message, 'success');
      setShowCompModal(false);
      // Refresh calc
      await viewDetail(activeTemplate);
      await loadTemplates();
    } catch (err: any) {
      showToast('Gagal menambah komponen: ' + err.message, 'danger');
    } finally {
      setCompSubmitting(false);
    }
  };

  // Hapus Komponen
  const handleDeleteComponent = async (comp: any) => {
    if (!window.confirm(`Hapus komponen "${comp.uraian}"?`)) return;
    try {
      const res = await supabaseDataService.deleteAHSPComponent(comp.id, workspaceId);
      showToast(res.message, 'success');
      if (activeTemplate) {
        await viewDetail(activeTemplate);
        await loadTemplates();
      }
    } catch (err: any) {
      showToast('Gagal menghapus komponen: ' + err.message, 'danger');
    }
  };

  // Kategori unik
  const kategoriList = useMemo(() => {
    const list = Array.from(new Set(templates.map((t) => t.kategori).filter(Boolean)));
    return ['Semua', ...list];
  }, [templates]);

  // Filter templates
  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      const matchKat = selectedKategori === 'Semua' || t.kategori === selectedKategori;
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        t.kode.toLowerCase().includes(q) ||
        t.nama.toLowerCase().includes(q) ||
        (t.keterangan && t.keterangan.toLowerCase().includes(q));
      return matchKat && matchQuery;
    });
  }, [templates, selectedKategori, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header Utama */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white  p-6 rounded-xl border border-border-subtle  shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-warning-bg  text-warning  rounded-lg">
              <Calculator className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-text-primary ">Analisis Harga Satuan Pekerjaan (AHSP)</h1>
              <p className="text-sm text-text-muted ">
                Pustaka analisis koefisien x harga dasar mengacu pada Pedoman Permen PUPR No. 8 Tahun 2023.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleSeedPUPR}
            disabled={seeding}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-text-primary bg-accent-gold hover:bg-accent-gold-dark disabled:opacity-50 rounded-lg transition"
            title="Seed 20 Item Acuan Permen PUPR 8/2023"
          >
            {seeding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-warning" />}
            <span>Tanam 20 Item Standar PUPR</span>
          </button>

          <button
            onClick={() => {
              setEditingTpl(null);
              setTplForm({
                kode: '',
                nama: '',
                satuan: '',
                kategori: 'Pekerjaan Struktur Beton',
                overheadProfitPct: 10,
                keterangan: '',
              });
              setShowTplModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-hover rounded-lg shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Template AHSP</span>
          </button>
        </div>
      </div>

      {/* Filter & Bar Pencarian */}
      <div className="flex flex-col md:flex-row items-center gap-3 bg-white  p-4 rounded-xl border border-border-subtle ">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Cari kode AHSP, uraian pekerjaan, atau rujukan analisis..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-canvas  border border-border-subtle  rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text-primary "
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            value={selectedKategori}
            onChange={(e) => setSelectedKategori(e.target.value)}
            className="px-3 py-2 text-sm bg-canvas  border border-border-subtle  rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text-primary "
          >
            {kategoriList.map((k) => (
              <option key={k} value={k}>
                Kategori: {k}
              </option>
            ))}
          </select>

          <button
            onClick={loadTemplates}
            title="Muat Ulang"
            className="p-2 text-text-muted hover:text-text-primary  bg-neutral-bg  rounded-lg transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Grid Dua Kolom: Daftar Template & Detail Breakdown Kalkulasi */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Kolom Kiri: Tabel / Daftar Template */}
        <div className="lg:col-span-7 bg-white  rounded-xl border border-border-subtle  overflow-hidden shadow-sm flex flex-col">
          <div className="px-5 py-3.5 bg-canvas  border-b border-border-subtle  flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-text-muted ">
              Daftar Analisis Harga ({filteredTemplates.length} Item)
            </span>
            <span className="text-xs text-text-muted">Klik item untuk melihat breakdown</span>
          </div>

          <div className="divide-y divide-slate-100  overflow-y-auto max-h-[680px]">
            {loading ? (
              <div className="p-12 text-center text-text-muted">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                Memuat pustaka AHSP...
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="p-12 text-center">
                <Layers className="w-10 h-10 text-text-muted  mx-auto mb-3" />
                <p className="font-semibold text-text-secondary ">Belum ada template AHSP</p>
                <p className="text-xs text-text-muted mt-1">Klik tombol &ldquo;Tanam 20 Item Standar PUPR&rdquo; untuk mengisi otomatis.</p>
                <button
                  onClick={handleSeedPUPR}
                  className="mt-4 px-4 py-2 bg-accent-gold hover:bg-accent-gold-dark text-white text-xs font-semibold rounded-lg transition"
                >
                  Tanam 20 Item Permen PUPR 8/2023
                </button>
              </div>
            ) : (
              filteredTemplates.map((tpl) => {
                const isSelected = activeTemplate?.id === tpl.id;
                const compCount = tpl.components?.length || 0;
                return (
                  <div
                    key={tpl.id}
                    onClick={() => viewDetail(tpl)}
                    className={`p-4 transition cursor-pointer flex items-center justify-between gap-4 ${
                      isSelected
                        ? 'bg-primary/10/70  border-l-4 border-l-primary/20'
                        : 'hover:bg-canvas '
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-neutral-bg  text-text-secondary ">
                          {tpl.kode}
                        </span>
                        <span className="text-xs text-text-muted">({tpl.satuan})</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-bg  text-text-muted">
                          {tpl.kategori}
                        </span>
                      </div>
                      <div className="font-semibold text-sm text-text-primary  truncate">
                        {tpl.nama}
                      </div>
                      <div className="text-xs text-text-muted mt-0.5 flex items-center gap-3">
                        <span>{compCount} komponen rincian</span>
                        <span>•</span>
                        <span>Overhead: {tpl.overheadProfitPct}%</span>
                        {tpl.keterangan && (
                          <>
                            <span>•</span>
                            <span className="truncate max-w-[200px]">{tpl.keterangan}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTpl(tpl);
                          setTplForm({
                            kode: tpl.kode,
                            nama: tpl.nama,
                            satuan: tpl.satuan,
                            kategori: tpl.kategori,
                            overheadProfitPct: tpl.overheadProfitPct,
                            keterangan: tpl.keterangan || '',
                          });
                          setShowTplModal(true);
                        }}
                        title="Edit Template"
                        className="p-1.5 text-text-muted hover:text-primary rounded transition"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTemplate(tpl);
                        }}
                        title="Hapus Template"
                        className="p-1.5 text-text-muted hover:text-danger rounded transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <ChevronRight className={`w-4 h-4 text-text-muted ${isSelected ? 'text-primary translate-x-0.5' : ''}`} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Kolom Kanan: Breakdown Rincian Harga Satuan Terpilih */}
        <div className="lg:col-span-5 bg-white  rounded-xl border border-border-subtle  overflow-hidden shadow-sm flex flex-col">
          {activeTemplate ? (
            <div className="p-5 flex-1 flex flex-col space-y-4">
              {/* Header Box Template Aktif */}
              <div className="border-b border-border-subtle  pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="font-mono text-xs font-bold text-primary ">
                      {activeTemplate.kode}
                    </span>
                    <h3 className="text-base font-bold text-text-primary  mt-0.5">
                      {activeTemplate.nama}
                    </h3>
                    <p className="text-xs text-text-muted mt-1">
                      Satuan: 1 {activeTemplate.satuan} • {activeTemplate.dasarHukum}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setCompForm({
                        jenis: 'Tenaga',
                        kodeSumberDaya: '',
                        uraian: '',
                        satuan: 'OH',
                        koefisien: '1.0',
                      });
                      setShowCompModal(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary  bg-primary/10  hover:bg-primary/20 rounded-lg transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Komponen</span>
                  </button>
                </div>
              </div>

              {loadingCalc ? (
                <div className="py-16 text-center text-text-muted">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                  Menghitung harga satuan dari katalog...
                </div>
              ) : calculation ? (
                <div className="space-y-4 flex-1 overflow-y-auto">
                  {/* Tabel Rincian Komponen */}
                  <ResponsiveTable
                    data={calculation.components}
                    renderTable={() => (
                      <div className="border border-border-subtle  rounded-lg overflow-hidden text-xs">
                        <table className="w-full text-left">
                          <thead className="bg-canvas  text-text-muted font-semibold border-b border-border-subtle ">
                            <tr>
                              <th className="py-2 px-3">Komponen</th>
                              <th className="py-2 px-2 text-center">Koef</th>
                              <th className="py-2 px-3 text-right">Harga Dasar</th>
                              <th className="py-2 px-3 text-right">Subtotal</th>
                              <th className="py-2 px-2 text-center w-8"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 ">
                            {calculation.components.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="py-6 text-center text-text-muted">
                                  Belum ada rincian komponen untuk template ini.
                                </td>
                              </tr>
                            ) : (
                              calculation.components.map((c) => (
                                <tr key={c.id} className="hover:bg-canvas ">
                                  <td className="py-2 px-3">
                                    <div className="font-medium text-text-primary ">{c.uraian}</div>
                                    <div className="text-xs text-text-muted flex items-center gap-1 font-mono">
                                      <span>{c.jenis}</span>
                                      <span>•</span>
                                      <span>{c.kode}</span>
                                    </div>
                                  </td>
                                  <td className="py-2 px-2 text-center font-mono">
                                    {c.koefisien} {c.satuan}
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono text-text-secondary ">
                                    {c.hasPrice ? (
                                      formatCurrencyIDR(c.hargaDasar)
                                    ) : (
                                      <span className="text-warning italic text-xs">Belum ada harga</span>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-right font-semibold font-mono text-text-primary ">
                                    {formatCurrencyIDR(c.subtotal)}
                                  </td>
                                  <td className="py-2 px-2 text-center">
                                    <button
                                      onClick={() => handleDeleteComponent(c)}
                                      className="text-text-muted hover:text-danger transition"
                                      title="Hapus Komponen"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                    renderCard={(c) => (
                      <DataCard
                        title={c.uraian}
                        subtitle={`${c.jenis} • ${c.kode}`}
                        metadata={[
                          {
                            label: 'Koefisien',
                            value: (
                              <span className="font-mono">
                                {c.koefisien} {c.satuan}
                              </span>
                            ),
                          },
                          {
                            label: 'Harga Dasar',
                            value: c.hasPrice ? (
                              <span className="font-mono">{formatCurrencyIDR(c.hargaDasar)}</span>
                            ) : (
                              <span className="text-warning italic text-xs">Belum ada harga</span>
                            ),
                          },
                          {
                            label: 'Subtotal',
                            value: <span className="font-mono font-semibold">{formatCurrencyIDR(c.subtotal)}</span>,
                            highlight: true,
                          },
                        ]}
                        actions={
                          <button
                            onClick={() => handleDeleteComponent(c)}
                            className="text-text-muted hover:text-danger transition"
                            title="Hapus Komponen"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        }
                      />
                    )}
                  />

                  {/* Rekapitulasi Direct Cost & Overhead */}
                  <div className="bg-canvas  p-4 rounded-xl border border-border-subtle  space-y-2 text-xs">
                    <div className="flex justify-between text-text-secondary ">
                      <span>Biaya Tenaga Kerja:</span>
                      <span className="font-mono font-medium">{formatCurrencyIDR(calculation.biayaTenaga)}</span>
                    </div>
                    <div className="flex justify-between text-text-secondary ">
                      <span>Biaya Bahan / Material:</span>
                      <span className="font-mono font-medium">{formatCurrencyIDR(calculation.biayaBahan)}</span>
                    </div>
                    <div className="flex justify-between text-text-secondary ">
                      <span>Biaya Alat & Subkon:</span>
                      <span className="font-mono font-medium">
                        {formatCurrencyIDR(calculation.biayaAlat + calculation.biayaSubkon)}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-border-subtle  flex justify-between font-semibold text-text-primary ">
                      <span>Biaya Langsung (Direct Cost):</span>
                      <span className="font-mono">{formatCurrencyIDR(calculation.biayaLangsung)}</span>
                    </div>

                    <div className="flex justify-between text-warning  font-medium">
                      <span>Overhead & Profit ({calculation.overheadProfitPct}%):</span>
                      <span className="font-mono">+{formatCurrencyIDR(calculation.overheadAmount)}</span>
                    </div>

                    <div className="pt-2 border-t border-dashed border-border-subtle  flex justify-between items-center text-sm font-bold text-text-primary ">
                      <span>Harga Satuan Pekerjaan:</span>
                      <span className="text-base text-primary  font-mono">
                        {formatCurrencyIDR(calculation.totalHargaSatuan)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="p-12 text-center my-auto">
              <Calculator className="w-10 h-10 text-text-muted  mx-auto mb-3" />
              <p className="font-semibold text-text-secondary ">Pilih Template AHSP</p>
              <p className="text-xs text-text-muted mt-1">
                Pilih salah satu analisis di daftar sebelah kiri untuk meninjau rincian koefisien dan total harga satuan.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: Tambah / Edit Template AHSP */}
      {showTplModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white  rounded-xl shadow-xl border border-border-subtle  w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-border-subtle  flex items-center justify-between">
              <h3 className="font-bold text-text-primary ">
                {editingTpl ? 'Edit Template AHSP' : 'Tambah Template AHSP Baru'}
              </h3>
              <button onClick={() => setShowTplModal(false)} className="text-text-muted hover:text-text-secondary">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary  mb-1">
                    Kode Analisis <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="PUPR-01, A.4.1.1.5"
                    value={tplForm.kode}
                    onChange={(e) => setTplForm({ ...tplForm, kode: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono bg-canvas  border border-border-subtle  rounded-lg focus:ring-2 focus:ring-primary text-text-primary "
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary  mb-1">
                    Satuan Pekerjaan <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="m2, m3, kg, m', dll."
                    value={tplForm.satuan}
                    onChange={(e) => setTplForm({ ...tplForm, satuan: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-canvas  border border-border-subtle  rounded-lg focus:ring-2 focus:ring-primary text-text-primary "
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary  mb-1">
                  Uraian / Nama Pekerjaan <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Pembuatan 1 m3 beton mutu f'c=19.3 MPa (K-225)"
                  value={tplForm.nama}
                  onChange={(e) => setTplForm({ ...tplForm, nama: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-canvas  border border-border-subtle  rounded-lg focus:ring-2 focus:ring-primary text-text-primary "
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary  mb-1">
                    Kategori Divisi
                  </label>
                  <select
                    value={tplForm.kategori}
                    onChange={(e) => setTplForm({ ...tplForm, kategori: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-canvas  border border-border-subtle  rounded-lg focus:ring-2 focus:ring-primary text-text-primary "
                  >
                    <option value="Pekerjaan Persiapan">Pekerjaan Persiapan</option>
                    <option value="Pekerjaan Tanah">Pekerjaan Tanah</option>
                    <option value="Pekerjaan Pondasi">Pekerjaan Pondasi</option>
                    <option value="Pekerjaan Struktur Beton">Pekerjaan Struktur Beton</option>
                    <option value="Pekerjaan Dinding">Pekerjaan Dinding</option>
                    <option value="Pekerjaan Finishing">Pekerjaan Finishing</option>
                    <option value="Pekerjaan Atap">Pekerjaan Atap</option>
                    <option value="Pekerjaan Langit-langit">Pekerjaan Langit-langit</option>
                    <option value="Umum">Umum</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary  mb-1">
                    Overhead & Profit (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={tplForm.overheadProfitPct}
                    onChange={(e) => setTplForm({ ...tplForm, overheadProfitPct: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm bg-canvas  border border-border-subtle  rounded-lg focus:ring-2 focus:ring-primary text-text-primary  font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary  mb-1">
                  Keterangan / Nomor Rujukan SNI / AHSP
                </label>
                <textarea
                  rows={2}
                  placeholder="Misal: Lampiran Permen PUPR No. 8/2023 Pasal A.4.1.1.5"
                  value={tplForm.keterangan}
                  onChange={(e) => setTplForm({ ...tplForm, keterangan: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-canvas  border border-border-subtle  rounded-lg focus:ring-2 focus:ring-primary text-text-primary "
                />
              </div>

              <div className="pt-3 border-t border-border-subtle  flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTplModal(false)}
                  className="px-4 py-2 text-sm text-text-secondary  hover:bg-neutral-bg rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={tplSubmitting}
                  className="px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-hover rounded-lg flex items-center gap-2"
                >
                  {tplSubmitting && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>Simpan Template</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Tambah Komponen AHSP */}
      {showCompModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white  rounded-xl shadow-xl border border-border-subtle  w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-border-subtle  flex items-center justify-between">
              <h3 className="font-bold text-text-primary ">Tambah Komponen Rincian AHSP</h3>
              <button onClick={() => setShowCompModal(false)} className="text-text-muted hover:text-text-secondary">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveComponent} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary  mb-1">
                    Jenis Komponen
                  </label>
                  <select
                    value={compForm.jenis}
                    onChange={(e) => setCompForm({ ...compForm, jenis: e.target.value as AHSPComponentType })}
                    className="w-full px-3 py-2 text-sm bg-canvas  border border-border-subtle  rounded-lg focus:ring-2 focus:ring-primary text-text-primary "
                  >
                    <option value="Tenaga">Tenaga (Upah)</option>
                    <option value="Bahan">Bahan (Material)</option>
                    <option value="Alat">Alat (Equipment)</option>
                    <option value="Subkon">Subkontraktor</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary  mb-1">
                    Kode Sumber Daya
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: UPH-001, BHN-001"
                    value={compForm.kodeSumberDaya}
                    onChange={(e) => setCompForm({ ...compForm, kodeSumberDaya: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono bg-canvas  border border-border-subtle  rounded-lg focus:ring-2 focus:ring-primary text-text-primary "
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary  mb-1">
                  Uraian Komponen <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Pekerja Konstruksi, Semen PC"
                  value={compForm.uraian}
                  onChange={(e) => setCompForm({ ...compForm, uraian: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-canvas  border border-border-subtle  rounded-lg focus:ring-2 focus:ring-primary text-text-primary "
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary  mb-1">
                    Satuan
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="OH, kg, m3, hari, dll."
                    value={compForm.satuan}
                    onChange={(e) => setCompForm({ ...compForm, satuan: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-canvas  border border-border-subtle  rounded-lg focus:ring-2 focus:ring-primary text-text-primary "
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary  mb-1">
                    Koefisien <span className="text-danger">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    min="0.000001"
                    required
                    placeholder="0.025"
                    value={compForm.koefisien}
                    onChange={(e) => setCompForm({ ...compForm, koefisien: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-semibold bg-canvas  border border-border-subtle  rounded-lg focus:ring-2 focus:ring-primary text-text-primary "
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-border-subtle  flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCompModal(false)}
                  className="px-4 py-2 text-sm text-text-secondary  hover:bg-neutral-bg rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={compSubmitting}
                  className="px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-hover rounded-lg flex items-center gap-2"
                >
                  {compSubmitting && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>Tambah Komponen</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AHSPTemplatesScreen;
