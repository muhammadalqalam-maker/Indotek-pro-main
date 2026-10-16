import React from 'react';
import { Modal } from '../../common/Modal';
import { Button } from '../../common/Button';
import { MaterialItem } from '../../../types';

interface StockMutationModalProps {
  isOpen: boolean;
  onClose: () => void;
  materials: MaterialItem[];
  mutationForm: {
    materialId: string;
    type: 'Masuk' | 'Keluar';
    quantity: string;
    referenceNo: string;
    project: string;
    handler: string;
  };
  setMutationForm: React.Dispatch<
    React.SetStateAction<{
      materialId: string;
      type: 'Masuk' | 'Keluar';
      quantity: string;
      referenceNo: string;
      project: string;
      handler: string;
    }>
  >;
  onSubmit: (e: React.FormEvent) => void;
}

export const StockMutationModal: React.FC<StockMutationModalProps> = ({
  isOpen,
  onClose,
  materials,
  mutationForm,
  setMutationForm,
  onSubmit,
}) => {
  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Catat Mutasi Material (Surat Jalan)"
      description="Perbarui stok fisik gudang melalui pencatatan barang datang dari supplier atau pengeluaran ke mandor lapangan."
      maxWidth="md"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Batal
          </Button>
          <Button variant="primary" size="sm" onClick={onSubmit}>
            Simpan Mutasi Stok
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4 text-xs">
        <div>
          <label htmlFor="mutation-mat-select" className="block font-medium text-[#202B26] mb-1">Pilih Material</label>
          <select
            id="mutation-mat-select"
            value={mutationForm.materialId}
            onChange={(e) => setMutationForm({ ...mutationForm, materialId: e.target.value })}
            className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
          >
            <option value="" disabled>Pilih material</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} — {m.name} (Stok: {m.currentStock} {m.unit})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="mutation-type-select" className="block font-medium text-[#202B26] mb-1">Jenis Mutasi</label>
            <select
              id="mutation-type-select"
              value={mutationForm.type}
              onChange={(e) =>
                setMutationForm({ ...mutationForm, type: e.target.value as 'Masuk' | 'Keluar' })
              }
              className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
            >
              <option value="Keluar">Barang Keluar (Dipakai Kerja)</option>
              <option value="Masuk">Barang Masuk (Penerimaan PO)</option>
            </select>
          </div>

          <div>
            <label htmlFor="mutation-qty-input" className="block font-medium text-[#202B26] mb-1">Jumlah Kuantitas</label>
            <input
              id="mutation-qty-input"
              type="number"
              value={mutationForm.quantity}
              onChange={(e) => setMutationForm({ ...mutationForm, quantity: e.target.value })}
              className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg font-mono text-[#202B26]"
            />
          </div>
        </div>

        <div>
          <label htmlFor="mutation-ref-input" className="block font-medium text-[#202B26] mb-1">No. Surat Jalan / Referensi</label>
          <input
            id="mutation-ref-input"
            type="text"
            value={mutationForm.referenceNo}
            onChange={(e) => setMutationForm({ ...mutationForm, referenceNo: e.target.value })}
            className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg font-mono text-[#202B26]"
          />
        </div>

        <div>
          <label htmlFor="mutation-proj-input" className="block font-medium text-[#202B26] mb-1">Proyek / Zona Alokasi</label>
          <input
            id="mutation-proj-input"
            type="text"
            value={mutationForm.project}
            onChange={(e) => setMutationForm({ ...mutationForm, project: e.target.value })}
            className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
          />
        </div>

        <div>
          <label htmlFor="mutation-handler-input" className="block font-medium text-[#202B26] mb-1">Petugas / Mandor Penerima</label>
          <input
            id="mutation-handler-input"
            type="text"
            value={mutationForm.handler}
            onChange={(e) => setMutationForm({ ...mutationForm, handler: e.target.value })}
            className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
          />
        </div>
      </form>
    </Modal>
  );
};
