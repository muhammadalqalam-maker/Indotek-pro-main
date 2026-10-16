/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Field Reports Domain Context
 * Synchronizes daily field reports with realtime listener on active screens.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { FieldReport, FieldReportStatus } from '../types';
import { dataService } from '../services/dataService';
import { useAuth } from './AuthContext';
import { useUI, getScreenIdFromPathname } from './UIContext';

export interface FieldReportsContextType {
  fieldReports: FieldReport[];
  setFieldReports: React.Dispatch<React.SetStateAction<FieldReport[]>>;
  addFieldReport: (
    report: Omit<FieldReport, 'id' | 'reportNumber' | 'status'>,
    idempotencyKey?: string
  ) => Promise<string>;
  reviewFieldReport: (reportId: string, reviewerName: string, status: FieldReportStatus, notes?: string) => Promise<void>;
}

const FieldReportsContext = createContext<FieldReportsContextType | undefined>(undefined);

export const FieldReportsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const { workspaceId, actorInfo, projectDetailTab, isTabVisible, addToast, setLoadingFieldReports } = useUI();
  const location = useLocation();
  const screenId = getScreenIdFromPathname(location.pathname);

  const [fieldReports, setFieldReports] = useState<FieldReport[]>([]);

  // Realtime subscription ONLY active when relevant screen is open
  useEffect(() => {
    if (!currentUser || !isTabVisible) return;

    const needsFieldReportsRealtime =
      screenId === 'field-reports' ||
      (screenId === 'project-detail' && projectDetailTab === 'reports');

    if (!needsFieldReportsRealtime) return;

    setLoadingFieldReports(true);
    const unsub = dataService.subscribeFieldReports(
      (items) => {
        setFieldReports(items);
        setLoadingFieldReports(false);
      },
      workspaceId
    );

    return () => { unsub?.(); };
  }, [currentUser, isTabVisible, location.pathname, projectDetailTab, workspaceId]);

  const addFieldReport = async (
    reportData: Omit<FieldReport, 'id' | 'reportNumber' | 'status' | 'createdAt' | 'updatedAt'>,
    idempotencyKey?: string
  ) => {
    try {
      const reportId = await dataService.addFieldReport(reportData, actorInfo, workspaceId, idempotencyKey);
      addToast({
        type: 'success',
        title: 'Laporan Lapangan Terkirim',
        message: `LHP berhasil disimpan ke Supabase untuk diverifikasi Site Manager.`,
      });
      return reportId;
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
      const decision: 'approved' | 'rejected' = status === 'Disetujui' ? 'approved' : 'rejected';
      await dataService.reviewFieldReport(reportId, decision, reviewerName, notes, actorInfo, workspaceId);
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
