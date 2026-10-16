/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Materials Domain Context
 * Synchronizes materials catalog, stock mutations, and physical stocktake adjustments.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { MaterialItem, StockMutation, StockAdjustment } from '../types';
import { getMaterials, getStockMutations, createStockMutation, createStockAdjustment, decideStockAdjustment } from '../data/materials';
import { useAuth } from './AuthContext';
import { useUI, getScreenIdFromPathname } from './UIContext';

export interface MaterialsContextType {
  materials: MaterialItem[];
  setMaterials: React.Dispatch<React.SetStateAction<MaterialItem[]>>;
  stockMutations: StockMutation[];
  setStockMutations: React.Dispatch<React.SetStateAction<StockMutation[]>>;
  stockAdjustments: StockAdjustment[];
  setStockAdjustments: React.Dispatch<React.SetStateAction<StockAdjustment[]>>;

  addStockMutation: (mutation: Omit<StockMutation, 'id'>) => Promise<void>;
  submitStockAdjustment: (adj: Omit<StockAdjustment, 'id' | 'adjustmentNo' | 'status' | 'submittedAt'>) => Promise<void>;
  approveStockAdjustment: (adjId: string, approverName: string) => Promise<void>;
  rejectStockAdjustment: (adjId: string, rejectorName: string, reason: string) => Promise<void>;
  loadMaterialsData: () => Promise<void>;
}

const MaterialsContext = createContext<MaterialsContextType | undefined>(undefined);

export const MaterialsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const location = useLocation();
  const screenId = getScreenIdFromPathname(location.pathname);
  const { workspaceId, actorInfo, addToast, setPendingActions, setLoadingMaterials } = useUI();

  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [stockMutations, setStockMutations] = useState<StockMutation[]>([]);
  const [stockAdjustments, setStockAdjustments] = useState<StockAdjustment[]>([]);

  const loadMaterialsData = async () => {
    setLoadingMaterials(true);
    try {
      const [mats, muts] = await Promise.all([
        getMaterials(),
        getStockMutations(),
      ]);
      if (mats) setMaterials(mats);
      if (muts) setStockMutations(muts);
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Gagal Memuat Data Material',
        message: err?.message || 'Terjadi kesalahan saat memuat material.',
      });
    } finally {
      setLoadingMaterials(false);
    }
  };

  // Initial load of master materials
  useEffect(() => {
    if (!currentUser) return;
    let isMounted = true;
    getMaterials().then((m) => {
      if (isMounted && m) setMaterials(m);
    })
    .catch((err) => {
      addToast({
        type: 'danger',
        title: 'Gagal Memuat Material',
        message: err?.message || 'Tidak dapat mengambil material.',
      });
    });
    return () => { isMounted = false; };
  }, [currentUser, workspaceId]);

  // Load mutations on demand when materials screen active
  useEffect(() => {
    if (!currentUser || screenId !== 'materials') return;
    let isMounted = true;
    getMaterials().then((m) => {
      if (isMounted && m) setMaterials(m);
    }).catch((err) => {
      addToast({
        type: 'danger',
        title: 'Gagal Memuat Material',
        message: err?.message || 'Tidak dapat mengambil material.',
      });
    });

    getStockMutations().then((muts) => {
      if (isMounted && muts) setStockMutations(muts);
    }).catch((err) => {
      addToast({
        type: 'danger',
        title: 'Gagal Memuat Mutasi Stock',
        message: err?.message || 'Tidak dapat mengambil mutasi stock.',
      });
    });

    return () => { isMounted = false; };
  }, [currentUser, location.pathname, workspaceId]);

  const addStockMutation = async (mutationData: Omit<StockMutation, 'id'>) => {
    try {
      const rpcType = mutationData.type === 'Masuk' ? 'IN' : 'OUT';
      await createStockMutation(mutationData.materialId, rpcType as 'IN' | 'OUT', mutationData.quantity, mutationData.referenceNo);
      await loadMaterialsData();
      addToast({
        type: 'success',
        title: 'Mutasi Material Dicatat',
        message: `Surat jalan ${mutationData.referenceNo} (${mutationData.type}) berhasil dicatat.`,
      });
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Mutasi Material Gagal',
        message: err?.message || 'Gagal memproses mutasi material di Supabase.',
      });
      throw err;
    }
  };

  const submitStockAdjustment = async (
    adjData: Omit<StockAdjustment, 'id' | 'adjustmentNo' | 'status' | 'submittedAt'>
  ) => {
    try {
      await createStockAdjustment(adjData.materialId, adjData.physicalStock, adjData.reason);
      await loadMaterialsData();
      addToast({
        type: 'info',
        title: 'Koreksi Opname Diajukan',
        message: `BA Opname Fisik ${adjData.materialName} berhasil dikirim ke server.`,
      });
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Pengajuan Opname Gagal',
        message: err?.message || 'Gagal menyimpan pengajuan opname.',
      });
      throw err;
    }
  };

  const approveStockAdjustment = async (adjId: string, approverName: string) => {
    setPendingActions((prev) => ({ ...prev, [adjId]: true }));
    try {
      await decideStockAdjustment(adjId, 'approve');
      await loadMaterialsData();
      addToast({
        type: 'success',
        title: 'Opname Fisik Disetujui',
        message: `Stok material telah diselaraskan dengan hasil opname fisik.`,
      });
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Persetujuan Opname Ditolak',
        message: err?.message || 'Wewenang tidak mencukupi untuk menyetujui opname.',
      });
      throw err;
    } finally {
      setPendingActions((prev) => {
        const next = { ...prev };
        delete next[adjId];
        return next;
      });
    }
  };

  const rejectStockAdjustment = async (adjId: string, rejectorName: string, reason: string) => {
    setPendingActions((prev) => ({ ...prev, [adjId]: true }));
    try {
      await decideStockAdjustment(adjId, 'reject', reason);
      await loadMaterialsData();
      addToast({
        type: 'danger',
        title: 'Opname Fisik Ditolak',
        message: `Pengajuan opname ditolak oleh ${rejectorName}. Alasan: ${reason}`,
      });
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Gagal Menolak Opname',
        message: err?.message || 'Kesalahan saat menolak opname.',
      });
      throw err;
    } finally {
      setPendingActions((prev) => {
        const next = { ...prev };
        delete next[adjId];
        return next;
      });
    }
  };

  return (
    <MaterialsContext.Provider
      value={{
        materials,
        setMaterials,
        stockMutations,
        setStockMutations,
        stockAdjustments,
        setStockAdjustments,
        addStockMutation,
        submitStockAdjustment,
        approveStockAdjustment,
        rejectStockAdjustment,
        loadMaterialsData,
      }}
    >
      {children}
    </MaterialsContext.Provider>
  );
};

export const useMaterials = (): MaterialsContextType => {
  const context = useContext(MaterialsContext);
  if (!context) throw new Error('useMaterials must be used within a MaterialsProvider');
  return context;
};
