/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Field Reports Domain Context
 * Synchronizes daily field reports with realtime listener on active screens.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { FieldReport, FieldReportStatus } from '../types';
import { firestoreService } from '../services/firestoreService';
import { useAuth } from './AuthContext';
import { useUI } from './UIContext';

export interface FieldReportsContextType {
  fieldReports: FieldReport[];
  setFieldReports: React.Dispatch<React.SetStateAction<FieldReport[]>>;
  addFieldReport: (report: Omit<FieldReport, 'id' | 'reportNumber' | 'status'>) => Promise<void>;
  reviewFieldReport: (reportId: string, reviewerName: string, status: FieldReportStatus, notes?: string) => Promise<void>;
}

const FieldReportsContext = createContext<FieldReportsContextType | undefined>(undefined);

export const FieldReportsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const { workspaceId, actorInfo, currentScreen, projectDetailTab, isTabVisible, addToast } = useUI();

  const [fieldReports, setFieldReports] = useState<FieldReport[]>([]);

  // Realtime subscription ONLY active when relevant screen is open
  useEffect(() => {
    if (!currentUser || !isTabVisible) return;

    const needsFieldReportsRealtime =
      currentScreen === 'field-reports' ||
      (currentScreen === 'project-detail' && projectDetailTab === 'reports');

    if (!needsFieldReportsRealtime) return;

    const unsub = firestoreService.subscribeFieldReports(
      (items) => setFieldReports(items),
      (err) => console.warn('Field reports sync notice:', err),
      workspaceId
    );

    return () => { unsub?.(); };
  }, [currentUser, isTabVisible, currentScreen, projectDetailTab, workspaceId]);

  const addFieldReport = async (
    reportData: Omit<FieldReport, 'id' | 'reportNumber' | 'status'>
  ) => {
    try {
      await firestoreService.addFieldReport(reportData, actorInfo, workspaceId);
      addToast({
        type: 'success',
        title: 'Laporan Lapangan Terkirim',
        message: `LHP berhasil disimpan ke Firestore untuk diverifikasi Site Manager.`,
      });
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Gagal Menyimpan LHP',
        message: err?.message || 'Kesalahan saat menyimpan laporan harian.',
      });
      throw err;
    }
  };

  const reviewFieldReport = async (
    reportId: string,
    reviewerName: string,
    status: FieldReportStatus,
    notes?: string
  ) => {
    try {
      await firestoreService.reviewFieldReport(reportId, reviewerName, status, notes, actorInfo, workspaceId);
      addToast({
        type: 'success',
        title: 'Status LHP Diperbarui',
        message: `Laporan lapangan telah berstatus "${status}".`,
      });
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Gagal Memverifikasi LHP',
        message: err?.message || 'Kesalahan saat memperbarui status LHP.',
      });
      throw err;
    }
  };

  return (
    <FieldReportsContext.Provider
      value={{
        fieldReports,
        setFieldReports,
        addFieldReport,
        reviewFieldReport,
      }}
    >
      {children}
    </FieldReportsContext.Provider>
  );
};

export const useFieldReports = (): FieldReportsContextType => {
  const context = useContext(FieldReportsContext);
  if (!context) throw new Error('useFieldReports must be used within a FieldReportsProvider');
  return context;
};
