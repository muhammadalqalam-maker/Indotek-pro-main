import React, { useState } from 'react';
import {
  Coins,
  FileText,
  History,
  Wallet,
  Download,
  AlertTriangle,
  RotateCcw,
  ShieldAlert,
  FileSpreadsheet,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';
import { EmptyState } from '../common/EmptyState';
import { LoadingSkeleton } from '../common/LoadingSkeleton';
import { BudgetLine, BudgetRevision, PettyCashEntry, PettyCashCategory } from '../../types';
import { calculateProjectFinancials } from '../../utils/projectCalculations';
import { exportRABToCSV } from '../../utils/exportUtils';
import { BudgetSummaryCards } from './budget/BudgetSummaryCards';
import { BudgetLinesTab } from './budget/BudgetLinesTab';
import { BudgetRevisionsTab } from './budget/BudgetRevisionsTab';
import { BudgetVersionsTab } from './budget/BudgetVersionsTab';
import { PettyCashTab } from './budget/PettyCashTab';
import { BOQItemizedTab } from './budget/BOQItemizedTab';
import { PaymentTermsTab } from './budget/PaymentTermsTab';

export const BudgetScreen: React.FC = () => {
  const {
    projects,
    selectedProjectId,
    setSelectedProjectId,
    budgetLines,
    budgetVersions,
    addBudgetLine,
    updateBudgetLine,
    budgetRevisions,
    submitBudgetRevision,
    approveBudgetRevision,
    rejectBudgetRevision,
    pettyCash,
    submitPettyCash,
    approvePettyCash,
    rejectPettyCash,
    disbursePettyCash,
    addToast,
    isLoadingData,
    loadingBudget,
    loadError,
    refreshData,
    setIsAddProjectModalOpen,
  } = useApp();

  const { activeRole, canAccessProject, userProfile } = useAuth();

  const [activeTab, setActiveTab] = useState<'boq' | 'rab' | 'revisions' | 'versions' | 'petty_cash' | 'payment_terms'>('boq');
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');

  // Edit / Add Budget Line Modal State
  const [isEditLineModalOpen, setIsEditLineModalOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<BudgetLine | null>(null);
  const [lineForm, setLineForm] = useState({
    code: '',
    divisionName: '',
    category: 'Pekerjaan Struktur' as BudgetLine['category'],
    volume: '1',
    unit: 'ls',
    unitRate: '',
    actualAmount: '',
  });

  // Modals for Budget Revisions
  const [isNewRevModalOpen, setIsNewRevModalOpen] = useState(false);
  const [revForm, setRevForm] = useState({
    title: '',
    divisionName: 'Pekerjaan Struktur',
    proposedAmount: '',
    originalAmount: '',
    justification: '',
  });
  const [rejectingRev, setRejectingRev] = useState<BudgetRevision | null>(null);
  const [revRejectReason, setRevRejectReason] = useState('');

  // Modals for Petty Cash
  const [isNewPettyModalOpen, setIsNewPettyModalOpen] = useState(false);
  const [pettyForm, setPettyForm] = useState({
    amount: '',
    category: 'Konsumsi & Lembur' as PettyCashCategory,
    purpose: '',
    receiptProof: 'NOTA-SITE-OFFICIAL.pdf',
  });
  const [rejectingPetty, setRejectingPetty] = useState<PettyCashEntry | null>(null);
  const [pettyRejectReason, setPettyRejectReason] = useState('');

  // Version Comparison State
  const [compareVersionAId, setCompareVersionAId] = useState<string>('');
  const [compareVersionBId, setCompareVersionBId] = useState<string>('');

  const currentProject = projects.find((p) => p.id === selectedProjectId) || projects[0];

  React.useEffect(() => {
    if (budgetVersions.length > 0) {
      if (!compareVersionAId) setCompareVersionAId(budgetVersions[0].id);
      if (!compareVersionBId && budgetVersions.length > 1) {
        setCompareVersionBId(budgetVersions[budgetVersions.length - 1].id);
      } else if (!compareVersionBId) {
        setCompareVersionBId(budgetVersions[0].id);
      }
    }
  }, [budgetVersions, compareVersionAId, compareVersionBId]);

  if (loadingBudget) {
    return (
      <div className="p-6">
        <LoadingSkeleton count={4} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="bg-[#FDEDEC] border border-[#F5C2BF] rounded-xl p-6 text-center max-w-lg mx-auto my-12">
        <AlertTriangle className="w-8 h-8 text-[#A82A20] mx-auto mb-2" />
        <h3 className="font-bold text-sm text-[#A82A20]">Gagal Menyinkronkan Data Anggaran</h3>
        <p className="text-xs text-[#69766F] mt-1 mb-4">{loadError}</p>
        <Button variant="primary" size="sm" onClick={refreshData} leftIcon={<RotateCcw className="w-4 h-4" />}>
          Coba Lagi
        </Button>
      </div>
    );
  }

  if (!currentProject) {
    return (
      <EmptyState
        title="Belum Ada Proyek Aktif"
        description="Tidak ditemukan proyek konstruksi di workspace ini. Buat proyek baru untuk memulai pengelolaan anggaran RAB."
        actionLabel="Tambah Proyek Baru"
        onAction={() => setIsAddProjectModalOpen(true)}
      />
    );
  }

  const hasAccessToProject = canAccessProject(currentProject.id);
  const canEditRAB = activeRole === 'Owner / Director' || activeRole === 'Quantity Surveyor / Estimator';

  const projectRevisions = budgetRevisions.filter((r) => r.projectId === currentProject.id);
  const projectPettyCash = pettyCash.filter((p) => p.projectId === currentProject.id);

  const filteredLines = budgetLines.filter((item) => {
    const matchSearch =
      item.divisionName.toLowerCase().includes(search.toLowerCase()) ||
      item.code.toLowerCase().includes(search.toLowerCase()) ||
      item.category.toLowerCase().includes(search.toLowerCase());

    const matchCategory = selectedCategory === 'Semua' || item.category === selectedCategory;
    return matchSearch && matchCategory;
  });

  const financials = calculateProjectFinancials(budgetLines);
  const totalPlanned = financials.approvedBudget;
  const totalActual = financials.actualCost;
  const totalVariance = financials.varianceAmount;
  const cpi = financials.costPerformanceIndex;
  const utilization = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;

  const categoriesList: BudgetLine['category'][] = [
    'Pekerjaan Persiapan',
    'Pekerjaan Struktur',
    'Pekerjaan Arsitektur',
    'Pekerjaan MEP',
    'Manajemen & Overhead',
  ];
  const divisionDistribution = categoriesList.map((cat) => {
    const lines = budgetLines.filter((l) => l.category === cat);
    const planned = lines.reduce((acc, l) => acc + (Number(l.plannedAmount) || 0), 0);
    const actual = lines.reduce((acc, l) => acc + (Number(l.actualAmount) || 0), 0);
    return { title: cat, planned, actual };
  }).filter((d) => d.planned > 0 || d.actual > 0);

  const handleExportRAB = () => {
    try {
      exportRABToCSV(currentProject, budgetLines);
      addToast({
        type: 'success',
        title: 'Ekspor RAB Berhasil',
        message: `Berkas RAB ${currentProject.code} berhasil diunduh.`,
      });
    } catch {
      addToast({
        type: 'danger',
        title: 'Ekspor RAB Gagal',
        message: 'Terjadi kendala saat memproses berkas spreadsheet RAB.',
      });
    }
  };

  const handleOpenEditLine = (line: BudgetLine) => {
    setEditingLine(line);
    setLineForm({
      code: line.code,
      divisionName: line.divisionName,
      category: line.category,
      volume: String(line.volume || 1),
      unit: line.unit || 'ls',
      unitRate: String(line.unitRate || line.plannedAmount),
      actualAmount: String(line.actualAmount || 0),
    });
    setIsEditLineModalOpen(true);
  };

  const handleOpenAddLine = () => {
    setEditingLine(null);
    setLineForm({
      code: `DIV-${String(budgetLines.length + 1).padStart(2, '0')}`,
      divisionName: '',
      category: 'Pekerjaan Struktur',
      volume: '1',
      unit: 'ls',
      unitRate: '100000000',
      actualAmount: '0',
    });
    setIsEditLineModalOpen(true);
  };

  const handleSaveLineForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const vol = Number(lineForm.volume) || 1;
    const rate = Number(lineForm.unitRate) || 0;
    const act = Number(lineForm.actualAmount) || 0;
    const plan = vol * rate;

    try {
      if (editingLine) {
        await updateBudgetLine(editingLine.id, {
          divisionName: lineForm.divisionName,
          category: lineForm.category,
          volume: vol,
          unit: lineForm.unit,
          unitRate: rate,
          plannedAmount: plan,
          actualAmount: act,
        });
      } else {
        await addBudgetLine({
          projectId: currentProject.id,
          code: lineForm.code,
          divisionName: lineForm.divisionName,
          category: lineForm.category,
          volume: vol,
          unit: lineForm.unit,
          unitRate: rate,
          plannedAmount: plan,
          actualAmount: act,
          varianceAmount: plan - act,
          variancePercent: plan > 0 ? Number((((plan - act) / plan) * 100).toFixed(2)) : 0,
          status: act > plan ? 'Overbudget' : act > plan * 0.85 ? 'Peringatan' : 'Aman',
        });
      }
      setIsEditLineModalOpen(false);
    } catch {
      // Error handled by context toast
    }
  };

  const handleSaveNewRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    const prop = Number(revForm.proposedAmount) || 0;
    const orig = Number(revForm.originalAmount) || 0;

    try {
      await submitBudgetRevision({
        projectId: currentProject.id,
        projectName: currentProject.name,
        title: revForm.title,
        divisionName: revForm.divisionName,
        originalAmount: orig,
        proposedAmount: prop,
        varianceAmount: prop - orig,
        justification: revForm.justification,
        submittedBy: userProfile?.name || 'Project Manager',
      });
      setIsNewRevModalOpen(false);
      setRevForm({
        title: '',
        divisionName: 'Pekerjaan Struktur',
        proposedAmount: '',
        originalAmount: '',
        justification: '',
      });
    } catch {
      // Handled in context
    }
  };

  const handleConfirmRejectRev = async () => {
    if (!rejectingRev || !revRejectReason) return;
    try {
      await rejectBudgetRevision(rejectingRev.id, userProfile?.name || 'Direksi', revRejectReason);
      setRejectingRev(null);
    } catch {
      // Handled in context
    }
  };

  const handleSaveNewPetty = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(pettyForm.amount) || 0;

    try {
      await submitPettyCash({
        projectId: currentProject.id,
        projectName: currentProject.name,
        amount: amt,
        category: pettyForm.category,
        purpose: pettyForm.purpose,
        requester: userProfile?.name || 'Supervisor Site',
        receiptProof: pettyForm.receiptProof,
      });
      setIsNewPettyModalOpen(false);
      setPettyForm({
        amount: '',
        category: 'Konsumsi & Lembur',
        purpose: '',
        receiptProof: 'NOTA-SITE-OFFICIAL.pdf',
      });
    } catch {
      // Handled in context
    }
  };

  const handleConfirmRejectPetty = async () => {
    if (!rejectingPetty || !pettyRejectReason) return;
    try {
      await rejectPettyCash(rejectingPetty.id, userProfile?.name || 'Keuangan', pettyRejectReason);
      setRejectingPetty(null);
    } catch {
      // Handled in context
    }
  };

  const canApproveRevisions =
    (activeRole === 'Owner / Director' || activeRole === 'Finance / Accounting') && hasAccessToProject;
  const canReviewPetty = activeRole === 'Finance / Accounting' || activeRole === 'Owner / Director';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#E2E8E4]">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#69766F] mb-1">
            <span>Tata Kelola Keuangan</span>
            <span aria-hidden="true">·</span>
            <span>RAB, Riwayat Versi Addendum & Kas Kecil</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#202B26]">
            Pengendalian Anggaran & Kas Proyek
          </h1>
          <p className="text-xs text-[#69766F] mt-0.5">
            Monitoring serapan dana BOQ subkoleksi Firestore, komparasi addendum riwayat versi, dan auditabilitas mutasi
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <label htmlFor="budget-project-selector" className="sr-only">Pilih Proyek</label>
          <select
            id="budget-project-selector"
            value={currentProject.id}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="h-9 bg-white border border-[#E2E8E4] rounded-lg px-3 text-xs font-semibold text-[#202B26] hover:border-[#CBD5CF] focus:outline-none focus:border-[#12352B] focus:ring-1 focus:ring-[#12352B] transition-colors cursor-pointer"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportRAB}
            leftIcon={<Download className="w-4 h-4" />}
          >
            Ekspor Excel
          </Button>
        </div>
      </div>

      {/* Project Restriction Warning */}
      {!hasAccessToProject && (
        <div className="bg-[#FEF6E7] border border-[#FAD899] rounded-xl p-4 flex items-start gap-3 text-xs text-[#9E6B05]">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Akses Proyek Dibatasi untuk Peran Anda:</span>
            <p className="mt-0.5 text-[#202B26]/80 leading-relaxed">
              Anda sedang melihat data proyek di luar daftar penugasan aktif peran Anda (<span className="font-mono font-semibold">{activeRole}</span>). Tindakan perubahan anggaran dinonaktifkan.
            </p>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[#E2E8E4] pb-px overflow-x-auto" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === 'boq'}
          onClick={() => setActiveTab('boq')}
          className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'boq'
              ? 'border-[#12352B] text-[#12352B] bg-white font-bold'
              : 'border-transparent text-[#69766F] hover:text-[#202B26]'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
          <span>BOQ & RAB Rinci (Itemized)</span>
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'rab'}
          onClick={() => setActiveTab('rab')}
          className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'rab'
              ? 'border-[#12352B] text-[#12352B] bg-white font-bold'
              : 'border-transparent text-[#69766F] hover:text-[#202B26]'
          }`}
        >
          <Coins className="w-3.5 h-3.5" />
          <span>Rekap Divisi Pagu</span>
          <span className="text-xs font-mono px-1.5 py-0.2 rounded-full bg-[#EAEFEA] text-[#12352B]">
            {budgetLines.length}
          </span>
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'revisions'}
          onClick={() => setActiveTab('revisions')}
          className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'revisions'
              ? 'border-[#12352B] text-[#12352B] bg-white font-bold'
              : 'border-transparent text-[#69766F] hover:text-[#202B26]'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Addendum Revisi Anggaran</span>
          {projectRevisions.filter((r) => r.status === 'Menunggu').length > 0 && (
            <span className="px-1.5 py-0.2 bg-[#A82A20] text-white rounded-full text-xs font-mono">
              {projectRevisions.filter((r) => r.status === 'Menunggu').length}
            </span>
          )}
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'versions'}
          onClick={() => setActiveTab('versions')}
          className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'versions'
              ? 'border-[#12352B] text-[#12352B] bg-white font-bold'
              : 'border-transparent text-[#69766F] hover:text-[#202B26]'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Riwayat Versi Addendum</span>
          <span className="text-xs font-mono px-1.5 py-0.2 rounded-full bg-[#EAEFEA] text-[#12352B]">
            {budgetVersions.length}
          </span>
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'petty_cash'}
          onClick={() => setActiveTab('petty_cash')}
          className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'petty_cash'
              ? 'border-[#12352B] text-[#12352B] bg-white font-bold'
              : 'border-transparent text-[#69766F] hover:text-[#202B26]'
          }`}
        >
          <Wallet className="w-3.5 h-3.5" />
          <span>Kas Kecil Site (Petty Cash)</span>
          {projectPettyCash.filter((p) => p.status === 'Menunggu').length > 0 && (
            <span className="px-1.5 py-0.2 bg-[#9E6B05] text-white rounded-full text-xs font-mono">
              {projectPettyCash.filter((p) => p.status === 'Menunggu').length}
            </span>
          )}
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'payment_terms'}
          onClick={() => setActiveTab('payment_terms')}
          className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors cursor-pointer border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'payment_terms'
              ? 'border-[#12352B] text-[#12352B] bg-white font-bold'
              : 'border-transparent text-[#69766F] hover:text-[#202B26]'
          }`}
        >
          <span>💳</span>
          <span>Jadwal Termin</span>
        </button>
      </div>

      {/* KPI Cards */}
      <BudgetSummaryCards
        contractValue={currentProject.contractValue}
        totalPlanned={totalPlanned}
        totalActual={totalActual}
        totalVariance={totalVariance}
        cpi={cpi}
        utilization={utilization}
      />

      {/* Tab 0: BOQ Itemized */}
      {activeTab === 'boq' && (
        <BOQItemizedTab
          projectId={currentProject.id}
          projectName={currentProject.name}
          onRefreshProject={refreshData}
        />
      )}

      {/* Tab F: Jadwal Termin Pembayaran */}
      {activeTab === 'payment_terms' && (
        <PaymentTermsTab
          projectId={currentProject.id}
          projectName={currentProject.name}
        />
      )}

      {/* Tab 1: RAB Lines */}
      {activeTab === 'rab' && (
        <BudgetLinesTab
          currentProject={currentProject}
          filteredLines={filteredLines}
          divisionDistribution={divisionDistribution}
          search={search}
          setSearch={setSearch}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          canEditRAB={canEditRAB}
          hasAccessToProject={hasAccessToProject}
          onOpenAddLine={handleOpenAddLine}
          onOpenEditLine={handleOpenEditLine}
        />
      )}

      {/* Tab 2: Revisions */}
      {activeTab === 'revisions' && (
        <BudgetRevisionsTab
          projectRevisions={projectRevisions}
          hasAccessToProject={hasAccessToProject}
          canApprove={canApproveRevisions}
          approverName={userProfile?.name || 'Direktur'}
          onOpenNewRevision={() => {
            if (!hasAccessToProject) {
              addToast({ type: 'danger', message: 'Anda tidak memiliki penugasan pada proyek ini.' });
              return;
            }
            setIsNewRevModalOpen(true);
          }}
          onApproveRevision={(id) => approveBudgetRevision(id, userProfile?.name || 'Direktur')}
          onRequestRejectRevision={(rev) => {
            setRejectingRev(rev);
            setRevRejectReason('');
          }}
        />
      )}

      {/* Tab 3: Versions */}
      {activeTab === 'versions' && (
        <BudgetVersionsTab
          currentProject={currentProject}
          budgetVersions={budgetVersions}
          compareVersionAId={compareVersionAId}
          setCompareVersionAId={setCompareVersionAId}
          compareVersionBId={compareVersionBId}
          setCompareVersionBId={setCompareVersionBId}
        />
      )}

      {/* Tab 4: Petty Cash */}
      {activeTab === 'petty_cash' && (
        <PettyCashTab
          projectPettyCash={projectPettyCash}
          hasAccessToProject={hasAccessToProject}
          canReview={canReviewPetty}
          approverName={userProfile?.name || 'Keuangan'}
          disburserName={userProfile?.name || 'Kasir'}
          onOpenNewPetty={() => {
            if (!hasAccessToProject) {
              addToast({ type: 'danger', message: 'Anda tidak memiliki akses pada proyek ini.' });
              return;
            }
            setIsNewPettyModalOpen(true);
          }}
          onApprovePettyCash={(id) => approvePettyCash(id, userProfile?.name || 'Keuangan')}
          onRequestRejectPetty={(item) => {
            setRejectingPetty(item);
            setPettyRejectReason('');
          }}
          onDisbursePettyCash={(id) => disbursePettyCash(id, userProfile?.name || 'Kasir')}
        />
      )}

      {/* MODAL 1: ADD / EDIT BUDGET LINE */}
      <Modal
        isOpen={isEditLineModalOpen}
        onClose={() => setIsEditLineModalOpen(false)}
        title={editingLine ? `Ubah Pos RAB: ${editingLine.code}` : 'Tambah Pos RAB / BOQ Baru'}
        size="md"
      >
        <form onSubmit={handleSaveLineForm} className="space-y-4 text-xs">
          <div>
            <label htmlFor="line-form-code" className="block font-medium text-[#202B26] mb-1">Kode Pos RAB</label>
            <input
              id="line-form-code"
              type="text"
              required
              value={lineForm.code}
              onChange={(e) => setLineForm({ ...lineForm, code: e.target.value })}
              className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg font-mono text-[#202B26]"
              placeholder="Contoh: DIV-01"
            />
          </div>

          <div>
            <label htmlFor="line-form-div" className="block font-medium text-[#202B26] mb-1">Uraian / Divisi Pekerjaan</label>
            <input
              id="line-form-div"
              type="text"
              required
              value={lineForm.divisionName}
              onChange={(e) => setLineForm({ ...lineForm, divisionName: e.target.value })}
              className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
              placeholder="Contoh: Pekerjaan Pengecoran Kolom Lt. 12"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="line-form-cat" className="block font-medium text-[#202B26] mb-1">Kategori</label>
              <select
                id="line-form-cat"
                value={lineForm.category}
                onChange={(e) => setLineForm({ ...lineForm, category: e.target.value as any })}
                className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
              >
                <option value="Pekerjaan Persiapan">Pekerjaan Persiapan</option>
                <option value="Pekerjaan Struktur">Pekerjaan Struktur</option>
                <option value="Pekerjaan Arsitektur">Pekerjaan Arsitektur</option>
                <option value="Pekerjaan MEP">Pekerjaan MEP</option>
                <option value="Manajemen & Overhead">Manajemen & Overhead</option>
              </select>
            </div>
            <div>
              <label htmlFor="line-form-unit" className="block font-medium text-[#202B26] mb-1">Satuan Unit</label>
              <input
                id="line-form-unit"
                type="text"
                required
                value={lineForm.unit}
                onChange={(e) => setLineForm({ ...lineForm, unit: e.target.value })}
                className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
                placeholder="ls, m3, kg, titik"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="line-form-vol" className="block font-medium text-[#202B26] mb-1">Volume</label>
              <input
                id="line-form-vol"
                type="number"
                step="any"
                required
                value={lineForm.volume}
                onChange={(e) => setLineForm({ ...lineForm, volume: e.target.value })}
                className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg font-mono text-[#202B26]"
              />
            </div>
            <div>
              <label htmlFor="line-form-rate" className="block font-medium text-[#202B26] mb-1">Harga Satuan (IDR)</label>
              <input
                id="line-form-rate"
                type="number"
                required
                value={lineForm.unitRate}
                onChange={(e) => setLineForm({ ...lineForm, unitRate: e.target.value })}
                className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg font-mono text-[#202B26]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="line-form-act" className="block font-medium text-[#202B26] mb-1">Realisasi Biaya Aktual (IDR)</label>
            <input
              id="line-form-act"
              type="number"
              value={lineForm.actualAmount}
              onChange={(e) => setLineForm({ ...lineForm, actualAmount: e.target.value })}
              className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg font-mono text-[#202B26]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E8E4]">
            <Button variant="secondary" size="sm" onClick={() => setIsEditLineModalOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" size="sm" type="submit">
              Simpan Pos RAB
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: AJUKAN REVISI ANGGARAN (ADDENDUM) */}
      <Modal
        isOpen={isNewRevModalOpen}
        onClose={() => setIsNewRevModalOpen(false)}
        title="Ajukan Addendum Revisi Anggaran"
        size="md"
      >
        <form onSubmit={handleSaveNewRevision} className="space-y-4 text-xs">
          <div>
            <label htmlFor="rev-form-title" className="block font-medium text-[#202B26] mb-1">Judul Usulan Addendum</label>
            <input
              id="rev-form-title"
              type="text"
              required
              value={revForm.title}
              onChange={(e) => setRevForm({ ...revForm, title: e.target.value })}
              className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
              placeholder="Contoh: Penyesuaian Harga Besi Beton Ulir D16-D25"
            />
          </div>

          <div>
            <label htmlFor="rev-form-div" className="block font-medium text-[#202B26] mb-1">Divisi Pekerjaan Terkait</label>
            <select
              id="rev-form-div"
              value={revForm.divisionName}
              onChange={(e) => setRevForm({ ...revForm, divisionName: e.target.value })}
              className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
            >
              <option value="Pekerjaan Struktur">Pekerjaan Struktur</option>
              <option value="Pekerjaan Arsitektur">Pekerjaan Arsitektur</option>
              <option value="Pekerjaan MEP">Pekerjaan MEP</option>
              <option value="Pekerjaan Persiapan">Pekerjaan Persiapan</option>
              <option value="Manajemen Proyek">Manajemen Proyek</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="rev-form-orig" className="block font-medium text-[#202B26] mb-1">Pagu Semula (IDR)</label>
              <input
                id="rev-form-orig"
                type="number"
                required
                value={revForm.originalAmount}
                onChange={(e) => setRevForm({ ...revForm, originalAmount: e.target.value })}
                className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg font-mono text-[#202B26]"
              />
            </div>
            <div>
              <label htmlFor="rev-form-prop" className="block font-medium text-[#202B26] mb-1">Usulan Pagu Baru (IDR)</label>
              <input
                id="rev-form-prop"
                type="number"
                required
                value={revForm.proposedAmount}
                onChange={(e) => setRevForm({ ...revForm, proposedAmount: e.target.value })}
                className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg font-mono text-[#202B26]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="rev-form-just" className="block font-medium text-[#202B26] mb-1">Justifikasi Teknis / Komersial</label>
            <textarea
              id="rev-form-just"
              required
              rows={3}
              value={revForm.justification}
              onChange={(e) => setRevForm({ ...revForm, justification: e.target.value })}
              className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
              placeholder="Jelaskan alasan penyesuaian pagu anggaran..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E8E4]">
            <Button variant="secondary" size="sm" onClick={() => setIsNewRevModalOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" size="sm" type="submit">
              Ajukan Addendum
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 3: TOLAK ADDENDUM */}
      <Modal
        isOpen={Boolean(rejectingRev)}
        onClose={() => setRejectingRev(null)}
        title="Tolak Usulan Addendum Anggaran"
        size="sm"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[#69766F]">
            Mohon isi alasan penolakan untuk addendum <span className="font-bold text-[#202B26]">{rejectingRev?.revisionNumber}</span>:
          </p>
          <div>
            <label htmlFor="rev-reject-reason" className="block font-medium text-[#202B26] mb-1">Alasan Penolakan</label>
            <textarea
              id="rev-reject-reason"
              required
              rows={3}
              value={revRejectReason}
              onChange={(e) => setRevRejectReason(e.target.value)}
              className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
              placeholder="Contoh: Estimasi harga satuan melebihi batas indeks acuan pasar..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E8E4]">
            <Button variant="secondary" size="sm" onClick={() => setRejectingRev(null)}>
              Batal
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={!revRejectReason.trim()}
              onClick={handleConfirmRejectRev}
            >
              Konfirmasi Tolak
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL 4: AJUKAN KAS KECIL */}
      <Modal
        isOpen={isNewPettyModalOpen}
        onClose={() => setIsNewPettyModalOpen(false)}
        title="Ajukan Pengeluaran Kas Kecil (Petty Cash)"
        size="md"
      >
        <form onSubmit={handleSaveNewPetty} className="space-y-4 text-xs">
          <div>
            <label htmlFor="petty-amount" className="block font-medium text-[#202B26] mb-1">Jumlah Pengeluaran (Maks Rp 5.000.000)</label>
            <input
              id="petty-amount"
              type="number"
              max={5000000}
              required
              value={pettyForm.amount}
              onChange={(e) => setPettyForm({ ...pettyForm, amount: e.target.value })}
              className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg font-mono text-[#202B26]"
              placeholder="Contoh: 750000"
            />
          </div>

          <div>
            <label htmlFor="petty-cat" className="block font-medium text-[#202B26] mb-1">Kategori Keperluan</label>
            <select
              id="petty-cat"
              value={pettyForm.category}
              onChange={(e) => setPettyForm({ ...pettyForm, category: e.target.value as any })}
              className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
            >
              <option value="Konsumsi & Lembur">Konsumsi & Lembur</option>
              <option value="Bahan Bakar & Tol">Bahan Bakar & Tol</option>
              <option value="Alat Bantu Darurat">Alat Bantu Darurat</option>
              <option value="ATK & Fotokopi Site">ATK & Fotokopi Site</option>
              <option value="Lainnya">Lainnya</option>
            </select>
          </div>

          <div>
            <label htmlFor="petty-purpose" className="block font-medium text-[#202B26] mb-1">Rincian Keperluan Pengeluaran</label>
            <textarea
              id="petty-purpose"
              required
              rows={3}
              value={pettyForm.purpose}
              onChange={(e) => setPettyForm({ ...pettyForm, purpose: e.target.value })}
              className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
              placeholder="Contoh: Pembelian mata bor beton darurat dan konsumsi lembur pengecoran zona barat..."
            />
          </div>

          <div>
            <label htmlFor="petty-proof" className="block font-medium text-[#202B26] mb-1">Nama File Bukti Nota / Kwitansi</label>
            <input
              id="petty-proof"
              type="text"
              required
              value={pettyForm.receiptProof}
              onChange={(e) => setPettyForm({ ...pettyForm, receiptProof: e.target.value })}
              className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg font-mono text-[#202B26]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E8E4]">
            <Button variant="secondary" size="sm" onClick={() => setIsNewPettyModalOpen(false)}>
              Batal
            </Button>
            <Button variant="primary" size="sm" type="submit">
              Ajukan Kas Kecil
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 5: TOLAK KAS KECIL */}
      <Modal
        isOpen={Boolean(rejectingPetty)}
        onClose={() => setRejectingPetty(null)}
        title="Tolak Pengajuan Kas Kecil"
        size="sm"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[#69766F]">
            Mohon isi alasan penolakan untuk voucher <span className="font-bold text-[#202B26]">{rejectingPetty?.pettyCashNo}</span>:
          </p>
          <div>
            <label htmlFor="petty-reject-reason" className="block font-medium text-[#202B26] mb-1">Alasan Penolakan</label>
            <textarea
              id="petty-reject-reason"
              required
              rows={3}
              value={pettyRejectReason}
              onChange={(e) => setPettyRejectReason(e.target.value)}
              className="w-full p-2.5 bg-white border border-[#E2E8E4] rounded-lg text-[#202B26]"
              placeholder="Contoh: Bukti nota tidak memiliki cap basah toko..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E8E4]">
            <Button variant="secondary" size="sm" onClick={() => setRejectingPetty(null)}>
              Batal
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={!pettyRejectReason.trim()}
              onClick={handleConfirmRejectPetty}
            >
              Konfirmasi Tolak
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
