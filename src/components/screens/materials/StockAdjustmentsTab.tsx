import React, { useState } from 'react';
import { Plus, Check, XCircle, Paperclip } from 'lucide-react';
import { Button } from '../../common/Button';
import { Badge } from '../../common/Badge';
import { Modal } from '../../common/Modal';
import { AttachmentUploader } from '../../common/AttachmentUploader';
import { StockAdjustment } from '../../../types';
import { formatDateIndo } from '../../../utils/formatters';

interface StockAdjustmentsTabProps {
  stockAdjustments: StockAdjustment[];
  canApproveAdjustment: boolean;
  onOpenNewAdjustment: () => void;
  onApproveAdjustment: (adj: StockAdjustment) => void;
  onRequestRejectAdjustment: (adj: StockAdjustment) => void;
}

export const StockAdjustmentsTab: React.FC<StockAdjustmentsTabProps> = ({
  stockAdjustments,
  canApproveAdjustment,
  onOpenNewAdjustment,
  onApproveAdjustment,
  onRequestRejectAdjustment,
}) => {
  const [selectedAdjForAttachment, setSelectedAdjForAttachment] = useState<StockAdjustment | null>(null);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-[#E2E8E4] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-[#202B26]">
              Daftar Pengajuan Penyesuaian Stok & Opname Fisik
            </h2>
            <p className="text-xs text-[#69766F] mt-0.5">
              Setiap penyesuaian selisih stok gudang site memerlukan Berita Acara dan persetujuan Manajer Proyek
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={onOpenNewAdjustment}
          >
            Buat Pengajuan Opname
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#FAFBFB] text-[#69766F] border-b border-[#E2E8E4]">
                <th className="py-3 px-4 font-semibold">No. Dokumen Opname</th>
                <th className="py-3 px-4 font-semibold">Material & Proyek</th>
                <th className="py-3 px-4 font-semibold text-right">Stok Sistem</th>
                <th className="py-3 px-4 font-semibold text-right">Fisik Opname</th>
                <th className="py-3 px-4 font-semibold text-right">Selisih (+/-)</th>
                <th className="py-3 px-4 font-semibold">Alasan & Bukti Berita Acara</th>
                <th className="py-3 px-4 font-semibold">Pengaju & Tanggal</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Aksi Persetujuan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8E4]/70">
              {stockAdjustments.map((adj) => {
                const isPending = adj.status === 'Menunggu';
                const isApproved = adj.status === 'Disetujui';
                const isRejected = adj.status === 'Ditolak';

                return (
                  <tr key={adj.id} className="hover:bg-[#F5F7F6]/80 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-[#12352B] whitespace-nowrap">
                      {adj.adjustmentNo}
                    </td>

                    <td className="py-3.5 px-4 min-w-[200px]">
                      <div className="font-semibold text-[#202B26]">{adj.materialName}</div>
                      <div className="text-xs text-[#69766F]">{adj.projectName}</div>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-right tabular-nums text-[#69766F]">
                      {adj.previousStock.toLocaleString('id-ID')} {adj.unit}
                    </td>

                    <td className="py-3.5 px-4 font-mono font-bold text-right tabular-nums text-[#202B26]">
                      {adj.physicalStock.toLocaleString('id-ID')} {adj.unit}
                    </td>

                    <td className="py-3.5 px-4 font-mono font-bold text-right tabular-nums">
                      <span
                        className={
                          adj.varianceQuantity < 0
                            ? 'text-[#A82A20]'
                            : adj.varianceQuantity > 0
                            ? 'text-[#1C6843]'
                            : 'text-[#69766F]'
                        }
                      >
                        {adj.varianceQuantity > 0 ? '+' : ''}
                        {adj.varianceQuantity.toLocaleString('id-ID')} {adj.unit}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 min-w-[180px]">
                      <div className="font-medium text-[#202B26]">{adj.reason}</div>
                      <div className="text-xs text-[#285744] font-mono mt-0.5">
                        BA: {adj.evidenceRef}
                      </div>
                      {adj.rejectionReason && (
                        <div className="text-xs text-[#A82A20] mt-1 bg-[#FCE8E6] p-1.5 rounded">
                          Alasan tolak: {adj.rejectionReason}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-[#69766F] whitespace-nowrap">
                      <div>{adj.submittedBy}</div>
                      <div className="text-xs font-mono">
                        {formatDateIndo(adj.submittedAt)}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <Badge
                        variant={isApproved ? 'success' : isRejected ? 'danger' : 'warning'}
                        size="sm"
                        dot
                      >
                        {adj.status}
                      </Badge>
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      {isPending ? (
                        canApproveAdjustment ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="primary"
                              size="xs"
                              leftIcon={<Check className="w-3 h-3" />}
                              onClick={() => onApproveAdjustment(adj)}
                            >
                              Setujui
                            </Button>
                            <Button
                              variant="danger"
                              size="xs"
                              leftIcon={<XCircle className="w-3 h-3" />}
                              onClick={() => onRequestRejectAdjustment(adj)}
                            >
                              Tolak
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-[#9E6B05] font-medium bg-[#FFF8EC] px-2 py-1 rounded border border-[#FCE6B1]">
                            Perlu Paraf PM
                          </span>
                        )
                      ) : (
                        <div className="text-xs text-[#69766F]">
                          <span className="font-medium text-[#202B26]">{adj.reviewedBy}</span>
                          <div className="font-mono text-xs">
                            {adj.reviewedAt ? formatDateIndo(adj.reviewedAt) : '-'}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-1.5 mt-2">
                        <button
                          type="button"
                          onClick={() => setSelectedAdjForAttachment(adj)}
                          className="min-h-[44px] px-2.5 py-1 rounded-lg text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition text-xs inline-flex items-center gap-1 cursor-pointer"
                          title="Lihat / Unggah Bukti Berita Acara & Foto Opname"
                        >
                          <Paperclip className="w-3.5 h-3.5" />
                          <span>BA & Foto</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Lampiran Opname Fisik */}
      {selectedAdjForAttachment && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedAdjForAttachment(null)}
          title={`Bukti Berita Acara — ${selectedAdjForAttachment.adjustmentNo}`}
          description={`Unggah foto fisik barang di gudang site atau scan Berita Acara (BA) untuk opname ${selectedAdjForAttachment.reason}.`}
          maxWidth="lg"
          footer={
            <Button variant="secondary" size="sm" onClick={() => setSelectedAdjForAttachment(null)} className="min-h-[44px]">
              Tutup
            </Button>
          }
        >
          <AttachmentUploader
            workspaceId={selectedAdjForAttachment.workspaceId || ''}
            recordType="stock_adjustment"
            recordId={selectedAdjForAttachment.id}
            title={`Lampiran Berita Acara ${selectedAdjForAttachment.adjustmentNo}`}
          />
        </Modal>
      )}
    </div>
  );
};
