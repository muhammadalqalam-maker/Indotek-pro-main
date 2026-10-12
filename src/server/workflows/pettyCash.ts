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

export async function handlePettyCashAction(
  actor: TrustedActor,
  payload: {
    action: 'create' | 'approve' | 'reject' | 'disburse';
    cashId?: string;
    rejectionReason?: string;
    cashData?: any;
    idempotencyKey?: string;
  }
): Promise<WorkflowResponse> {
  const { action, cashId, rejectionReason, cashData, idempotencyKey } = payload;
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
      if (!cashData || !cashData.projectId) {
        throw new Error('Data Kas Kecil tidak lengkap: projectId wajib diisi.');
      }

      const id = cashData.id || `kas-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      const docRef = getTenantCollection(wsId, 'petty_cash').doc(id);

      const pettyCashNo = await generateTransactionalDocNumber(
        tx,
        'KAS',
        cashData.projectName || 'IND',
        wsId
      );

      const now = new Date().toISOString();
      const amountInt = Math.round(Number(cashData.amount) || 0);

      const newRecord = {
        ...cashData,
        id,
        pettyCashNo,
        amount: amountInt,
        status: 'Menunggu',
        requester: actor.name,
        requesterUid: actor.uid,
        createdBy: actor.uid,
        updatedBy: actor.uid,
        workspaceId: wsId,
        schemaVersion: 2,
        submittedAt: now,
        createdAt: now,
        updatedAt: now,
      };

      tx.set(docRef, newRecord);

      recordAuditAndNotificationInTx(tx, actor, {
        action: 'PETTY_CASH_SUBMITTED',
        recordType: 'petty_cash',
        recordId: id,
        details: `Mengajukan Kas Kecil ${pettyCashNo} (${newRecord.category}) senilai Rp ${amountInt.toLocaleString('id-ID')}`,
        projectId: newRecord.projectId,
        projectName: newRecord.projectName,
        previousValue: 'None',
        newValue: 'Menunggu',
        notification: {
          title: 'Pengajuan Kas Kecil Menunggu Verifikasi',
          message: `${pettyCashNo} diajukan oleh ${actor.name} senilai Rp ${amountInt.toLocaleString('id-ID')}.`,
          type: 'info',
          targetScreen: 'budget',
          targetRoles: ['Finance / Accounting', 'Owner / Director'],
        },
      });

      const response: WorkflowResponse = {
        success: true,
        message: `Pengajuan Kas Kecil ${pettyCashNo} berhasil diajukan.`,
        data: { id, pettyCashNo, status: 'Menunggu' },
      };

      saveIdempotencyInTx(tx, wsId, idempotencyKey, response, now);

      return response;
    }

    // ----------------- ACTION: APPROVE / REJECT / DISBURSE -----------------
    if (!cashId) throw new Error('ID Kas Kecil wajib disertakan.');
    const cashRef = getTenantCollection(wsId, 'petty_cash').doc(cashId);
    const cashSnap = await tx.get(cashRef);
    if (!cashSnap.exists) {
      throw new Error(`Dokumen Kas Kecil ${cashId} tidak ditemukan.`);
    }

    const currentCash = cashSnap.data()!;
    const now = new Date().toISOString();

    if (action === 'approve') {
      if (!hasApprovalAuthority(actor.role, 'pettyCash')) {
        throw new Error(
          `Peran "${actor.role}" tidak berwenang menyetujui kas kecil. Diperlukan Finance / Accounting atau Owner / Director.`
        );
      }

      if (currentCash.status !== 'Menunggu') {
        throw new Error(
          `Transisi status tidak valid: Dokumen berstatus "${currentCash.status}". Hanya status "Menunggu" yang dapat disetujui.`
        );
      }

      const creatorUid = currentCash.requesterUid || currentCash.createdBy;
      if (creatorUid && creatorUid === actor.uid) {
        throw new Error(
          'Segregation of Duties (SoD) Dilanggar: Pemohon kas kecil tidak boleh menyetujui pengajuannya sendiri.'
        );
      }

      tx.update(cashRef, {
        status: 'Disetujui',
        reviewedBy: actor.name,
        reviewedByUid: actor.uid,
        reviewedAt: now,
        updatedAt: now,
        updatedBy: actor.uid,
      });

      recordAuditAndNotificationInTx(tx, actor, {
        action: 'PETTY_CASH_APPROVED',
        recordType: 'petty_cash',
        recordId: cashId,
        details: `Menyetujui Kas Kecil ${currentCash.pettyCashNo} senilai Rp ${Number(currentCash.amount).toLocaleString('id-ID')}`,
        projectId: currentCash.projectId,
        projectName: currentCash.projectName,
        previousValue: currentCash.status,
        newValue: 'Disetujui',
        notification: {
          title: 'Kas Kecil Disetujui',
          message: `${currentCash.pettyCashNo} disetujui oleh ${actor.name}. Siap untuk dicairkan.`,
          type: 'success',
          targetScreen: 'budget',
          targetRoles: ['Finance / Accounting', 'Project Manager'],
        },
      });

      const response: WorkflowResponse = {
        success: true,
        message: `Kas Kecil ${currentCash.pettyCashNo} berhasil disetujui.`,
        data: { cashId, status: 'Disetujui' },
      };

      saveIdempotencyInTx(tx, wsId, idempotencyKey, response, now);

      return response;
    }

    if (action === 'reject') {
      if (!hasApprovalAuthority(actor.role, 'pettyCash')) {
        throw new Error(`Peran "${actor.role}" tidak berwenang menolak kas kecil.`);
      }

      if (currentCash.status !== 'Menunggu') {
        throw new Error(
          `Transisi status tidak valid: Dokumen berstatus "${currentCash.status}". Hanya status "Menunggu" yang dapat ditolak.`
        );
      }

      if (!rejectionReason || !rejectionReason.trim()) {
        throw new Error('Alasan penolakan kas kecil wajib disertakan.');
      }

      tx.update(cashRef, {
        status: 'Ditolak',
        reviewedBy: actor.name,
        reviewedByUid: actor.uid,
        reviewedAt: now,
        rejectionReason: rejectionReason.trim(),
        updatedAt: now,
        updatedBy: actor.uid,
      });

      recordAuditAndNotificationInTx(tx, actor, {
        action: 'PETTY_CASH_REJECTED',
        recordType: 'petty_cash',
        recordId: cashId,
        details: `Menolak Kas Kecil ${currentCash.pettyCashNo}. Alasan: ${rejectionReason.trim()}`,
        projectId: currentCash.projectId,
        projectName: currentCash.projectName,
        previousValue: currentCash.status,
        newValue: 'Ditolak',
        metadata: { rejectionReason: rejectionReason.trim() },
        notification: {
          title: 'Kas Kecil Ditolak',
          message: `${currentCash.pettyCashNo} ditolak oleh ${actor.name}. Alasan: "${rejectionReason.trim()}".`,
          type: 'warning',
          targetScreen: 'budget',
          targetRoles: ['Project Manager', 'Site Manager / Supervisor'],
        },
      });

      const response: WorkflowResponse = {
        success: true,
        message: `Kas Kecil ${currentCash.pettyCashNo} berhasil ditolak.`,
        data: { cashId, status: 'Ditolak', rejectionReason: rejectionReason.trim() },
      };

      saveIdempotencyInTx(tx, wsId, idempotencyKey, response, now);

      return response;
    }

    if (action === 'disburse') {
      if (actor.role !== 'Finance / Accounting' && actor.role !== 'Owner / Director') {
        throw new Error('Pencairan dana kas kecil hanya dapat dieksekusi oleh Divisi Keuangan atau Direksi.');
      }

      if (currentCash.status !== 'Disetujui') {
        throw new Error(
          `Transisi status tidak valid: Kas kecil berstatus "${currentCash.status}". Hanya dokumen yang telah disetujui ("Disetujui") yang dapat dicairkan.`
        );
      }

      tx.update(cashRef, {
        status: 'Dicairkan',
        disbursedBy: actor.name,
        disbursedByUid: actor.uid,
        disbursedAt: now,
        updatedAt: now,
        updatedBy: actor.uid,
      });

      recordAuditAndNotificationInTx(tx, actor, {
        action: 'PETTY_CASH_DISBURSED',
        recordType: 'petty_cash',
        recordId: cashId,
        details: `Mencairkan dana Kas Kecil ${currentCash.pettyCashNo} senilai Rp ${Number(currentCash.amount).toLocaleString('id-ID')}`,
        projectId: currentCash.projectId,
        projectName: currentCash.projectName,
        previousValue: currentCash.status,
        newValue: 'Dicairkan',
        notification: {
          title: 'Dana Kas Kecil Telah Dicairkan',
          message: `Dana ${currentCash.pettyCashNo} senilai Rp ${Number(currentCash.amount).toLocaleString('id-ID')} telah dicairkan oleh ${actor.name}.`,
          type: 'success',
          targetScreen: 'budget',
          targetRoles: ['Project Manager', 'Site Manager / Supervisor'],
        },
      });

      const response: WorkflowResponse = {
        success: true,
        message: `Dana Kas Kecil ${currentCash.pettyCashNo} berhasil dicairkan.`,
        data: { cashId, status: 'Dicairkan' },
      };

      saveIdempotencyInTx(tx, wsId, idempotencyKey, response, now);

      return response;
    }

    throw new Error(`Aksi "${action}" tidak didukung.`);
  });
}
