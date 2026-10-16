import React, { useState } from 'react';
import { Plus, Paperclip } from 'lucide-react';
import { Button } from '../../common/Button';
import { Badge } from '../../common/Badge';
import { EmptyState } from '../../common/EmptyState';
import { Modal } from '../../common/Modal';
import { AttachmentUploader } from '../../common/AttachmentUploader';
import { PettyCashEntry } from '../../../types';
import { formatCurrencyIDR, formatDateIndo } from '../../../utils/formatters';

interface PettyCashTabProps {
  projectPettyCash: PettyCashEntry[];
  hasAccessToProject: boolean;
  canReview: boolean;
  approverName: string;
  disburserName: string;
  onOpenNewPetty: () => void;
  onApprovePettyCash: (id: string) => void;
  onRequestRejectPetty: (item: PettyCashEntry) => void;
  onDisbursePettyCash: (id: string) => void;
}

export const PettyCashTab: React.FC<PettyCashTabProps> = ({
  projectPettyCash,
  hasAccessToProject,
  canReview,
  approverName,
  disburserName,
  onOpenNewPetty,
  onApprovePettyCash,
  onRequestRejectPetty,
  onDisbursePettyCash,
}) => {
  const [selectedPettyForAttachment, setSelectedPettyForAttachment] = useState<PettyCashEntry | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white rounded-xl border border-[#E2E8E4] shadow-2xs">
        <div>
          <h2 className="text-sm font-bold text-[#202B26]">Kas Kecil Lapangan (Petty Cash Site)</h2>
          <p className="text-xs text-[#69766F] mt-0.5">
            Pengeluaran operasional mendesak di bawah Rp 5.000.000 dengan lampiran bukti nota fisik
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={onOpenNewPetty}
        >
          Ajukan Kas Kecil
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-[#E2E8E4] shadow-2xs overflow-hidden">
        {projectPettyCash.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="Belum Ada Transaksi Kas Kecil"
              description="Belum ada pencatatan kas kecil site untuk proyek ini."
              actionLabel={hasAccessToProject ? 'Ajukan Klaim Kas Kecil' : undefined}
              onAction={hasAccessToProject ? onOpenNewPetty : undefined}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#FAFBFB] text-[#69766F] border-b border-[#E2E8E4]">
                  <th className="py-3 px-4 font-semibold text-left">No. Voucher</th>
                  <th className="py-3 px-4 font-semibold text-left">Uraian Keperluan</th>
                  <th className="py-3 px-4 font-semibold text-left">Kategori</th>
                  <th className="py-3 px-4 font-semibold text-right">Jumlah (IDR)</th>
                  <th className="py-3 px-4 font-semibold text-left">Status</th>
                  <th className="py-3 px-4 font-semibold text-left">Pengaju</th>
                  <th className="py-3 px-4 font-semibold text-center">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8E4]/70">
                {projectPettyCash.map((item) => {
                  const isPending = item.status === 'Menunggu';
                  const isApproved = item.status === 'Disetujui';

                  return (
                    <tr key={item.id} className="hover:bg-[#F5F7F6]/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-[#12352B]">
                        {item.pettyCashNo}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[#202B26]">{item.purpose}</div>
                        <div className="text-xs text-[#69766F] font-mono mt-0.5">
                          Lampiran: {item.receiptProof}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-[#69766F] whitespace-nowrap">
                        {item.category}
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-[#202B26] tabular-nums whitespace-nowrap text-right">
                        {formatCurrencyIDR(item.amount)}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <Badge
                          variant={
                            item.status === 'Dicairkan'
                              ? 'success'
                              : item.status === 'Disetujui'
                              ? 'info'
                              : item.status === 'Ditolak'
                              ? 'danger'
                              : 'warning'
                          }
                          size="sm"
                        >
                          {item.status}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4 text-[#69766F]">
                        <div>{item.requester}</div>
                        <div className="text-xs font-mono text-[#4F5D56]">
                          {formatDateIndo(item.submittedAt)}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {isPending && canReview ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => onApprovePettyCash(item.id)}
                              className="px-2.5 py-1 text-xs font-semibold text-white bg-[#12352B] hover:bg-[#1C4D3F] rounded transition-colors cursor-pointer"
                            >
                              Setujui
                            </button>
                            <button
                              onClick={() => onRequestRejectPetty(item)}
                              className="px-2.5 py-1 text-xs font-semibold text-[#A82A20] bg-white border border-[#A82A20]/30 hover:bg-[#FDEDEC] rounded transition-colors cursor-pointer"
                            >
                              Tolak
                            </button>
                          </div>
                        ) : isApproved && canReview ? (
                          <button
                            onClick={() => onDisbursePettyCash(item.id)}
                            className="px-2.5 py-1 text-xs font-semibold text-white bg-[#1C6843] hover:bg-[#144D32] rounded transition-colors cursor-pointer"
                          >
                            Cairkan Dana
                          </button>
                        ) : (
                          <span className="text-xs text-[#4F5D56] font-mono">
                            {item.disbursedBy
                              ? `Dicairkan: ${item.disbursedBy}`
                              : item.reviewedBy
                              ? `Disetujui: ${item.reviewedBy}`
                              : '—'}
                          </span>
                        )}

                        <div className="flex items-center justify-center gap-1.5 mt-2">
                          <button
                            type="button"
                            onClick={() => setSelectedPettyForAttachment(item)}
                            className="min-h-[44px] px-2.5 py-1 rounded-lg text-primary hover:text-primary-hover bg-primary/10 hover:bg-primary/15 border border-primary/20 transition text-xs inline-flex items-center gap-1 cursor-pointer"
                            title="Lihat / Unggah Bukti Nota & Kuitansi Kas Kecil"
                          >
                            <Paperclip className="w-3.5 h-3.5" />
                            <span>Nota & Bukti</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Lampiran Nota Kas Kecil */}
      {selectedPettyForAttachment && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedPettyForAttachment(null)}
          title={`Bukti Nota & Kuitansi — ${selectedPettyForAttachment.pettyCashNo}`}
          description={`Unggah foto nota fisik, kuitansi toko material, atau bon pembayaran untuk keperluan: ${selectedPettyForAttachment.purpose}.`}
          maxWidth="lg"
          footer={
            <Button variant="secondary" size="sm" onClick={() => setSelectedPettyForAttachment(null)} className="min-h-[44px]">
              Tutup
            </Button>
          }
        >
          <AttachmentUploader
            workspaceId={selectedPettyForAttachment.workspaceId || ''}
            recordType="petty_cash"
            recordId={selectedPettyForAttachment.id}
            title={`Nota Kas Kecil ${selectedPettyForAttachment.pettyCashNo}`}
          />
        </Modal>
      )}
    </div>
  );
};
