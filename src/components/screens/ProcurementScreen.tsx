import React, { useState, useMemo } from 'react';
import {
  Truck,
  Plus,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  Check,
  Building2,
  FileCheck,
  AlertCircle,
  XCircle,
  ShieldAlert,
  ShieldCheck
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { MetricCard } from '../common/MetricCard';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { SearchInput } from '../common/SearchInput';
import { Modal } from '../common/Modal';
import { PurchaseOrder } from '../../types';
import { formatCurrencyIDR, formatDateIndo } from '../../utils/formatters';

export const ProcurementScreen: React.FC = () => {
  const {
    purchaseOrders,
    approvePurchaseOrder,
    rejectPurchaseOrder,
    addPurchaseOrder,
    projects,
    addToast
  } = useApp();

  const { activeRole, hasAuthority, userProfile, currentUser } = useAuth();

  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('Semua');

  // Modal for New SPP / PO
  const [isNewPOModalOpen, setIsNewPOModalOpen] = useState(false);
  const [newPOForm, setNewPOForm] = useState({
    projectId: projects[0]?.id || '',
    supplierName: 'PT Semen Indonesia Distributor',
    itemDescription: 'Pengadaan Tambahan Semen PCC & Pasir Cor',
    quantitySummary: '500 sak semen, 50 m³ pasir cor',
    totalCost: '65000000',
    targetDeliveryDate: '2026-10-20',
    requester: 'Ir. Hendra Kurniawan, IPM',
  });

  // Modal for Rejecting PO
  const [rejectingPO, setRejectingPO] = useState<PurchaseOrder | null>(null);
  const [rejectionReasonText, setRejectionReasonText] = useState('Spesifikasi teknis belum diverifikasi tim struktur lapangan.');

  const filteredOrders = useMemo(() => {
    return purchaseOrders.filter((po) => {
      const matchSearch =
        po.poNumber.toLowerCase().includes(search.toLowerCase()) ||
        po.projectName.toLowerCase().includes(search.toLowerCase()) ||
        po.supplierName.toLowerCase().includes(search.toLowerCase()) ||
        po.itemDescription.toLowerCase().includes(search.toLowerCase());

      const matchStatus =
        selectedStatus === 'Semua' || po.status === selectedStatus;

      return matchSearch && matchStatus;
    });
  }, [purchaseOrders, search, selectedStatus]);

  const pendingCount = purchaseOrders.filter((p) => p.status === 'Menunggu').length;
  const inTransitCount = purchaseOrders.filter((p) => p.status === 'Dikirim').length;
  const totalSpend = purchaseOrders.reduce((a, b) => a + b.totalCost, 0);

  const handleCreatePO = (e: React.FormEvent) => {
    e.preventDefault();
    const proj = projects.find((p) => p.id === newPOForm.projectId);
    if (!proj) return;

    addPurchaseOrder({
      sppNumber: `SPP-2026-IND-0${(Math.floor(Math.random() * 80) + 10).toString()}`,
      projectId: proj.id,
      projectName: proj.name,
      supplierName: newPOForm.supplierName,
      itemDescription: newPOForm.itemDescription,
      quantitySummary: newPOForm.quantitySummary,
      totalCost: Number(newPOForm.totalCost) || 0,
      requestDate: new Date().toISOString().split('T')[0],
      targetDeliveryDate: newPOForm.targetDeliveryDate,
      requester: newPOForm.requester,
    });

    setIsNewPOModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E2E8E4]">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#69766F] mb-1">
            <span>Operasional Pengadaan</span>
            <span aria-hidden="true">·</span>
            <span>Surat Permintaan Pengadaan (SPP) & Purchase Order (PO)</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#202B26]">
            Pengadaan & Purchase Order (PO)
          </h1>
          <p className="text-xs text-[#69766F] mt-0.5">
            Kelola persetujuan pembelian material, verifikasi harga vendor, dan estimasi waktu kirim (lead time)
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => setIsNewPOModalOpen(true)}
          className="self-start sm:self-auto"
        >
          Buat SPP Pengadaan
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="SPP Menunggu Persetujuan"
          value={`${pendingCount} Dokumen`}
          subtitle="Membutuhkan paraf Project Director"
          trend={{ value: `${pendingCount} Menunggu`, isPositive: pendingCount === 0 }}
          icon={<Clock className="w-4 h-4 text-[#9E6B05]" />}
        />
        <MetricCard
          label="PO Dalam Pengiriman (In-Transit)"
          value={`${inTransitCount} Pesanan`}
          subtitle="Girder jembatan & readymix on schedule"
          icon={<Truck className="w-4 h-4 text-[#285744]" />}
        />
        <MetricCard
          label="Total Nilai Pengadaan Berjalan"
          value={formatCurrencyIDR(totalSpend)}
          subtitle="Akumulasi seluruh PO aktif"
          icon={<CheckCircle2 className="w-4 h-4 text-[#12352B]" />}
        />
        <MetricCard
          label="Rata-rata Lead Time Kirim"
          value="4,2 Hari"
          subtitle="Ketepatan waktu supplier: 94,8%"
          trend={{ value: 'Standar Industri 5 Hari', isPositive: true }}
          icon={<FileCheck className="w-4 h-4 text-[#1C6843]" />}
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-[#E2E8E4] shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Status buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {(['Semua', 'Menunggu', 'Disetujui', 'Dikirim', 'Selesai', 'Draft'] as const).map(
              (status) => {
                const isActive = selectedStatus === status;
                return (
                  <button
                    key={status}
                    onClick={() => setSelectedStatus(status)}
                    className={`h-9 px-3 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center ${
                      isActive
                        ? 'bg-[#12352B] text-white shadow-2xs font-semibold'
                        : 'text-[#69766F] hover:bg-[#F5F7F6] hover:text-[#202B26]'
                    }`}
                  >
                    {status}
                  </button>
                );
              }
            )}
          </div>

          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Cari no. PO, vendor, atau item..."
            className="w-full sm:w-64"
          />
        </div>
      </div>

      {/* PO Table */}
      <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#FAFBFB] text-[#69766F] border-b border-[#E2E8E4]">
                <th className="py-3 px-4 font-semibold text-left">Nomor PO & SPP</th>
                <th className="py-3 px-4 font-semibold text-left">Proyek Pemohon</th>
                <th className="py-3 px-4 font-semibold text-left">Vendor / Supplier</th>
                <th className="py-3 px-4 font-semibold text-left">Item & Rincian Pengadaan</th>
                <th className="py-3 px-4 font-semibold text-right">Total Biaya (IDR)</th>
                <th className="py-3 px-4 font-semibold text-left hidden md:table-cell">Target Kirim</th>
                <th className="py-3 px-4 font-semibold text-left">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8E4]/70">
              {filteredOrders.map((order) => {
                const statusVariant =
                  order.status === 'Selesai'
                    ? 'success'
                    : order.status === 'Disetujui' || order.status === 'Dikirim'
                    ? 'info'
                    : order.status === 'Menunggu'
                    ? 'warning'
                    : 'neutral';

                return (
                  <tr key={order.id} className="hover:bg-[#F5F7F6]/80 transition-colors">
                    <td className="py-3.5 px-4 font-mono whitespace-nowrap">
                      <div className="font-bold text-[#12352B]">{order.poNumber}</div>
                      <div className="text-[11px] text-[#69766F]">{order.sppNumber}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-[#202B26] max-w-[170px] truncate">
                        {order.projectName}
                      </div>
                      <div className="text-[11px] text-[#69766F] truncate max-w-[170px]">
                        Pemohon: {order.requester}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-medium text-[#202B26] max-w-[150px] truncate">
                      {order.supplierName}
                    </td>

                    <td className="py-3.5 px-4 min-w-[200px]">
                      <div className="font-medium text-[#202B26] leading-snug">
                        {order.itemDescription}
                      </div>
                      <div className="text-[11px] text-[#69766F] mt-0.5">
                        {order.quantitySummary}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-bold text-[#202B26] tabular-nums whitespace-nowrap text-right">
                      {formatCurrencyIDR(order.totalCost)}
                    </td>

                    <td className="py-3.5 px-4 hidden md:table-cell font-mono tabular-nums text-[#69766F] whitespace-nowrap">
                      {formatDateIndo(order.targetDeliveryDate)}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <Badge variant={statusVariant} size="sm" dot>
                        {order.status}
                      </Badge>
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      {order.status === 'Menunggu' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="primary"
                            size="xs"
                            onClick={() => {
                              if (!hasAuthority('purchaseOrder')) {
                                addToast({
                                  type: 'danger',
                                  title: 'Otoritas Tidak Memadai',
                                  message: `Peran "${activeRole}" tidak memiliki hak persetujuan PO. Otoritas ini memerlukan peran Owner / Director, Finance / Accounting, atau Project Manager.`,
                                });
                                return;
                              }
                              const approver = userProfile?.name || currentUser?.displayName || 'Ir. Bambang Sujarwo, IPU (Director)';
                              approvePurchaseOrder(order.id, approver);
                            }}
                            leftIcon={<Check className="w-3.5 h-3.5" />}
                          >
                            Setujui
                          </Button>
                          <Button
                            variant="danger"
                            size="xs"
                            onClick={() => {
                              if (!hasAuthority('purchaseOrder')) {
                                addToast({
                                  type: 'danger',
                                  title: 'Otoritas Tidak Memadai',
                                  message: `Peran "${activeRole}" tidak berwenang menolak PO resmi.`,
                                });
                                return;
                              }
                              setRejectingPO(order);
                            }}
                            leftIcon={<XCircle className="w-3.5 h-3.5" />}
                          >
                            Tolak
                          </Button>
                        </div>
                      ) : order.status === 'Ditolak' ? (
                        <div className="text-right">
                          <span className="text-[11px] font-bold text-[#A82A20]">Ditolak</span>
                          {order.rejectionReason && (
                            <div className="text-[10px] text-[#69766F] max-w-[130px] truncate" title={`Alasan: ${order.rejectionReason}`}>
                              {order.rejectionReason}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-[#69766F] font-mono">
                          {order.approvedBy ? `Disetujui (${order.approvedBy.split(' ')[0]})` : order.status}
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

      {/* Modal: Create SPP */}
      <Modal
        isOpen={isNewPOModalOpen}
        onClose={() => setIsNewPOModalOpen(false)}
        title="Buat Surat Permintaan Pengadaan (SPP)"
        description="Ajukan pembelian material atau sewa alat berat baru untuk diterbitkan Purchase Order (PO)."
        maxWidth="lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setIsNewPOModalOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreatePO}>
              Kirim untuk Persetujuan
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreatePO} className="space-y-4 text-xs">
          <div>
            <label className="block font-medium text-[#202B26] mb-1">Pilih Proyek Pemohon</label>
            <select
              value={newPOForm.projectId}
              onChange={(e) => setNewPOForm({ ...newPOForm, projectId: e.target.value })}
              className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
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
              <label className="block font-medium text-[#202B26] mb-1">Nama Vendor / Supplier</label>
              <input
                type="text"
                value={newPOForm.supplierName}
                onChange={(e) => setNewPOForm({ ...newPOForm, supplierName: e.target.value })}
                className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
              />
            </div>

            <div>
              <label className="block font-medium text-[#202B26] mb-1">Estimasi Total Biaya (IDR)</label>
              <input
                type="number"
                value={newPOForm.totalCost}
                onChange={(e) => setNewPOForm({ ...newPOForm, totalCost: e.target.value })}
                className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg font-mono text-[#202B26]"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-[#202B26] mb-1">Deskripsi Item Material</label>
            <input
              type="text"
              value={newPOForm.itemDescription}
              onChange={(e) => setNewPOForm({ ...newPOForm, itemDescription: e.target.value })}
              className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-[#202B26] mb-1">Rincian Volume / Kuantitas</label>
              <input
                type="text"
                value={newPOForm.quantitySummary}
                onChange={(e) => setNewPOForm({ ...newPOForm, quantitySummary: e.target.value })}
                className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
              />
            </div>

            <div>
              <label className="block font-medium text-[#202B26] mb-1">Target Tiba di Lapangan</label>
              <input
                type="date"
                value={newPOForm.targetDeliveryDate}
                onChange={(e) => setNewPOForm({ ...newPOForm, targetDeliveryDate: e.target.value })}
                className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* Modal: Reject PO */}
      {rejectingPO && (
        <Modal
          isOpen={true}
          onClose={() => setRejectingPO(null)}
          title={`Tolak Pengajuan PO ${rejectingPO.poNumber}`}
          description={`Pengajuan dari ${rejectingPO.requester} untuk ${rejectingPO.projectName} (Rp ${rejectingPO.totalCost.toLocaleString('id-ID')}).`}
          maxWidth="md"
          footer={
            <>
              <Button variant="secondary" size="sm" onClick={() => setRejectingPO(null)}>
                Batal
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  if (!rejectionReasonText.trim()) {
                    addToast({
                      type: 'warning',
                      message: 'Alasan penolakan wajib diisi untuk kepatuhan tata kelola audit.',
                    });
                    return;
                  }
                  const rejector = userProfile?.name || currentUser?.displayName || `${activeRole}`;
                  rejectPurchaseOrder(rejectingPO.id, rejector, rejectionReasonText.trim());
                  setRejectingPO(null);
                  setRejectionReasonText('');
                }}
              >
                Konfirmasi Penolakan
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-[#FAFBFB] rounded-lg border border-[#E2E8E4] space-y-1.5">
              <div className="flex justify-between">
                <span className="text-[#69766F]">Nomor SPP / PO:</span>
                <span className="font-mono font-bold text-[#202B26]">{rejectingPO.poNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#69766F]">Vendor / Supplier:</span>
                <span className="font-semibold text-[#202B26]">{rejectingPO.supplierName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#69766F]">Uraian Item:</span>
                <span className="text-[#202B26]">{rejectingPO.itemDescription}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#69766F]">Nilai Total Transaksi:</span>
                <span className="font-mono font-bold text-[#A82A20]">
                  Rp {rejectingPO.totalCost.toLocaleString('id-ID')}
                </span>
              </div>
            </div>

            <div>
              <label className="block font-medium text-[#202B26] mb-1">
                Alasan Penolakan Resmi (Wajib Audit) <span className="text-[#A82A20]">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={rejectionReasonText}
                onChange={(e) => setRejectionReasonText(e.target.value)}
                placeholder="Contoh: Melebihi plafon subkontraktor, harga satuan di atas HPS..."
                className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26] focus:outline-none focus:border-[#12352B]"
              />
              <p className="text-[11px] text-[#69766F] mt-1">
                Catatan ini akan tersimpan permanen di riwayat audit dan diteruskan ke pemohon pengadaan.
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
