import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Boxes,
  AlertTriangle,
  CheckCircle2,
  Scale,
  Plus,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { getWitaDateISO } from '../../utils/formatters';
import { MetricCard } from '../common/MetricCard';
import { Button } from '../common/Button';
import { SearchInput } from '../common/SearchInput';
import { Modal } from '../common/Modal';
import { MaterialItem, StockAdjustment } from '../../types';
import { MaterialsStockTable } from './materials/MaterialsStockTable';
import { StockMutationsTable } from './materials/StockMutationsTable';
import { StockAdjustmentsTab } from './materials/StockAdjustmentsTab';
import { StockMutationModal } from './materials/StockMutationModal';
import { StockAdjustmentModal } from './materials/StockAdjustmentModal';

export const MaterialsScreen: React.FC = () => {
  const {
    materials,
    stockMutations,
    addStockMutation,
    stockAdjustments,
    submitStockAdjustment,
    approveStockAdjustment,
    rejectStockAdjustment,
    addToast,
  } = useApp();

  const { activeRole, hasAuthority, userProfile, currentUser } = useAuth();
  const canApproveAdjustment =
    hasAuthority('stockAdjustment') ||
    activeRole === 'Owner / Director' ||
    activeRole === 'Project Manager';

  const [searchParams, setSearchParams] = useSearchParams();
  
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [selectedCategory, setSelectedCategory] = useState<string>(searchParams.get('category') || 'Semua');
  const [selectedStatus, setSelectedStatus] = useState<string>(searchParams.get('status') || 'Semua');
  const [activeTab, setActiveTab] = useState<'inventory' | 'mutations' | 'adjustments'>((searchParams.get('tab') as any) || 'inventory');

  // Sync search to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (selectedCategory !== 'Semua') params.set('category', selectedCategory);
    if (selectedStatus !== 'Semua') params.set('status', selectedStatus);
    if (activeTab !== 'inventory') params.set('tab', activeTab);
    setSearchParams(params);
  }, [search, selectedCategory, selectedStatus, activeTab, setSearchParams]);

  // Modal State for New Stock Mutation
  const [isMutationModalOpen, setIsMutationModalOpen] = useState(false);
  const [mutationForm, setMutationForm] = useState({
    materialId: materials[0]?.id || '',
    type: 'Keluar' as 'Masuk' | 'Keluar',
    quantity: '100',
    referenceNo: 'SJ-OUT-2026-10-101',
    project: 'Menara Nusantara Office (Lt. 22)',
    handler: 'Yusuf Maulana (Logistik)',
  });

  // Modal State for New Stock Adjustment (Opname Fisik)
  const [isAdjModalOpen, setIsAdjModalOpen] = useState(false);
  const [adjForm, setAdjForm] = useState({
    materialId: materials[0]?.id || '',
    physicalStock: '',
    reason: 'Kerusakan Fisik di Site' as StockAdjustment['reason'],
    evidenceRef: 'BA-OPNAME-SITE-01.pdf',
  });

  // Modal State for Rejecting Adjustment
  const [rejectingAdj, setRejectingAdj] = useState<StockAdjustment | null>(null);
  const [adjRejectReason, setAdjRejectReason] = useState('Volume selisih belum diverifikasi oleh tim Quantity Surveyor.');

  const filteredMaterials = useMemo(() => {
    return materials.filter((m) => {
      const matchSearch =
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.code.toLowerCase().includes(search.toLowerCase()) ||
        m.allocatedProject.toLowerCase().includes(search.toLowerCase()) ||
        m.primarySupplier.toLowerCase().includes(search.toLowerCase());

      const matchCategory = selectedCategory === 'Semua' || m.category === selectedCategory;
      const matchStatus = selectedStatus === 'Semua' || m.status === selectedStatus;

      return matchSearch && matchCategory && matchStatus;
    });
  }, [materials, search, selectedCategory, selectedStatus]);

  const totalItems = materials.length;
  const criticalItems = materials.filter((m) => m.status === 'Kritis').length;
  const lowItems = materials.filter((m) => m.status === 'Menipis').length;
  const safeItems = materials.filter((m) => m.status === 'Aman').length;
  const pendingAdjCount = stockAdjustments.filter((a) => a.status === 'Menunggu').length;

  const handleCreateMutation = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(mutationForm.quantity);
    if (!qty || qty <= 0) {
      addToast({ type: 'warning', message: 'Jumlah kuantitas harus lebih dari 0' });
      return;
    }

    const mat = materials.find((m) => m.id === mutationForm.materialId);
    if (!mat) return;

    if (mutationForm.type === 'Keluar' && qty > mat.currentStock) {
      addToast({
        type: 'danger',
        message: `Stok tidak mencukupi! Tersedia hanya ${mat.currentStock} ${mat.unit}.`,
      });
      return;
    }

    try {
      await addStockMutation({
        materialId: mat.id,
        materialName: mat.name,
        date: getWitaDateISO(),
        type: mutationForm.type,
        quantity: qty,
        unit: mat.unit,
        referenceNo: mutationForm.referenceNo,
        project: mutationForm.project,
        handler: mutationForm.handler,
      });

      setIsMutationModalOpen(false);
      setMutationForm({
        ...mutationForm,
        quantity: '',
        referenceNo: `SJ-${Date.now().toString().slice(-6)}`,
      });
    } catch {
      // Handled in context
    }
  };

  const handleCreateAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    const phys = Number(adjForm.physicalStock);
    if (isNaN(phys) || phys < 0) {
      addToast({ type: 'warning', message: 'Stok fisik riil harus berupa angka valid >= 0' });
      return;
    }

    const mat = materials.find((m) => m.id === adjForm.materialId);
    if (!mat) return;

    const diff = phys - mat.currentStock;
    if (diff === 0) {
      addToast({
        type: 'info',
        message: 'Hasil hitungan fisik sama dengan stok sistem (tidak ada selisih).',
      });
      return;
    }

    try {
      await submitStockAdjustment({
        materialId: mat.id,
        materialCode: mat.code,
        materialName: mat.name,
        unit: mat.unit,
        previousStock: mat.currentStock,
        physicalStock: phys,
        varianceQuantity: diff,
        reason: adjForm.reason,
        evidenceRef: adjForm.evidenceRef,
        submittedBy: userProfile?.name || currentUser?.displayName || 'Logistik Site',
        projectId: mat.allocatedProject,
        projectName: mat.allocatedProject,
      });

      setIsAdjModalOpen(false);
      setAdjForm({
        ...adjForm,
        physicalStock: '',
      });
    } catch {
      // Handled in context
    }
  };

  const handleApproveAdjustment = (adj: StockAdjustment) => {
    const approver = userProfile?.name || currentUser?.displayName || 'Project Manager';
    approveStockAdjustment(adj.id, approver);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E2E8E4]">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#69766F] mb-1">
            <span>Manajemen Logistik</span>
            <span aria-hidden="true">·</span>
            <span>Kontrol Gudang & Mutasi</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#202B26]">
            Inventaris & Pengendalian Material
          </h1>
          <p className="text-xs text-[#69766F] mt-0.5">
            Monitoring stok riil di gudang seluruh site proyek dan pencatatan mutasi surat jalan
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Scale className="w-4 h-4" />}
            onClick={() => setIsAdjModalOpen(true)}
          >
            Ajukan Opname / Koreksi
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => setIsMutationModalOpen(true)}
          >
            Input Mutasi Material
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total Ragam Material"
          value={`${totalItems} Item`}
          subtitle="Tercatat aktif di seluruh site"
          icon={<Boxes className="w-4 h-4 text-[#12352B]" />}
        />
        <MetricCard
          label="Stok Aman / Tersedia"
          value={`${safeItems} Item`}
          subtitle="Memenuhi batas buffer kerja 14 hari"
          trend={{ value: `${Math.round((safeItems / (totalItems || 1)) * 100)}% Aman`, isPositive: true }}
          icon={<CheckCircle2 className="w-4 h-4 text-[#1C6843]" />}
        />
        <MetricCard
          label="Stok Kritis / Menipis"
          value={`${lowItems + criticalItems} Item`}
          subtitle={`${criticalItems} item di bawah batas darurat`}
          trend={{ value: criticalItems > 0 ? 'Perlu SPP Cepat' : 'Terkontrol', isPositive: criticalItems === 0 }}
          icon={<AlertTriangle className="w-4 h-4 text-[#A82A20]" />}
        />
        <MetricCard
          label="Opname Menunggu Approval"
          value={`${pendingAdjCount} Dokumen`}
          subtitle="Memerlukan tanda tangan Manajer Proyek"
          trend={{ value: `${pendingAdjCount} Tertunda`, isPositive: pendingAdjCount === 0 }}
          icon={<Scale className="w-4 h-4 text-[#9E6B05]" />}
        />
      </div>

      {/* Tabs & Filters */}
      <div className="bg-white p-3 rounded-xl border border-[#E2E8E4] shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center p-1 bg-[#EAEFEA] rounded-lg gap-1" role="tablist">
            <button
              role="tab"
              aria-selected={activeTab === 'inventory'}
              onClick={() => setActiveTab('inventory')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
                activeTab === 'inventory'
                  ? 'bg-white text-[#12352B] shadow-2xs font-semibold'
                  : 'text-[#4F5D56] hover:text-[#202B26]'
              }`}
            >
              Inventori Stok ({materials.length})
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'mutations'}
              onClick={() => setActiveTab('mutations')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
                activeTab === 'mutations'
                  ? 'bg-white text-[#12352B] shadow-2xs font-semibold'
                  : 'text-[#4F5D56] hover:text-[#202B26]'
              }`}
            >
              Log Mutasi Surat Jalan ({stockMutations.length})
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'adjustments'}
              onClick={() => setActiveTab('adjustments')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'adjustments'
                  ? 'bg-white text-[#12352B] shadow-2xs font-semibold'
                  : 'text-[#4F5D56] hover:text-[#202B26]'
              }`}
            >
              <span>Penyesuaian Opname Fisik</span>
              {pendingAdjCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-xs font-bold bg-[#A82A20] text-white">
                  {pendingAdjCount}
                </span>
              )}
            </button>
          </div>

          {activeTab === 'inventory' && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Cari nama, kode, supplier..."
                className="w-full sm:w-56"
              />

              <select
                aria-label="Filter Kategori Material"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="h-9 bg-white border border-[#E2E8E4] rounded-lg px-3 text-xs font-medium text-[#202B26] hover:border-[#CBD5CF] focus:outline-none focus:border-[#12352B] focus:ring-1 focus:ring-[#12352B] transition-colors cursor-pointer"
              >
                <option value="Semua">Semua Kategori</option>
                <option value="Besi & Baja">Besi & Baja</option>
                <option value="Semen & Pasir">Semen & Pasir</option>
                <option value="Beton Readymix">Beton Readymix</option>
                <option value="Arsitektural">Arsitektural</option>
                <option value="MEP & Utilitas">MEP & Utilitas</option>
              </select>

              <select
                aria-label="Filter Status Material"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="h-9 bg-white border border-[#E2E8E4] rounded-lg px-3 text-xs font-medium text-[#202B26] hover:border-[#CBD5CF] focus:outline-none focus:border-[#12352B] focus:ring-1 focus:ring-[#12352B] transition-colors cursor-pointer"
              >
                <option value="Semua">Semua Status</option>
                <option value="Aman">Aman</option>
                <option value="Menipis">Menipis</option>
                <option value="Kritis">Kritis</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Tab 1: Inventory Table */}
      {activeTab === 'inventory' && (
        <MaterialsStockTable
          filteredMaterials={filteredMaterials}
          onOpenMutation={(mat) => {
            setMutationForm({
              ...mutationForm,
              materialId: mat.id,
              project: mat.allocatedProject,
            });
            setIsMutationModalOpen(true);
          }}
          onOpenAdjustment={(mat) => {
            setAdjForm({
              ...adjForm,
              materialId: mat.id,
              physicalStock: mat.currentStock.toString(),
            });
            setIsAdjModalOpen(true);
          }}
        />
      )}

      {/* Tab 2: Stock Mutations Log */}
      {activeTab === 'mutations' && <StockMutationsTable stockMutations={stockMutations} />}

      {/* Tab 3: Stock Adjustments */}
      {activeTab === 'adjustments' && (
        <StockAdjustmentsTab
          stockAdjustments={stockAdjustments}
          canApproveAdjustment={canApproveAdjustment}
          onOpenNewAdjustment={() => setIsAdjModalOpen(true)}
          onApproveAdjustment={handleApproveAdjustment}
          onRequestRejectAdjustment={(adj) => setRejectingAdj(adj)}
        />
      )}

      {/* Modal: Input Mutasi Material */}
      <StockMutationModal
        isOpen={isMutationModalOpen}
        onClose={() => setIsMutationModalOpen(false)}
        materials={materials}
        mutationForm={mutationForm}
        setMutationForm={setMutationForm}
        onSubmit={handleCreateMutation}
      />

      {/* Modal: Ajukan Opname Fisik */}
      <StockAdjustmentModal
        isOpen={isAdjModalOpen}
        onClose={() => setIsAdjModalOpen(false)}
        materials={materials}
        adjForm={adjForm}
        setAdjForm={setAdjForm}
        onSubmit={handleCreateAdjustment}
      />

      {/* Modal: Tolak Pengajuan Opname */}
      {rejectingAdj && (
        <Modal
          isOpen={true}
          onClose={() => setRejectingAdj(null)}
          title={`Tolak Pengajuan Koreksi ${rejectingAdj.adjustmentNo}`}
          description={`Pengajuan dari ${rejectingAdj.submittedBy} untuk ${rejectingAdj.materialName}.`}
          maxWidth="md"
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={() => setRejectingAdj(null)}>
                Batal
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  if (!adjRejectReason.trim()) {
                    addToast({
                      type: 'warning',
                      message: 'Alasan penolakan wajib diisi untuk catatan jejak audit.',
                    });
                    return;
                  }
                  const rejector = userProfile?.name || currentUser?.displayName || `${activeRole}`;
                  rejectStockAdjustment(rejectingAdj.id, rejector, adjRejectReason.trim());
                  setRejectingAdj(null);
                }}
              >
                Konfirmasi Penolakan
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-[#FAFBFB] rounded-lg border border-[#E2E8E4] space-y-1">
              <div className="flex justify-between">
                <span className="text-[#69766F]">Dokumen Opname:</span>
                <span className="font-mono font-bold text-[#202B26]">{rejectingAdj.adjustmentNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#69766F]">Material:</span>
                <span className="font-semibold text-[#202B26]">{rejectingAdj.materialName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#69766F]">Selisih Kuantitas:</span>
                <span className="font-mono font-bold text-[#A82A20]">
                  {rejectingAdj.varianceQuantity} {rejectingAdj.unit}
                </span>
              </div>
            </div>

            <div>
              <label htmlFor="adj-reject-reason-input" className="block font-medium text-[#202B26] mb-1">
                Alasan Penolakan Resmi (Wajib Audit) <span className="text-[#A82A20]">*</span>
              </label>
              <textarea
                id="adj-reject-reason-input"
                rows={3}
                required
                value={adjRejectReason}
                onChange={(e) => setAdjRejectReason(e.target.value)}
                className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
