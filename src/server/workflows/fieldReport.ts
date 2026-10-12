/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrustedActor } from '../auth';
import { hasApprovalAuthority } from '../../lib/rbac';
import {
  adminDb,
  getTenantCollection,
  checkIdempotency,
  saveIdempotencyInTx,
  generateTransactionalDocNumber,
  recordAuditAndNotificationInTx,
  WorkflowResponse,
} from './common';

export async function handleFieldReportAction(
  actor: TrustedActor,
  payload: {
    action: 'create' | 'verify' | 'approve' | 'revise';
    reportId?: string;
    reviewerNotes?: string;
    reportData?: any;
    idempotencyKey?: string;
  }
): Promise<WorkflowResponse> {
  const { action, reportId, reviewerNotes, reportData, idempotencyKey } = payload;
  const wsId = actor.workspaceId;

  if (idempotencyKey) {
    const cached = await checkIdempotency(wsId, idempotencyKey);
    if (cached) return { ...cached, idempotentReplay: true };
  }

  return await adminDb.runTransaction(async (tx) => {
    if (idempotencyKey) {
      const idemRef = getTenantCollection(wsId, 'idempotency_keys').doc(idempotencyKey);
      const idemSnap = await tx.get(idemRef);
      if (idemSnap.exists) {
        const d = idemSnap.data();
        if (d?.status === 'COMPLETED') {
          if (!d.expiresAt || new Date(d.expiresAt).getTime() >= Date.now()) {
            return { ...d.result, idempotentReplay: true };
          }
        }
      }
    }

    // ----------------- ACTION: CREATE -----------------
    if (action === 'create') {
      if (!reportData || !reportData.projectId) {
        throw new Error('Data Laporan Harian tidak lengkap: projectId wajib diisi.');
      }

      const id = reportData.id || `fr-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      const docRef = getTenantCollection(wsId, 'field_reports').doc(id);

      const reportNumber = await generateTransactionalDocNumber(
        tx,
        'LHP',
        reportData.projectName || 'IND',
        wsId
      );

      const now = new Date().toISOString();

      const newRecord = {
        ...reportData,
        id,
        reportNumber,
        status: 'Draft',
        siteSupervisor: actor.name,
        siteSupervisorUid: actor.uid,
        createdBy: actor.uid,
        updatedBy: actor.uid,
        workspaceId: wsId,
        schemaVersion: 2,
        createdAt: now,
        updatedAt: now,
      };

      tx.set(docRef, newRecord);

      recordAuditAndNotificationInTx(tx, actor, {
        action: 'FIELD_REPORT_SUBMITTED',
        recordType: 'field_report',
        recordId: id,
        details: `Membuat Draft Laporan Harian Proyek ${reportNumber} (${reportData.projectName})`,
        projectId: newRecord.projectId,
        projectName: newRecord.projectName,
        previousValue: 'None',
        newValue: 'Draft',
      });

      const response: WorkflowResponse = {
        success: true,
        message: `Laporan Harian ${reportNumber} berhasil dibuat sebagai Draft.`,
        data: { id, reportNumber, status: 'Draft' },
      };

      saveIdempotencyInTx(tx, wsId, idempotencyKey, response, now);

      return response;
    }

    // ----------------- ACTION: VERIFY / APPROVE / REVISE -----------------
    if (!reportId) throw new Error('ID Laporan Harian wajib disertakan.');
    const repRef = getTenantCollection(wsId, 'field_reports').doc(reportId);
    const repSnap = await tx.get(repRef);
    if (!repSnap.exists) {
      throw new Error(`Laporan Harian ${reportId} tidak ditemukan.`);
    }

    const currentRep = repSnap.data()!;
    const now = new Date().toISOString();

    // 1. Verify (Draft or Perlu Revisi -> Diverifikasi)
    if (action === 'verify') {
      if (currentRep.status !== 'Draft' && currentRep.status !== 'Perlu Revisi') {
        throw new Error(
          `Transisi status tidak valid: Dokumen berstatus "${currentRep.status}". Hanya "Draft" atau "Perlu Revisi" yang dapat diverifikasi.`
        );
      }

      tx.update(repRef, {
        status: 'Diverifikasi',
        verifiedBy: actor.name,
        verifiedByUid: actor.uid,
        verifiedAt: now,
        updatedAt: now,
        updatedBy: actor.uid,
      });

      recordAuditAndNotificationInTx(tx, actor, {
        action: 'FIELD_REPORT_VERIFIED',
        recordType: 'field_report',
        recordId: reportId,
        details: `Memverifikasi data teknis Laporan Harian ${currentRep.reportNumber}`,
        projectId: currentRep.projectId,
        projectName: currentRep.projectName,
        previousValue: currentRep.status,
        newValue: 'Diverifikasi',
        notification: {
          title: 'Laporan Harian Telah Diverifikasi',
          message: `${currentRep.reportNumber} diverifikasi oleh ${actor.name}. Menunggu persetujuan PM.`,
          type: 'info',
          targetScreen: 'field-reports',
          targetRoles: ['Project Manager', 'Owner / Director'],
        },
      });

      const response: WorkflowResponse = {
        success: true,
        message: `Laporan Harian ${currentRep.reportNumber} berhasil diverifikasi.`,
        data: { reportId, status: 'Diverifikasi' },
      };

      saveIdempotencyInTx(tx, wsId, idempotencyKey, response, now);

      return response;
    }

    // 2. Approve (Diverifikasi -> Disetujui)
    if (action === 'approve') {
      if (!hasApprovalAuthority(actor.role, 'fieldReport')) {
        throw new Error(
          `Peran "${actor.role}" tidak berwenang memberikan paraf persetujuan resmi. Diperlukan peran Project Manager atau Owner / Director.`
        );
      }

      if (currentRep.status !== 'Diverifikasi') {
        throw new Error(
          `Transisi status tidak valid: Dokumen berstatus "${currentRep.status}". Laporan harus berstatus "Diverifikasi" sebelum disetujui.`
        );
      }

      // Segregation of Duties: Site supervisor who drafted cannot approve
      const supervisorUid = currentRep.siteSupervisorUid || currentRep.createdBy;
      if (supervisorUid && supervisorUid === actor.uid) {
        throw new Error(
          'Segregation of Duties (SoD) Dilanggar: Pengawas yang menyusun laporan tidak boleh menyetujui laporannya sendiri.'
        );
      }

      tx.update(repRef, {
        status: 'Disetujui',
        approvedBy: actor.name,
        approvedByUid: actor.uid,
        approvedAt: now,
        updatedAt: now,
        updatedBy: actor.uid,
      });

      recordAuditAndNotificationInTx(tx, actor, {
        action: 'FIELD_REPORT_APPROVED',
        recordType: 'field_report',
        recordId: reportId,
        details: `Menyetujui secara definitif Laporan Harian ${currentRep.reportNumber}`,
        projectId: currentRep.projectId,
        projectName: currentRep.projectName,
        previousValue: currentRep.status,
        newValue: 'Disetujui',
        notification: {
          title: 'Laporan Harian Disetujui',
          message: `${currentRep.reportNumber} telah disetujui resmi oleh ${actor.name}.`,
          type: 'success',
          targetScreen: 'field-reports',
          targetRoles: ['Site Manager / Supervisor', 'Project Manager', 'Read-only Auditor'],
        },
      });

      const response: WorkflowResponse = {
        success: true,
        message: `Laporan Harian ${currentRep.reportNumber} resmi disetujui.`,
        data: { reportId, status: 'Disetujui' },
      };

      saveIdempotencyInTx(tx, wsId, idempotencyKey, response, now);

      return response;
    }

    // 3. Revise (Minta Revisi: Diverifikasi / Draft -> Perlu Revisi)
    if (action === 'revise') {
      if (!hasApprovalAuthority(actor.role, 'fieldReport')) {
        throw new Error(`Peran "${actor.role}" tidak berwenang mengembalikan laporan untuk revisi.`);
      }

      if (!reviewerNotes || !reviewerNotes.trim()) {
        throw new Error('Catatan instruksi perbaikan (alasan revisi) wajib disertakan.');
      }

      tx.update(repRef, {
        status: 'Perlu Revisi',
        reviewerNotes: reviewerNotes.trim(),
        reviewedBy: actor.name,
        reviewedByUid: actor.uid,
        reviewedAt: now,
        updatedAt: now,
        updatedBy: actor.uid,
      });

      recordAuditAndNotificationInTx(tx, actor, {
        action: 'FIELD_REPORT_SUBMITTED',
        recordType: 'field_report',
        recordId: reportId,
        details: `Mengembalikan Laporan ${currentRep.reportNumber} untuk perbaikan. Catatan: ${reviewerNotes.trim()}`,
        projectId: currentRep.projectId,
        projectName: currentRep.projectName,
        previousValue: currentRep.status,
        newValue: 'Perlu Revisi',
        metadata: { reviewerNotes: reviewerNotes.trim() },
        notification: {
          title: 'Laporan Harian Memerlukan Revisi',
          message: `${currentRep.reportNumber} dikembalikan oleh ${actor.name}: "${reviewerNotes.trim()}".`,
          type: 'warning',
          targetScreen: 'field-reports',
          targetRoles: ['Site Manager / Supervisor'],
        },
      });

      const response: WorkflowResponse = {
        success: true,
        message: `Laporan Harian ${currentRep.reportNumber} dikembalikan dengan status Perlu Revisi.`,
        data: { reportId, status: 'Perlu Revisi', reviewerNotes: reviewerNotes.trim() },
      };

      saveIdempotencyInTx(tx, wsId, idempotencyKey, response, now);

      return response;
    }

    throw new Error(`Aksi "${action}" tidak didukung.`);
  });
}
