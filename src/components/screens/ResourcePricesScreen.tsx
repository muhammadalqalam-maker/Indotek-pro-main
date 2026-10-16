/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ResourcePricesScreen.tsx
 * Manajemen Katalog Harga Dasar Satuan (Bahan, Upah, Alat, Subkon)
 * Dilengkapi filter multi-kategori, pencarian, CRUD RPC, serta impor/ekspor CSV/XLSX.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  DollarSign,
  Plus,
  Upload,
  Download,
  Search,
  Filter,
  Trash2,
  Edit2,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  FileText,
  Layers,
  MapPin,
  Calendar,
} from 'lucide-react';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { supabaseDataService } from '../../services/supabaseDataService';
import { ResourcePrice, ResourceType, ResourcePriceImportRow } from '../../types/rab';
import { formatCurrencyIDR, getWitaDateISO } from '../../utils/formatters';
import {
  parseResourcePricesFile,
  downloadResourcePriceTemplate,
  exportResourcePricesToExcel,
  ParseResult,
} from '../../utils/resourcePriceImport';
import { DataCard } from '../common/DataCard';
import { ResponsiveTable } from '../common/ResponsiveTable';

export const ResourcePricesScreen: React.FC = () => {
  const { workspaceId, addToast } = useUI();
  const { userProfile } = useAuth();

  const showToast = (message: string, type: 'success' | 'warning' | 'info' | 'danger' = 'info') => {
    addToast({
      type,
      title: type === 'danger' ? 'Terjadi Kesalahan' : type === 'success' ? 'Sukses' : 'Pemberitahuan',
      message,
    });
  };

  const [items, setItems] = useState<ResourcePrice[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedJenis, setSelectedJenis] = useState<string>('Semua');
  const [selectedWilayah, setSelectedWilayah] = useState<string>('Semua');

  // Modal State
  const [showFormModal, setShowFormModal] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<ResourcePrice | null>(null);
  const [formData, setFormData] = useState<{
    jenis: ResourceType;
    kode: string;
    uraian: string;
    satuan: string;
    harga: string;
    wilayah: string;
    berlakuMulai: string;
    spesifikasi: string;
  }>({
    jenis: 'Bahan',
    kode: '',
    uraian: '',
    satuan: '',
    harga: '',
    wilayah: '',
    berlakuMulai: getWitaDateISO(),
    spesifikasi: '',
  });
  const [formSubmitting, setFormSubmitting] = useState<boolean>(false);

  // Import Modal State
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [importing, setImporting] = useState<boolean>(false);
  const [parsing, setParsing] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load Data
  const loadData = async () => {
    try {
      setLoading(true);
      const res = await supabaseDataService.getResourcePrices({
        wsId: workspaceId,
      });
      setItems(res);
    } catch (err: any) {
      showToast('Gagal memuat katalog harga dasar: ' + err.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [workspaceId]);

  // Daftar wilayah unik
  const uniqueWilayahList = useMemo(() => {
    const list = Array.from(new Set(items.map((i) => i.wilayah).filter(Boolean)));
    return ['Semua', ...list];
  }, [items]);

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchJenis = selectedJenis === 'Semua' || item.jenis === selectedJenis;
      const matchWilayah = selectedWilayah === 'Semua' || item.wilayah === selectedWilayah;
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        item.kode.toLowerCase().includes(q) ||
        item.uraian.toLowerCase().includes(q) ||
        (item.spesifikasi && item.spesifikasi.toLowerCase().includes(q));
      return matchJenis && matchWilayah && matchQuery;
    });
  }, [items, selectedJenis, selectedWilayah, searchQuery]);

  // Statistik per jenis
  const stats = useMemo(() => {
    return {
      total: items.length,
      bahan: items.filter((i) => i.jenis === 'Bahan').length,
      upah: items.filter((i) => i.jenis === 'Upah').length,
      alat: items.filter((i) => i.jenis === 'Alat').length,
      subkon: items.filter((i) => i.jenis === 'Subkon').length,
    };
  }, [items]);

  // Buka Form Tambah / Edit
  const openForm = (item?: ResourcePrice) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        jenis: item.jenis,
        kode: item.kode,
        uraian: item.uraian,
        satuan: item.satuan,
        harga: String(item.harga),
        wilayah: item.wilayah || '',
        berlakuMulai: item.berlakuMulai || getWitaDateISO(),
        spesifikasi: item.spesifikasi || '',
      });
    } else {
      setEditingItem(null);
      setFormData({
        jenis: 'Bahan',
        kode: '',
        uraian: '',
        satuan: '',
        harga: '',
        wilayah: '',
        berlakuMulai: getWitaDateISO(),
        spesifikasi: '',
      });
    }
    setShowFormModal(true);
  };

  // Simpan Form
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const nominal = parseInt(formData.harga.replace(/[^0-9]/g, ''), 10);
    if (isNaN(nominal) || nominal < 0) {
      showToast('Harga satuan harus berupa nominal valid (>= 0).', 'warning');
      return;
    }
    if (!formData.kode.trim() || !formData.uraian.trim() || !formData.satuan.trim()) {
      showToast('Kode, Uraian, dan Satuan wajib diisi.', 'warning');
      return;
    }

    try {
      setFormSubmitting(true);
      const res = await supabaseDataService.upsertResourcePrice({
        workspaceId,
        id: editingItem?.id,
        jenis: formData.jenis,
        kode: formData.kode.trim(),
        uraian: formData.uraian.trim(),
        satuan: formData.satuan.trim(),
        harga: nominal,
        wilayah: formData.wilayah.trim(),
        berlakuMulai: formData.berlakuMulai,
        spesifikasi: formData.spesifikasi.trim() || null,
      });

      showToast(res.message || 'Harga satuan dasar berhasil disimpan.', 'success');
      setShowFormModal(false);
      await loadData();
    } catch (err: any) {
      showToast('Gagal menyimpan harga dasar: ' + err.message, 'danger');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Hapus Item
  const handleDelete = async (item: ResourcePrice) => {
    if (!window.confirm(`Yakin ingin menghapus harga dasar "${item.uraian}" (${item.kode})?`)) {
      return;
    }
    try {
      const res = await supabaseDataService.deleteResourcePrice(item.id, workspaceId);
      showToast(res.message || 'Item harga dasar berhasil dihapus.', 'success');
      await loadData();
    } catch (err: any) {
      showToast('Gagal menghapus item: ' + err.message, 'danger');
    }
  };

  // Handle Pilih File Impor
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    try {
      setParsing(true);
      const result = await parseResourcePricesFile(file);
      setParseResult(result);
    } catch (err: any) {
      showToast('Gagal membaca file: ' + err.message, 'danger');
      setParseResult(null);
    } finally {
      setParsing(false);
    }
  };

  // Eksekusi Impor Batch
  const handleExecuteImport = async () => {
    if (!parseResult || parseResult.validRows.length === 0) return;

    try {
      setImporting(true);
      const rowsForRpc = parseResult.validRows.map((r) => ({
        jenis: r.jenis,
        kode: r.kode,
        uraian: r.uraian,
        satuan: r.satuan,
        harga: r.harga,
        wilayah: r.wilayah,
        berlaku_mulai: r.berlakuMulai,
        spesifikasi: r.spesifikasi,
      }));

      const res = await supabaseDataService.importResourcePricesBatch(rowsForRpc, workspaceId);
      showToast(res.message, 'success');
      setShowImportModal(false);
      setImportFile(null);
      setParseResult(null);
      await loadData();
    } catch (err: any) {
      showToast('Gagal mengimpor data: ' + err.message, 'danger');
    } finally {
      setImporting(false);
    }
  };

  // Badge Warna Jenis
  const renderBadgeJenis = (jenis: ResourceType) => {
    switch (jenis) {
      case 'Bahan':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/20 text-primary  ">Bahan</span>;
      case 'Upah':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-border text-success  ">Upah</span>;
      case 'Alat':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning-bg text-text-primary  ">Alat</span>;
      case 'Subkon':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800  ">Subkon</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">{jenis}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Utama */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white  p-6 rounded-xl border border-border-subtle  shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10  text-primary  rounded-lg">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-text-primary ">Katalog Harga Dasar Satuan</h1>
              <p className="text-sm text-text-muted ">
                Pustaka harga bahan, upah tenaga kerja, dan sewa alat untuk penyusunan AHSP & RAB proyek.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => downloadResourcePriceTemplate('xlsx')}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-text-secondary  bg-neutral-bg  hover:bg-neutral-bg  rounded-lg transition"
            title="Download Template Format Excel"
          >
            <Download className="w-4 h-4" />
            <span>Unduh Template</span>
          </button>

          <button
            onClick={() => exportResourcePricesToExcel(filteredItems)}
            disabled={filteredItems.length === 0}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-text-secondary  bg-neutral-bg  hover:bg-neutral-bg  disabled:opacity-50 rounded-lg transition"
          >
            <FileSpreadsheet className="w-4 h-4 text-success" />
            <span>Ekspor Excel</span>
          </button>

          <button
            onClick={() => {
              setImportFile(null);
              setParseResult(null);
              setShowImportModal(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-primary  bg-primary/10  hover:bg-primary/20  rounded-lg transition"
          >
            <Upload className="w-4 h-4" />
            <span>Impor CSV / Excel</span>
          </button>

          <button
            onClick={() => openForm()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-hover rounded-lg shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Harga</span>
          </button>
        </div>
      </div>

      {/* Ringkasan Kategori */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Semua Kategori', key: 'Semua', count: stats.total, color: 'text-text-primary ' },
          { label: 'Bahan Material', key: 'Bahan', count: stats.bahan, color: 'text-primary ' },
          { label: 'Upah Tenaga', key: 'Upah', count: stats.upah, color: 'text-success ' },
          { label: 'Sewa Alat', key: 'Alat', count: stats.alat, color: 'text-warning ' },
          { label: 'Subkontraktor', key: 'Subkon', count: stats.subkon, color: 'text-purple-600 ' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSelectedJenis(tab.key)}
            className={`p-3.5 rounded-xl border text-left transition ${
              selectedJenis === tab.key
                ? 'bg-primary/10/70  border-primary/20  ring-2 ring-primary/20'
                : 'bg-white  border-border-subtle  hover:border-border-subtle'
            }`}
          >
            <div className="text-xs text-text-muted ">{tab.label}</div>
            <div className={`text-xl font-bold mt-1 ${tab.color}`}>{tab.count}</div>
          </button>
        ))}
      </div>

      {/* Filter & Bar Pencarian */}
      <div className="flex flex-col md:flex-row items-center gap-3 bg-white  p-4 rounded-xl border border-border-subtle ">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Cari kode sumber daya, uraian bahan/upah, atau spesifikasi..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-canvas  border border-border-subtle  rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text-primary "
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <MapPin className="w-4 h-4 text-text-muted shrink-0" />
          <select
            value={selectedWilayah}
            onChange={(e) => setSelectedWilayah(e.target.value)}
            className="px-3 py-2 text-sm bg-canvas  border border-border-subtle  rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-text-primary "
          >
            {uniqueWilayahList.map((w) => (
              <option key={w} value={w}>
                Wilayah: {w || 'Umum'}
              </option>
            ))}
          </select>

          <button
            onClick={loadData}
            title="Muat Ulang"
            className="p-2 text-text-muted hover:text-text-primary  bg-neutral-bg  rounded-lg transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabel Data */}
      <div className="bg-white  rounded-xl border border-border-subtle  overflow-hidden shadow-sm">
        <ResponsiveTable
          data={filteredItems}
          renderTable={() => (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-canvas  text-text-secondary  font-medium border-b border-border-subtle ">
                  <tr>
                    <th className="py-3 px-4 w-12 text-center">No</th>
                    <th className="py-3 px-4 w-28">Kode</th>
                    <th className="py-3 px-4 w-24">Jenis</th>
                    <th className="py-3 px-4">Uraian & Spesifikasi</th>
                    <th className="py-3 px-4 w-20 text-center">Satuan</th>
                    <th className="py-3 px-4 text-right w-40">Harga Dasar</th>
                    <th className="py-3 px-4 w-32">Wilayah</th>
                    <th className="py-3 px-4 w-28">Mulai Berlaku</th>
                    <th className="py-3 px-4 text-center w-24">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 ">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-text-muted">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                        Memuat katalog harga...
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center">
                        <Layers className="w-10 h-10 text-text-muted  mx-auto mb-3" />
                        <p className="text-text-secondary  font-medium">Belum ada item harga dasar ditemukan</p>
                        <p className="text-xs text-text-muted mt-1">
                          {searchQuery
                            ? 'Tidak ada item yang cocok dengan kriteria pencarian.'
                            : 'Mulai dengan menambah harga satuan atau mengimpor file template Excel/CSV.'}
                        </p>
                        <div className="mt-4 flex items-center justify-center gap-2">
                          <button
                            onClick={() => openForm()}
                            className="px-3.5 py-1.5 text-xs font-medium text-white bg-primary hover:bg-primary-hover rounded-lg transition"
                          >
                            + Tambah Baru
                          </button>
                          <button
                            onClick={() => {
                              setShowImportModal(true);
                            }}
                            className="px-3.5 py-1.5 text-xs font-medium text-primary  bg-primary/10  rounded-lg transition"
                          >
                            Impor File
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item, idx) => (
                      <tr
                        key={item.id}
                        className="hover:bg-canvas/80  transition group"
                      >
                        <td className="py-3 px-4 text-center text-text-muted text-xs">{idx + 1}</td>
                        <td className="py-3 px-4 font-mono font-semibold text-text-secondary ">
                          {item.kode}
                        </td>
                        <td className="py-3 px-4">{renderBadgeJenis(item.jenis)}</td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-text-primary ">{item.uraian}</div>
                          {item.spesifikasi && (
                            <div className="text-xs text-text-muted  mt-0.5 line-clamp-1">
                              {item.spesifikasi}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-text-secondary ">
                          {item.satuan}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-text-primary ">
                          {formatCurrencyIDR(item.harga)}
                        </td>
                        <td className="py-3 px-4 text-text-secondary  text-xs">
                          {item.wilayah || <span className="text-text-muted italic">Umum</span>}
                        </td>
                        <td className="py-3 px-4 text-text-muted  text-xs">
                          {item.berlakuMulai}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1 opacity-80 group-hover:opacity-100">
                            <button
                              onClick={() => openForm(item)}
                              title="Ubah Item"
                              className="p-1.5 text-text-muted hover:text-primary  hover:bg-primary/10  rounded transition"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(item)}
                              title="Hapus Item"
                              className="p-1.5 text-text-muted hover:text-danger  hover:bg-danger-bg  rounded transition"
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
          )}
          renderCard={(item) => (
            <DataCard
              title={item.uraian}
              subtitle={item.kode}
              metadata={[
                { label: 'Jenis', value: renderBadgeJenis(item.jenis) },
                { label: 'Satuan', value: <span className="font-mono">{item.satuan}</span> },
                { label: 'Harga Dasar', value: formatCurrencyIDR(item.harga), highlight: true },
                {
                  label: 'Wilayah',
                  value: item.wilayah || <span className="text-text-muted italic">Umum</span>,
                },
                { label: 'Mulai Berlaku', value: item.berlakuMulai },
                ...(item.spesifikasi
                  ? [{ label: 'Spesifikasi', value: <span className="text-xs">{item.spesifikasi}</span> }]
                  : []),
              ]}
              actions={
                <div className="flex gap-2">
                  <button
                    onClick={() => openForm(item)}
                    className="flex-1 px-3 py-1.5 text-xs font-medium text-primary  bg-primary/10  hover:bg-primary/20  rounded-lg transition"
                  >
                    Ubah
                  </button>
                  <button
                    onClick={() => handleDelete(item)}
                    className="px-3 py-1.5 text-xs font-medium text-danger  bg-danger-bg  hover:bg-danger  rounded-lg transition"
                  >
                    Hapus
                  </button>
                </div>
              }
            />
          )}
        />

        {/* Footer info bar */}
        <div className="p-3 bg-canvas  border-t border-border-subtle  text-xs text-text-muted flex justify-between items-center">
          <span>Menampilkan {filteredItems.length} dari {items.length} item</span>
          <span>Standar mata uang: IDR (Bigint Rupiah)</span>
        </div>
      </div>

      {/* MODAL: Tambah / Edit Item */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white  rounded-xl shadow-xl border border-border-subtle  w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-border-subtle  flex items-center justify-between">
              <h3 className="font-bold text-text-primary ">
                {editingItem ? 'Edit Harga Dasar Satuan' : 'Tambah Harga Dasar Satuan'}
              </h3>
              <button
                onClick={() => setShowFormModal(false)}
                className="text-text-muted hover:text-text-secondary "
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary  mb-1">
                    Jenis Sumber Daya <span className="text-danger">*</span>
                  </label>
                  <select
                    value={formData.jenis}
                    onChange={(e) => setFormData({ ...formData, jenis: e.target.value as ResourceType })}
                    className="w-full px-3 py-2 text-sm bg-canvas  border border-border-subtle  rounded-lg focus:ring-2 focus:ring-primary text-text-primary "
                  >
                    <option value="Bahan">Bahan (Material)</option>
                    <option value="Upah">Upah (Tenaga Kerja)</option>
                    <option value="Alat">Alat (Peralatan)</option>
                    <option value="Subkon">Subkon (Jasa Khusus)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary  mb-1">
                    Kode Sumber Daya <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: BHN-001, UPH-002"
                    value={formData.kode}
                    onChange={(e) => setFormData({ ...formData, kode: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono bg-canvas  border border-border-subtle  rounded-lg focus:ring-2 focus:ring-primary text-text-primary "
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary  mb-1">
                  Uraian Item <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Semen Portland (PC) 50kg, Tukang Batu"
                  value={formData.uraian}
                  onChange={(e) => setFormData({ ...formData, uraian: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-canvas  border border-border-subtle  rounded-lg focus:ring-2 focus:ring-primary text-text-primary "
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary  mb-1">
                    Satuan Pengukuran <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="m3, kg, zak, OH, jam, dll."
                    value={formData.satuan}
                    onChange={(e) => setFormData({ ...formData, satuan: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-canvas  border border-border-subtle  rounded-lg focus:ring-2 focus:ring-primary text-text-primary "
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary  mb-1">
                    Harga Satuan (Rp) <span className="text-danger">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    placeholder="75000"
                    value={formData.harga}
                    onChange={(e) => setFormData({ ...formData, harga: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-semibold bg-canvas  border border-border-subtle  rounded-lg focus:ring-2 focus:ring-primary text-text-primary "
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary  mb-1">
                    Wilayah / Lokasi
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Balikpapan, IKN, Jakarta"
                    value={formData.wilayah}
                    onChange={(e) => setFormData({ ...formData, wilayah: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-canvas  border border-border-subtle  rounded-lg focus:ring-2 focus:ring-primary text-text-primary "
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary  mb-1">
                    Tanggal Mulai Berlaku
                  </label>
                  <input
                    type="date"
                    value={formData.berlakuMulai}
                    onChange={(e) => setFormData({ ...formData, berlakuMulai: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-canvas  border border-border-subtle  rounded-lg focus:ring-2 focus:ring-primary text-text-primary "
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary  mb-1">
                  Spesifikasi Teknis / Merk / Catatan
                </label>
                <textarea
                  rows={2}
                  placeholder="SNI Tipe I, Mutu K-250, Merk Gresik / Tiga Roda..."
                  value={formData.spesifikasi}
                  onChange={(e) => setFormData({ ...formData, spesifikasi: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-canvas  border border-border-subtle  rounded-lg focus:ring-2 focus:ring-primary text-text-primary "
                />
              </div>

              <div className="pt-3 border-t border-border-subtle  flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2 text-sm text-text-secondary  hover:bg-neutral-bg  rounded-lg transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-hover disabled:opacity-50 rounded-lg shadow-sm transition flex items-center gap-2"
                >
                  {formSubmitting && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>{editingItem ? 'Simpan Perubahan' : 'Tambahkan ke Katalog'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Impor Excel / CSV */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white  rounded-xl shadow-xl border border-border-subtle  w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-border-subtle  flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-text-primary ">Impor Katalog Harga Dasar (CSV / XLSX)</h3>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-text-muted hover:text-text-secondary "
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Petunjuk format & template */}
              <div className="bg-primary/10  p-4 rounded-lg border border-primary/20  text-xs text-primary  flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-semibold">Format Kolom File:</p>
                  <p className="text-primary ">
                    Kolom minimal: <strong>Kode, Jenis, Uraian, Satuan, Harga Satuan</strong> (kolom opsional: Wilayah, Spesifikasi).
                  </p>
                </div>
                <button
                  onClick={() => downloadResourcePriceTemplate('xlsx')}
                  className="shrink-0 px-2.5 py-1.5 bg-primary hover:bg-primary-hover text-white rounded font-medium flex items-center gap-1 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Template</span>
                </button>
              </div>

              {/* Upload Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border-subtle  hover:border-primary/20 rounded-xl p-6 text-center cursor-pointer transition bg-canvas "
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv, .xlsx, .xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <FileSpreadsheet className="w-10 h-10 text-text-muted mx-auto mb-2" />
                <p className="text-sm font-semibold text-text-secondary ">
                  {importFile ? importFile.name : 'Klik atau seret file CSV / Excel ke sini'}
                </p>
                <p className="text-xs text-text-muted mt-1">Mendukung format .xlsx, .xls, atau .csv (maksimal 5MB)</p>
              </div>

              {parsing && (
                <div className="text-center py-4 text-xs text-text-muted flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                  <span>Memeriksa dan membaca isi file...</span>
                </div>
              )}

              {/* Hasil Parsing Preview */}
              {parseResult && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs p-3 bg-neutral-bg  rounded-lg">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1.5 text-success font-semibold">
                        <CheckCircle2 className="w-4 h-4" />
                        {parseResult.validRows.length} baris valid siap diimpor
                      </span>
                      {parseResult.invalidRows.length > 0 && (
                        <span className="flex items-center gap-1.5 text-warning font-semibold">
                          <AlertTriangle className="w-4 h-4" />
                          {parseResult.invalidRows.length} baris tidak lengkap
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Preview tabel kecil 5 baris pertama */}
                  {parseResult.validRows.length > 0 && (
                    <div className="max-h-48 overflow-y-auto border border-border-subtle  rounded-lg text-xs">
                      <table className="w-full text-left">
                        <thead className="bg-canvas  sticky top-0 text-text-muted font-medium border-b border-border-subtle ">
                          <tr>
                            <th className="py-2 px-3">Kode</th>
                            <th className="py-2 px-3">Jenis</th>
                            <th className="py-2 px-3">Uraian</th>
                            <th className="py-2 px-3">Satuan</th>
                            <th className="py-2 px-3 text-right">Harga</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 ">
                          {parseResult.validRows.slice(0, 5).map((row, i) => (
                            <tr key={i} className="hover:bg-canvas ">
                              <td className="py-1.5 px-3 font-mono">{row.kode}</td>
                              <td className="py-1.5 px-3">{row.jenis}</td>
                              <td className="py-1.5 px-3">{row.uraian}</td>
                              <td className="py-1.5 px-3">{row.satuan}</td>
                              <td className="py-1.5 px-3 text-right font-semibold">{formatCurrencyIDR(row.harga)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {parseResult.validRows.length > 5 && (
                        <div className="p-2 text-center text-text-muted bg-canvas ">
                          ...dan {parseResult.validRows.length - 5} baris lainnya
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="pt-3 border-t border-border-subtle  flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 text-sm text-text-secondary  hover:bg-neutral-bg  rounded-lg transition"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleExecuteImport}
                  disabled={importing || !parseResult || parseResult.validRows.length === 0}
                  className="px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-hover disabled:opacity-50 rounded-lg shadow-sm transition flex items-center gap-2"
                >
                  {importing && <RefreshCw className="w-4 h-4 animate-spin" />}
                  <span>Impor {parseResult?.validRows.length || 0} Item</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourcePricesScreen;
