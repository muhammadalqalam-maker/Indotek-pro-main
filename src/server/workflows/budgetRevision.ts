/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrustedActor } from '../auth';
import { hasApprovalAuthority, isUserAssignedToProject } from '../../lib/rbac';
import {
  adminDb,
  getTenantCollection,
  getProjectSubcollection,
  checkIdempotency,
  saveIdempotencyInTx,
  generateTransactionalDocNumber,
  recordAuditAndNotificationInTx,
  WorkflowResponse,
} from './common';

export async function handleBudgetRevisionAction(
  actor: TrustedActor,
  payload: {
    action: 'create' | 'approve' | 'reject';
    revId?: string;
    rejectionReason?: string;
    revData?: any;
    idempotencyKey?: string;
  }
): Promise<WorkflowResponse> {
  const { action, revId, rejectionReason, revData, idempotencyKey } = payload;
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
      if (!revData || !revData.projectId) {
        throw new Error('Data Revisi Anggaran tidak lengkap: projectId wajib diisi.');
      }

      if (!isUserAssignedToProject(actor.role, actor.assignedProjectIds, revData.projectId)) {
        throw new Error(`Akses ditolak: Anda tidak ditugaskan pada proyek "${revData.projectId}".`);
      }

      const id = revData.id || `rev-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      const docRef = getTenantCollection(wsId, 'budget_revisions').doc(id);

      const revisionNumber = await generateTransactionalDocNumber(
        tx,
        'ADD-REV',
        revData.projectName || 'IND',
        wsId
      );

      const orig = Math.round(Number(revData.originalAmount) || 0);
      const prop = Math.round(Number(revData.proposedAmount) || 0);
      const variance = prop - orig;
      const now = new Date().toISOString();

      const newRecord = {
        ...revData,
        id,
        revisionNumber,
        originalAmount: orig,
        proposedAmount: prop,
        varianceAmount: variance,
        status: 'Menunggu',
        submittedBy: actor.name,
        submittedByUid: actor.uid,
        createdBy: actor.uid,
        updatedBy: actor.uid,
        workspaceId: wsId,
        schemaVersion: 2,
        createdAt: now,
        updatedAt: now,
      };

      tx.set(docRef, newRecord);

      recordAuditAndNotificationInTx(tx, actor, {
        action: 'BUDGET_REVISED',
        recordType: 'budget',
        recordId: id,
        details: `Mengajukan Addendum Revisi Anggaran ${revisionNumber} (+Rp ${variance.toLocaleString('id-ID')})`,
        projectId: newRecord.projectId,
        projectName: newRecord.projectName,
        previousValue: 'None',
        newValue: 'Menunggu',
        notification: {
          title: 'Pengajuan Addendum Anggaran Baru',
          message: `${revisionNumber} diajukan oleh ${actor.name} (+Rp ${variance.toLocaleString('id-ID')}).`,
          type: 'info',
          targetScreen: 'budget',
          targetRoles: ['Owner / Director', 'Finance / Accounting'],
        },
      });

      const response: WorkflowResponse = {
        success: true,
        message: `Revisi Anggaran ${revisionNumber} berhasil diajukan.`,
        data: { id, revisionNumber, status: 'Menunggu' },
      };

      saveIdempotencyInTx(tx, wsId, idempotencyKey, response, now);

      return response;
    }

    // ----------------- ACTION: APPROVE / REJECT -----------------
    if (!revId) throw new Error('ID Revisi Anggaran wajib disertakan.');
    const revRef = getTenantCollection(wsId, 'budget_revisions').doc(revId);
    const revSnap = await tx.get(revRef);
    if (!revSnap.exists) {
      throw new Error(`Revisi Anggaran ${revId} tidak ditemukan.`);
    }

    const currentRev = revSnap.data()!;

    if (!isUserAssignedToProject(actor.role, actor.assignedProjectIds, currentRev.projectId)) {
      throw new Error(`Akses ditolak: Anda tidak ditugaskan pada proyek "${currentRev.projectId}".`);
    }

    if (!hasApprovalAuthority(actor.role, 'budgetRevision')) {
      throw new Error(
        `Peran "${actor.role}" tidak memiliki wewenang persetujuan revisi anggaran. Diperlukan Owner / Director atau Finance / Accounting.`
      );
    }

    if (currentRev.status !== 'Menunggu') {
      throw new Error(
        `Transisi status tidak valid: Dokumen berstatus "${currentRev.status}". Hanya status "Menunggu" yang dapat diproses.`
      );
    }

    const now = new Date().toISOString();

    if (action === 'approve') {
      const creatorUid = currentRev.submittedByUid || currentRev.createdBy;
      if (creatorUid && creatorUid === actor.uid) {
        throw new Error(
          'Segregation of Duties (SoD) Dilanggar: Pembuat/Pengaju revisi tidak boleh menyetujui addendum sendiri.'
        );
      }

      // 1. Update Project approvedBudget in workspaces/{wsId}/projects/{pid}
      const projectRef = getTenantCollection(wsId, 'projects').doc(currentRev.projectId);
      const projectSnap = await tx.get(projectRef);
      let oldProjectBudget = 0;
      let newProjectBudget = 0;

      if (projectSnap.exists) {
        const pData = projectSnap.data()!;
        oldProjectBudget = Math.round(Number(pData.approvedBudget) || 0);
        const variance = Math.round(Number(currentRev.varianceAmount) || 0);
        newProjectBudget = oldProjectBudget + variance;

        tx.update(projectRef, {
          approvedBudget: newProjectBudget,
          updatedAt: now,
          updatedBy: actor.uid,
        });
      }

      // 2. Update matching Budget Line in workspaces/{wsId}/projects/{pid}/budget_lines
      const budgetLinesCol = getProjectSubcollection(wsId, currentRev.projectId, 'budget_lines');
      const budgetLinesQuery = await budgetLinesCol
        .where('divisionName', '==', currentRev.divisionName)
        .limit(1)
        .get();

      let oldLineAmount = Math.round(Number(currentRev.originalAmount) || 0);
      let newLineAmount = Math.round(Number(currentRev.proposedAmount) || 0);

      if (!budgetLinesQuery.empty) {
        const lineDoc = budgetLinesQuery.docs[0];
        const lineData = lineDoc.data();
        oldLineAmount = Math.round(Number(lineData.plannedAmount) || 0);
        newLineAmount = Math.round(Number(currentRev.proposedAmount) || 0);

        tx.update(lineDoc.ref, {
          plannedAmount: newLineAmount,
          updatedAt: now,
          updatedBy: actor.uid,
        });
      }

      // 3. Update Revision status
      tx.update(revRef, {
        status: 'Disetujui',
        reviewedBy: actor.name,
        reviewedByUid: actor.uid,
        reviewedAt: now,
        updatedAt: now,
        updatedBy: actor.uid,
      });

      // 4. Record Audit Log storing before & after values
      recordAuditAndNotificationInTx(tx, actor, {
        action: 'BUDGET_APPROVED',
        recordType: 'budget',
        recordId: revId,
        details: `Menyetujui Addendum Revisi Anggaran ${currentRev.revisionNumber} (${currentRev.divisionName}): Nilai pagu berubah dari Rp ${oldProjectBudget.toLocaleString('id-ID')} menjadi Rp ${newProjectBudget.toLocaleString('id-ID')}`,
        projectId: currentRev.projectId,
        projectName: currentRev.projectName,
        previousValue: `Pagu: ${oldProjectBudget}`,
        newValue: `Pagu: ${newProjectBudget}`,
        metadata: {
          lineDivision: currentRev.divisionName,
          lineOldAmount: oldLineAmount,
          lineNewAmount: newLineAmount,
        },
        notification: {
          title: 'Addendum Anggaran Disetujui',
          message: `${currentRev.revisionNumber} telah disetujui oleh ${actor.name}. Pagu proyek kini Rp ${newProjectBudget.toLocaleString('id-ID')}.`,
          type: 'success',
          targetScreen: 'budget',
          targetRoles: ['Owner / Director', 'Project Manager', 'Quantity Surveyor / Estimator', 'Finance / Accounting'],
        },
      });

      const response: WorkflowResponse = {
        success: true,
        message: `Addendum ${currentRev.revisionNumber} berhasil disetujui. Pagu anggaran diperbarui.`,
        data: { revId, status: 'Disetujui', oldProjectBudget, newProjectBudget },
      };

      saveIdempotencyInTx(tx, wsId, idempotencyKey, response, now);

      return response;
    }

    if (action === 'reject') {
      if (!rejectionReason || !rejectionReason.trim()) {
        throw new Error('Alasan penolakan revisi anggaran wajib disertakan.');
      }

      tx.update(revRef, {
        status: 'Ditolak',
        reviewedBy: actor.name,
        reviewedByUid: actor.uid,
        reviewedAt: now,
        rejectionReason: rejectionReason.trim(),
        updatedAt: now,
        updatedBy: actor.uid,
      });

      recordAuditAndNotificationInTx(tx, actor, {
        action: 'BUDGET_REJECTED',
        recordType: 'budget',
        recordId: revId,
        details: `Menolak Addendum Revisi Anggaran ${currentRev.revisionNumber}. Alasan: ${rejectionReason.trim()}`,
        projectId: currentRev.projectId,
        projectName: currentRev.projectName,
        previousValue: currentRev.status,
        newValue: 'Ditolak',
        metadata: { rejectionReason: rejectionReason.trim() },
        notification: {
          title: 'Addendum Anggaran Ditolak',
          message: `${currentRev.revisionNumber} ditolak oleh ${actor.name}. Alasan: "${rejectionReason.trim()}".`,
          type: 'warning',
          targetScreen: 'budget',
          targetRoles: ['Project Manager', 'Quantity Surveyor / Estimator'],
        },
      });

      const response: WorkflowResponse = {
        success: true,
        message: `Revisi Anggaran ${currentRev.revisionNumber} berhasil ditolak.`,
        data: { revId, status: 'Ditolak', rejectionReason: rejectionReason.trim() },
      };

      saveIdempotencyInTx(tx, wsId, idempotencyKey, response, now);

      return response;
    }

    throw new Error(`Aksi "${action}" tidak didukung.`);
  });
}
