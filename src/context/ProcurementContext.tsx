/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Procurement Domain Context
 * Synchronizes purchase orders with realtime updates when the screen is active.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { PurchaseOrder } from '../types';
import { firestoreService } from '../services/firestoreService';
import { useAuth } from './AuthContext';
import { useUI } from './UIContext';

export interface ProcurementContextType {
  purchaseOrders: PurchaseOrder[];
  setPurchaseOrders: React.Dispatch<React.SetStateAction<PurchaseOrder[]>>;
  addPurchaseOrder: (po: Omit<PurchaseOrder, 'id' | 'poNumber' | 'status'>) => Promise<void>;
  approvePurchaseOrder: (poId: string, approverName: string) => Promise<void>;
  rejectPurchaseOrder: (poId: string, rejectorName: string, reason: string) => Promise<void>;
}

const ProcurementContext = createContext<ProcurementContextType | undefined>(undefined);

export const ProcurementProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const { workspaceId, actorInfo, currentScreen, projectDetailTab, isTabVisible, addToast, setPendingActions } = useUI();

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);

  // Realtime subscription ONLY active when relevant screen is open
  useEffect(() => {
    if (!currentUser || !isTabVisible) return;

    const needsPORealtime =
      currentScreen === 'procurement' ||
      currentScreen === 'dashboard' ||
      (currentScreen === 'project-detail' && projectDetailTab === 'procurement');

    if (!needsPORealtime) return;

    const unsub = firestoreService.subscribePurchaseOrders(
      (items) => setPurchaseOrders(items),
      (err) => console.warn('PO sync notice:', err),
      workspaceId
    );

    return () => { unsub?.(); };
  }, [currentUser, isTabVisible, currentScreen, projectDetailTab, workspaceId]);

  const addPurchaseOrder = async (
    poData: Omit<PurchaseOrder, 'id' | 'poNumber' | 'status'>
  ) => {
    try {
      await firestoreService.addPurchaseOrder(poData, actorInfo, workspaceId);
      addToast({
        type: 'success',
        title: 'PO Berhasil Diajukan',
        message: `Pengajuan pengadaan untuk ${poData.supplierName} berhasil disimpan.`,
      });
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Gagal Membuat PO',
        message: err?.message || 'Gagal menyimpan pengajuan PO.',
      });
      throw err;
    }
  };

  const approvePurchaseOrder = async (poId: string, approverName: string) => {
    setPendingActions((prev) => ({ ...prev, [poId]: true }));
    try {
      await firestoreService.approvePurchaseOrder(poId, approverName, actorInfo, workspaceId);
      addToast({
        type: 'success',
        title: 'Purchase Order Disetujui',
        message: `PO ${poId} telah disetujui untuk diteruskan ke logistik supplier.`,
      });
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Persetujuan PO Gagal',
        message: err?.message || 'Wewenang tidak mencukupi untuk menyetujui PO.',
      });
      throw err;
    } finally {
      setPendingActions((prev) => {
        const next = { ...prev };
        delete next[poId];
        return next;
      });
    }
  };

  const rejectPurchaseOrder = async (poId: string, rejectorName: string, reason: string) => {
    setPendingActions((prev) => ({ ...prev, [poId]: true }));
    try {
      await firestoreService.rejectPurchaseOrder(poId, rejectorName, reason, actorInfo, workspaceId);
      addToast({
        type: 'danger',
        title: 'Purchase Order Ditolak',
        message: `PO ${poId} ditolak. Alasan: "${reason}".`,
      });
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Gagal Menolak PO',
        message: err?.message || 'Kesalahan saat menolak PO.',
      });
      throw err;
    } finally {
      setPendingActions((prev) => {
        const next = { ...prev };
        delete next[poId];
        return next;
      });
    }
  };

  return (
    <ProcurementContext.Provider
      value={{
        purchaseOrders,
        setPurchaseOrders,
        addPurchaseOrder,
        approvePurchaseOrder,
        rejectPurchaseOrder,
      }}
    >
      {children}
    </ProcurementContext.Provider>
  );
};

export const useProcurement = (): ProcurementContextType => {
  const context = useContext(ProcurementContext);
  if (!context) throw new Error('useProcurement must be used within a ProcurementProvider');
  return context;
};
