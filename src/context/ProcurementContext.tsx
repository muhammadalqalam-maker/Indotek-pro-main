/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Procurement Domain Context
 * Synchronizes purchase orders with realtime updates when the screen is active.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { PurchaseOrder } from '../types';
import { dataService } from '../services/dataService';
import { useAuth } from './AuthContext';
import { useUI } from './UIContext';
import { useLocation } from 'react-router-dom';
import { getScreenIdFromPathname } from './UIContext';

export interface ProcurementContextType {
  purchaseOrders: PurchaseOrder[];
  setPurchaseOrders: React.Dispatch<React.SetStateAction<PurchaseOrder[]>>;
  addPurchaseOrder: (po: Omit<PurchaseOrder, 'id' | 'poNumber' | 'status'>) => Promise<void>;
  approvePurchaseOrder: (poId: string, approverName: string, overrideReason?: string) => Promise<void>;
  rejectPurchaseOrder: (poId: string, rejectorName: string, reason: string) => Promise<void>;
}

const ProcurementContext = createContext<ProcurementContextType | undefined>(undefined);

export const ProcurementProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const { workspaceId, actorInfo, projectDetailTab, isTabVisible, addToast, setPendingActions, setLoadingProcurement } = useUI();
  const location = useLocation();
  const screenId = getScreenIdFromPathname(location.pathname);

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);

  // Realtime subscription ONLY active when relevant screen is open
  useEffect(() => {
    if (!currentUser || !isTabVisible) return;

    const needsPORealtime =
      screenId === 'procurement' ||
      screenId === 'dashboard' ||
      (screenId === 'project-detail' && projectDetailTab === 'procurement');

    if (!needsPORealtime) return;

    setLoadingProcurement(true);
    const unsub = dataService.subscribePurchaseOrders(
      (items) => {
        setPurchaseOrders(items);
        setLoadingProcurement(false);
      },
      workspaceId
    );

    return () => { unsub?.(); };
  }, [currentUser, isTabVisible, location.pathname, projectDetailTab, workspaceId]);

  const addPurchaseOrder = async (
    poData: Omit<PurchaseOrder, 'id' | 'poNumber' | 'status' | 'createdAt' | 'updatedAt'>
  ) => {
    try {
      await dataService.addPurchaseOrder(poData, actorInfo, workspaceId);
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

  const approvePurchaseOrder = async (poId: string, approverName: string, overrideReason?: string) => {
    setPendingActions((prev) => ({ ...prev, [poId]: true }));
    try {
      await dataService.approvePurchaseOrder(poId, approverName, overrideReason, actorInfo, workspaceId);
      addToast({
        type: 'success',
        title: 'Purchase Order Disetujui',
        message: `PO ${poId} telah disetujui${overrideReason ? ' (SoD Override dicatat di audit)' : ''}.`,
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
      await dataService.rejectPurchaseOrder(poId, rejectorName, reason, actorInfo, workspaceId);
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
