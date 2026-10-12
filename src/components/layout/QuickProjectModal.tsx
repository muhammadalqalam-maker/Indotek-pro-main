import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { ProjectCategory, ScheduleHealth } from '../../types';

export const QuickProjectModal: React.FC = () => {
  const { isAddProjectModalOpen, setIsAddProjectModalOpen, addProject } = useApp();

  const [formData, setFormData] = useState({
    code: 'PRJ-2026-JKT-008',
    name: '',
    client: '',
    category: 'Komersial' as ProjectCategory,
    location: '',
    projectManager: 'Ir. Hendra Kurniawan, IPM',
    siteEngineer: 'Budi Santoso, S.T.',
    contractValue: '45000000000',
    approvedBudget: '38250000000',
    startDate: '2026-10-15',
    targetEndDate: '2027-11-30',
    description: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'Nama proyek wajib diisi';
    if (!formData.code.trim()) newErrors.code = 'Kode proyek wajib diisi';
    if (!formData.client.trim()) newErrors.client = 'Nama klien/owner wajib diisi';
    if (!formData.location.trim()) newErrors.location = 'Lokasi site wajib diisi';
    if (!formData.contractValue || isNaN(Number(formData.contractValue))) {
      newErrors.contractValue = 'Nilai kontrak harus angka valid';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    addProject({
      code: formData.code.trim(),
      name: formData.name.trim(),
      client: formData.client.trim(),
      category: formData.category,
      location: formData.location.trim(),
      projectManager: formData.projectManager,
      siteEngineer: formData.siteEngineer,
      contractValue: Number(formData.contractValue),
      approvedBudget: Number(formData.approvedBudget) || Number(formData.contractValue) * 0.85,
      actualCost: 0,
      startDate: formData.startDate,
      targetEndDate: formData.targetEndDate,
      progressActual: 0,
      progressPlanned: 2.5,
      status: 'Pra-Konstruksi',
      scheduleStatus: 'Tepat Waktu' as ScheduleHealth,
      description: formData.description.trim() || 'Proyek konstruksi baru terdaftar di sistem.',
    });

    setIsAddProjectModalOpen(false);
    // Reset form
    setFormData({
      code: 'PRJ-2026-JKT-009',
      name: '',
      client: '',
      category: 'Komersial',
      location: '',
      projectManager: 'Ir. Hendra Kurniawan, IPM',
      siteEngineer: 'Budi Santoso, S.T.',
      contractValue: '45000000000',
      approvedBudget: '38250000000',
      startDate: '2026-10-15',
      targetEndDate: '2027-11-30',
      description: '',
    });
    setErrors({});
  };

  return (
    <Modal
      isOpen={isAddProjectModalOpen}
      onClose={() => setIsAddProjectModalOpen(false)}
      title="Tambah Proyek Konstruksi Baru"
      description="Daftarkan proyek baru ke sistem portofolio Indotek Pro untuk memulai pelacakan WBS, RAB, dan logistik."
      maxWidth="xl"
      footer={
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsAddProjectModalOpen(false)}
          >
            Batal
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit}>
            Simpan & Buka Portofolio
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block font-medium text-[#202B26] mb-1">
              Kode Proyek <span className="text-[#A82A20]">*</span>
            </label>
            <input
              type="text"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              className={`w-full p-2 bg-white border rounded-lg font-mono text-[#202B26] ${
                errors.code ? 'border-[#A82A20]' : 'border-[#E2E8E4]'
              }`}
              placeholder="PRJ-2026-JKT-008"
            />
            {errors.code && <p className="text-[10px] text-[#A82A20] mt-1">{errors.code}</p>}
          </div>

          <div className="sm:col-span-2">
            <label className="block font-medium text-[#202B26] mb-1">
              Nama Proyek <span className="text-[#A82A20]">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={`w-full p-2 bg-white border rounded-lg text-[#202B26] ${
                errors.name ? 'border-[#A82A20]' : 'border-[#E2E8E4]'
              }`}
              placeholder="Contoh: Gedung Laboratorium Terpadu ITB"
            />
            {errors.name && <p className="text-[10px] text-[#A82A20] mt-1">{errors.name}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-medium text-[#202B26] mb-1">
              Pemilik / Klien (Owner) <span className="text-[#A82A20]">*</span>
            </label>
            <input
              type="text"
              value={formData.client}
              onChange={(e) => setFormData({ ...formData, client: e.target.value })}
              className={`w-full p-2 bg-white border rounded-lg text-[#202B26] ${
                errors.client ? 'border-[#A82A20]' : 'border-[#E2E8E4]'
              }`}
              placeholder="Contoh: PT Metropolitan Land Tbk"
            />
            {errors.client && <p className="text-[10px] text-[#A82A20] mt-1">{errors.client}</p>}
          </div>

          <div>
            <label className="block font-medium text-[#202B26] mb-1">Kategori Konstruksi</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value as ProjectCategory })}
              className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
            >
              <option value="Komersial">Komersial (Gedung & Hotel)</option>
              <option value="Infrastruktur">Infrastruktur (Jalan & Jembatan)</option>
              <option value="Residensial">Residensial (Perumahan)</option>
              <option value="Industri">Industri (Pabrik & Gudang)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-medium text-[#202B26] mb-1">
              Lokasi Pekerjaan <span className="text-[#A82A20]">*</span>
            </label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className={`w-full p-2 bg-white border rounded-lg text-[#202B26] ${
                errors.location ? 'border-[#A82A20]' : 'border-[#E2E8E4]'
              }`}
              placeholder="Contoh: Jl. Ganesha No. 10, Bandung"
            />
            {errors.location && <p className="text-[10px] text-[#A82A20] mt-1">{errors.location}</p>}
          </div>

          <div>
            <label className="block font-medium text-[#202B26] mb-1">Project Manager (PM)</label>
            <select
              value={formData.projectManager}
              onChange={(e) => setFormData({ ...formData, projectManager: e.target.value })}
              className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
            >
              <option value="Ir. Hendra Kurniawan, IPM">Ir. Hendra Kurniawan, IPM</option>
              <option value="Drs. Ir. Agus Pramono, MT">Drs. Ir. Agus Pramono, MT</option>
              <option value="Wahyu Hidayat, S.T.">Wahyu Hidayat, S.T.</option>
              <option value="Eko Prasetyo, S.T.">Eko Prasetyo, S.T.</option>
              <option value="Bambang Triatmojo, S.T., MT">Bambang Triatmojo, S.T., MT</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-medium text-[#202B26] mb-1">
              Nilai Kontrak (IDR) <span className="text-[#A82A20]">*</span>
            </label>
            <input
              type="number"
              value={formData.contractValue}
              onChange={(e) => {
                const val = e.target.value;
                setFormData({
                  ...formData,
                  contractValue: val,
                  approvedBudget: (Number(val) * 0.85).toString(),
                });
              }}
              className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg font-mono text-[#202B26]"
              placeholder="Contoh: 45000000000"
            />
          </div>

          <div>
            <label className="block font-medium text-[#202B26] mb-1">
              Pagu Anggaran RAB (85% Target Margin)
            </label>
            <input
              type="number"
              value={formData.approvedBudget}
              onChange={(e) => setFormData({ ...formData, approvedBudget: e.target.value })}
              className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg font-mono text-[#202B26]"
              placeholder="Contoh: 38250000000"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-medium text-[#202B26] mb-1">Tanggal Mulai SPMK</label>
            <input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
            />
          </div>

          <div>
            <label className="block font-medium text-[#202B26] mb-1">Target Selesai (Serah Terima 1)</label>
            <input
              type="date"
              value={formData.targetEndDate}
              onChange={(e) => setFormData({ ...formData, targetEndDate: e.target.value })}
              className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
            />
          </div>
        </div>

        <div>
          <label className="block font-medium text-[#202B26] mb-1">Deskripsi & Ruang Lingkup Singkat</label>
          <textarea
            rows={2}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Ruang lingkup pekerjaan struktur, finishing, dan instalasi mekanikal elektrikal..."
            className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26] text-xs resize-none"
          />
        </div>
      </form>
    </Modal>
  );
};
