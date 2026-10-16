import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { ProjectCategory, ScheduleHealth } from '../../types';

export const QuickProjectModal: React.FC = () => {
  const { isAddProjectModalOpen, setIsAddProjectModalOpen, addProject } = useApp();

  const [formData, setFormData] = useState({
    code: '',
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
  const [submissionError, setSubmissionError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'Nama proyek wajib diisi';
    if (!formData.client.trim()) newErrors.client = 'Nama klien/owner wajib diisi';
    if (!formData.location.trim()) newErrors.location = 'Lokasi site wajib diisi';
    if (!formData.contractValue || !Number.isFinite(Number(formData.contractValue))) {
      newErrors.contractValue = 'Nilai kontrak harus angka valid';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!validate()) return;

    setIsSubmitting(true);
    setSubmissionError('');
    try {
      await addProject({
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
      setFormData({
        code: '',
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
    } catch (error) {
      setSubmissionError(
        error instanceof Error ? error.message : 'Terjadi kesalahan saat menyimpan proyek.'
      );
    } finally {
      setIsSubmitting(false);
    }
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
          <Button
            variant="primary"
            size="sm"
            type="submit"
            form="quick-project-form"
            isLoading={isSubmitting}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Menyimpan Proyek...' : 'Simpan & Buka Portofolio'}
          </Button>
        </>
      }
    >
      <form id="quick-project-form" onSubmit={handleSubmit} className="space-y-4 text-xs">
        {submissionError && (
          <p role="alert" className="rounded-lg border border-danger/20 bg-danger/5 p-3 text-danger">
            {submissionError}
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="project-code" className="block font-medium text-text-primary mb-1">
              Kode Proyek (opsional)
            </label>
            <input
              id="project-code"
              type="text"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              className="w-full p-2 bg-white border border-border-subtle rounded-lg font-mono text-text-primary"
              placeholder="Kosongkan untuk kode otomatis"
            />
            {errors.code && <p className="text-xs text-danger mt-1">{errors.code}</p>}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="project-name" className="block font-medium text-text-primary mb-1">
              Nama Proyek <span className="text-danger">*</span>
            </label>
            <input
              id="project-name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={`w-full p-2 bg-white border rounded-lg text-text-primary ${
                errors.name ? 'border-danger' : 'border-border-subtle'
              }`}
              placeholder="Contoh: Gedung Laboratorium Terpadu ITB"
            />
            {errors.name && <p className="text-xs text-danger mt-1">{errors.name}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="project-client" className="block font-medium text-text-primary mb-1">
              Pemilik / Klien (Owner) <span className="text-danger">*</span>
            </label>
            <input
              id="project-client"
              type="text"
              value={formData.client}
              onChange={(e) => setFormData({ ...formData, client: e.target.value })}
              className={`w-full p-2 bg-white border rounded-lg text-text-primary ${
                errors.client ? 'border-danger' : 'border-border-subtle'
              }`}
              placeholder="Contoh: PT Metropolitan Land Tbk"
            />
            {errors.client && <p className="text-xs text-danger mt-1">{errors.client}</p>}
          </div>

          <div>
            <label htmlFor="project-category" className="block font-medium text-text-primary mb-1">Kategori Konstruksi</label>
            <select
              id="project-category"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value as ProjectCategory })}
              className="w-full p-2 bg-white border border-border-subtle rounded-lg text-text-primary"
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
            <label htmlFor="project-location" className="block font-medium text-text-primary mb-1">
              Lokasi Pekerjaan <span className="text-danger">*</span>
            </label>
            <input
              id="project-location"
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className={`w-full p-2 bg-white border rounded-lg text-text-primary ${
                errors.location ? 'border-danger' : 'border-border-subtle'
              }`}
              placeholder="Contoh: Jl. Ganesha No. 10, Bandung"
            />
            {errors.location && <p className="text-xs text-danger mt-1">{errors.location}</p>}
          </div>

          <div>
            <label htmlFor="project-manager" className="block font-medium text-text-primary mb-1">Project Manager (PM)</label>
            <select
              id="project-manager"
              value={formData.projectManager}
              onChange={(e) => setFormData({ ...formData, projectManager: e.target.value })}
              className="w-full p-2 bg-white border border-border-subtle rounded-lg text-text-primary"
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
            <label htmlFor="project-contract-value" className="block font-medium text-[#202B26] mb-1">
              Nilai Kontrak (IDR) <span className="text-[#A82A20]">*</span>
            </label>
            <input
              id="project-contract-value"
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
            <label htmlFor="project-approved-budget" className="block font-medium text-[#202B26] mb-1">
              Pagu Anggaran RAB (85% Target Margin)
            </label>
            <input
              id="project-approved-budget"
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
            <label htmlFor="project-start-date" className="block font-medium text-[#202B26] mb-1">Tanggal Mulai SPMK</label>
            <input
              id="project-start-date"
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
            />
          </div>

          <div>
            <label htmlFor="project-target-end-date" className="block font-medium text-[#202B26] mb-1">Target Selesai (Serah Terima 1)</label>
            <input
              id="project-target-end-date"
              type="date"
              value={formData.targetEndDate}
              onChange={(e) => setFormData({ ...formData, targetEndDate: e.target.value })}
              className="w-full p-2 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
            />
          </div>
        </div>

        <div>
          <label htmlFor="project-description" className="block font-medium text-[#202B26] mb-1">Deskripsi & Ruang Lingkup Singkat</label>
          <textarea
            id="project-description"
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
