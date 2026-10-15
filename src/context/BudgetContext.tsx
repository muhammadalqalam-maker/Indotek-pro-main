/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Budget Domain Context
 * Synchronizes budget revisions, addenda, and site petty cash on demand.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { BudgetRevision, PettyCashEntry } from '../types';
import { dataService } from '../services/dataService';
import { useAuth } from './AuthContext';
import { useUI, getScreenIdFromPathname } from './UIContext';
import { useProjects } from './ProjectsContext';

export interface BudgetContextType {
  budgetRevisions: BudgetRevision[];
  setBudgetRevisions: React.Dispatch<React.SetStateAction<BudgetRevision[]>>;
  pettyCash: PettyCashEntry[];
  setPettyCash: React.Dispatch<React.SetStateAction<PettyCashEntry[]>>;

  submitBudgetRevision: (rev: Omit<BudgetRevision, 'id' | 'revisionNumber' | 'status' | 'submittedAt'>) => Promise<void>;
  approveBudgetRevision: (revId: string, approverName: string) => Promise<void>;
  rejectBudgetRevision: (revId: string, rejectorName: string, reason: string) => Promise<void>;

  submitPettyCash: (cash: Omit<PettyCashEntry, 'id' | 'pettyCashNo' | 'status' | 'submittedAt'>) => Promise<void>;
  approvePettyCash: (cashId: string, approverName: string) => Promise<void>;
  rejectPettyCash: (cashId: string, rejectorName: string, reason: string) => Promise<void>;
  disbursePettyCash: (cashId: string, disburserName: string) => Promise<void>;
  loadBudgetData: () => Promise<void>;
}

const BudgetContext = createContext<BudgetContextType | undefined>(undefined);

export const BudgetProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const { workspaceId, actorInfo, addToast, setPendingActions, setLoadingBudget } = useUI();
  const { budgetLines, refreshProjects } = useProjects();
  const location = useLocation();
  const screenId = getScreenIdFromPathname(location.pathname);

  const [budgetRevisions, setBudgetRevisions] = useState<BudgetRevision[]>([]);
  const [pettyCash, setPettyCash] = useState<PettyCashEntry[]>([]);

  const loadBudgetData = async () => {
    setLoadingBudget(true);
    try {
      const [revisions, cash] = await Promise.all([
        dataService.getBudgetRevisions(workspaceId),
        dataService.getPettyCashPaged({ pageSize: 50, wsId: workspaceId }),
      ]);
      if (revisions) setBudgetRevisions(revisions);
      if (cash?.items) setPettyCash(cash.items);
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Gagal Memuat Data Anggaran',
        message: 'Kesalahan saat memuat data anggaran dan kas kecil. Coba muat ulang halaman atau hubungi dukungan.',
      });
    } finally {
      setLoadingBudget(false);
    }
  };

  // On Screen change to 'budget', load on demand
  useEffect(() => {
    if (!currentUser || screenId !== 'budget') return;
    let isMounted = true;
    setLoadingBudget(true);
    Promise.all([
      dataService.getBudgetRevisions(workspaceId),
      dataService.getPettyCashPaged({ pageSize: 50, wsId: workspaceId }),
    ])
      .then(([r, p]) => {
        if (isMounted) {
          if (r) setBudgetRevisions(r);
          if (p?.items) setPettyCash(p.items);
        }
      })
      .catch((err: any) => {
        if (isMounted) {
          addToast({
            type: 'danger',
            title: 'Gagal Memuat Data Anggaran',
            message: 'Kesalahan saat memuat data anggaran dan kas kecil. Coba muat ulang halaman atau hubungi dukungan.',
          });
        }
      })
      .finally(() => {
        if (isMounted) setLoadingBudget(false);
      });

    return () => { isMounted = false; };
  }, [currentUser, location.pathname, workspaceId, setLoadingBudget, addToast]);

  const submitBudgetRevision = async (
    revData: Omit<BudgetRevision, 'id' | 'revisionNumber' | 'status' | 'submittedAt'>
  ) => {
    try {
      await dataService.submitBudgetRevision(revData, actorInfo, workspaceId);
      await loadBudgetData();
      addToast({
        type: 'info',
        title: 'Addendum Revisi Anggaran Diajukan',
        message: `Usulan penyesuaian pagu ${revData.divisionName} berhasil diajukan untuk verifikasi Direksi.`,
      });
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Pengajuan Addendum Gagal',
        message: err?.message || 'Gagal menyimpan usulan revisi anggaran.',
      });
      throw err;
    }
  };

  const approveBudgetRevision = async (revId: string, approverName: string) => {
    setPendingActions((prev) => ({ ...prev, [revId]: true }));
    try {
      await dataService.approveBudgetRevision(
        revId,
        approverName,
        actorInfo,
        workspaceId
      );

      await Promise.all([loadBudgetData(), refreshProjects(true)]);

      addToast({
        type: 'success',
        title: 'Addendum Anggaran Disetujui',
        message: `Revisi anggaran telah disahkan! Pagu divisi RAB diperbarui dan riwayat versi baru tercatat.`,
      });
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Persetujuan Addendum Gagal',
        message: err?.message || 'Wewenang tidak mencukupi untuk menyetujui addendum anggaran.',
      });
      throw err;
    } finally {
      setPendingActions((prev) => {
        const next = { ...prev };
        delete next[revId];
        return next;
      });
    }
  };

  const rejectBudgetRevision = async (revId: string, rejectorName: string, reason: string) => {
    setPendingActions((prev) => ({ ...prev, [revId]: true }));
    try {
      await dataService.rejectBudgetRevision(revId, rejectorName, reason, actorInfo, workspaceId);
      await loadBudgetData();
      addToast({
        type: 'danger',
        title: 'Addendum Anggaran Ditolak',
        message: `Usulan revisi anggaran ditolak oleh ${rejectorName}. Alasan: "${reason}".`,
      });
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Gagal Menolak Addendum',
        message: err?.message || 'Kesalahan saat memproses penolakan revisi anggaran.',
      });
      throw err;
    } finally {
      setPendingActions((prev) => {
        const next = { ...prev };
        delete next[revId];
        return next;
      });
    }
  };

  const submitPettyCash = async (
    cashData: Omit<PettyCashEntry, 'id' | 'pettyCashNo' | 'status' | 'submittedAt' | 'createdAt' | 'updatedAt'>
  ) => {
    try {
      await dataService.addPettyCash(cashData, actorInfo, workspaceId);
      await loadBudgetData();
      addToast({
        type: 'info',
        title: 'Kas Kecil Diajukan',
        message: `Klaim kas kecil Rp ${cashData.amount.toLocaleString('id-ID')} berhasil diajukan ke Bagian Keuangan.`,
      });
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Gagal Mengajukan Kas Kecil',
        message: err?.message || 'Kesalahan saat menyimpan pengajuan kas kecil.',
      });
      throw err;
    }
  };

  const approvePettyCash = async (cashId: string, approverName: string) => {
    setPendingActions((prev) => ({ ...prev, [cashId]: true }));
    try {
      await dataService.approvePettyCash(cashId, approverName, actorInfo, workspaceId);
      await loadBudgetData();
      addToast({
        type: 'success',
        title: 'Kas Kecil Disetujui',
        message: `Voucher kas kecil telah disetujui.`,
      });
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Gagal Menyetujui Kas Kecil',
        message: err?.message || 'Wewenang tidak mencukupi untuk menyetujui kas kecil.',
      });
      throw err;
    } finally {
      setPendingActions((prev) => {
        const next = { ...prev };
        delete next[cashId];
        return next;
      });
    }
  };

  const rejectPettyCash = async (cashId: string, rejectorName: string, reason: string) => {
    setPendingActions((prev) => ({ ...prev, [cashId]: true }));
    try {
      await dataService.rejectPettyCash(cashId, rejectorName, reason, actorInfo, workspaceId);
      await loadBudgetData();
      addToast({
        type: 'danger',
        title: 'Kas Kecil Ditolak',
        message: `Voucher kas kecil ditolak. Alasan: "${reason}".`,
      });
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Gagal Menolak Kas Kecil',
        message: err?.message || 'Kesalahan saat menolak kas kecil.',
      });
      throw err;
    } finally {
      setPendingActions((prev) => {
        const next = { ...prev };
        delete next[cashId];
        return next;
      });
    }
  };

  const disbursePettyCash = async (cashId: string, disburserName: string) => {
    setPendingActions((prev) => ({ ...prev, [cashId]: true }));
    try {
      await dataService.disbursePettyCash(cashId, disburserName, actorInfo, workspaceId);
      await loadBudgetData();
      addToast({
        type: 'success',
        title: 'Kas Kecil Dicairkan',
        message: `Dana kas kecil telah dicairkan ke lapangan.`,
      });
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Gagal Mencairkan Kas Kecil',
        message: err?.message || 'Wewenang tidak mencukupi untuk mencairkan kas kecil.',
      });
      throw err;
    } finally {
      setPendingActions((prev) => {
        const next = { ...prev };
        delete next[cashId];
        return next;
      });
    }
  };

  return (
    <BudgetContext.Provider
      value={{
        budgetRevisions,
        setBudgetRevisions,
        pettyCash,
        setPettyCash,
        submitBudgetRevision,
        approveBudgetRevision,
        rejectBudgetRevision,
        submitPettyCash,
        approvePettyCash,
        rejectPettyCash,
        disbursePettyCash,
        loadBudgetData,
      }}
    >
      {children}
    </BudgetContext.Provider>
  );
};

export const useBudget = (): BudgetContextType => {
  const context = useContext(BudgetContext);
  if (!context) throw new Error('useBudget must be used within a BudgetProvider');
  return context;
};
