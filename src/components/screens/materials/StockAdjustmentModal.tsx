import React from 'react';
import { Modal } from '../../common/Modal';
import { Button } from '../../common/Button';
import { MaterialItem, StockAdjustment } from '../../../types';

interface StockAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  materials: MaterialItem[];
  adjForm: {
    materialId: string;
    physicalStock: string;
    reason: StockAdjustment['reason'];
    evidenceRef: string;
  };
  setAdjForm: React.Dispatch<
    React.SetStateAction<{
      materialId: string;
      physicalStock: string;
      reason: StockAdjustment['reason'];
      evidenceRef: string;
    }>
  >;
  onSubmit: (e: React.FormEvent) => void;
}

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
  isOpen,
  onClose,
  materials,
  adjForm,
  setAdjForm,
  onSubmit,
}) => {
  if (!isOpen) return null;

  const currentMat = materials.find((m) => m.id === adjForm.materialId) || materials[0];
  const phys = Number(adjForm.physicalStock) || 0;
  const variance = phys - (currentMat?.currentStock || 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Pengajuan Koreksi Stok / Opname Fisik"
      description="Catat rekonsiliasi antara stok sistem dengan fisik riil gudang lapangan. Memerlukan audit dan approval resmi."
      maxWidth="md"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Batal
          </Button>
          <Button variant="primary" size="sm" onClick={onSubmit}>
            Kirim untuk Persetujuan
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-3.5 text-xs">
        <div>
          <label htmlFor="adj-mat-input" className="block font-medium text-[#202B26] mb-1">Pilih Material Target</label>
          <input
            id="adj-mat-input"
            type="text"
            value={adjForm.materialId}
            onChange={(e) => setAdjForm({ ...adjForm, materialId: e.target.value })}
            placeholder="Ketik kode atau nama material"
            list="adjustment-material-options"
            className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
          />
          <datalist id="adjustment-material-options">
            {materials.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
          </datalist>
        </div>

        <div className="p-3 bg-[#FAFBFB] rounded-lg border border-[#E2E8E4] space-y-1.5">
          <div className="flex justify-between">
            <span className="text-[#69766F]">Stok Menurut Sistem:</span>
            <span className="font-mono font-bold text-[#202B26]">
              {currentMat?.currentStock.toLocaleString('id-ID')} {currentMat?.unit}
            </span>
          </div>
          {adjForm.physicalStock !== '' && (
            <div className="flex justify-between">
              <span className="text-[#69766F]">Estimasi Selisih (Deviasi):</span>
              <span
                className={`font-mono font-bold ${
                  variance < 0 ? 'text-[#A82A20]' : variance > 0 ? 'text-[#1C6843]' : 'text-[#69766F]'
                }`}
              >
                {variance > 0 ? '+' : ''}
                {variance.toLocaleString('id-ID')} {currentMat?.unit}
              </span>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="adj-phys-stock" className="block font-medium text-[#202B26] mb-1">
            Hasil Hitungan Fisik Riil di Site <span className="text-[#A82A20]">*</span>
          </label>
          <input
            id="adj-phys-stock"
            type="number"
            required
            value={adjForm.physicalStock}
            onChange={(e) => setAdjForm({ ...adjForm, physicalStock: e.target.value })}
            placeholder="Contoh: 4180"
            className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg font-mono text-[#202B26]"
          />
        </div>

        <div>
          <label htmlFor="adj-reason-select" className="block font-medium text-[#202B26] mb-1">
            Alasan Utama Ketidaksesuaian <span className="text-[#A82A20]">*</span>
          </label>
          <select
            id="adj-reason-select"
            value={adjForm.reason}
            onChange={(e) =>
              setAdjForm({ ...adjForm, reason: e.target.value as StockAdjustment['reason'] })
            }
            className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
          >
            <option value="Kerusakan Fisik di Site">Kerusakan Fisik di Site (Karat/Patah/Basah)</option>
            <option value="Susut / Faktor Cuaca">Susut / Faktor Cuaca (Penguapan/Curah Hujan)</option>
            <option value="Selisih Bongkar Muat">Selisih Bongkar Muat dari Supplier</option>
            <option value="Retur Pekerjaan Subkon">Retur Pekerjaan Subkon Lapangan</option>
            <option value="Koreksi Opname Fisik">Koreksi Opname Fisik Akhir Bulan</option>
          </select>
        </div>

        <div>
          <label htmlFor="adj-evidence-ref" className="block font-medium text-[#202B26] mb-1">
            Nomor Berita Acara (BA) Pembuktian <span className="text-[#A82A20]">*</span>
          </label>
          <input
            id="adj-evidence-ref"
            type="text"
            required
            value={adjForm.evidenceRef}
            onChange={(e) => setAdjForm({ ...adjForm, evidenceRef: e.target.value })}
            placeholder="BA-OPNAME-SITE-01.pdf"
            className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg font-mono text-[#202B26]"
          />
        </div>
      </form>
    </Modal>
  );
};
