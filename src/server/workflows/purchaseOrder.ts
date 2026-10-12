/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrustedActor } from '../auth';
import { hasApprovalAuthority, isUserAssignedToProject } from '../../lib/rbac';
import {
  adminDb,
  getTenantCollection,
  checkIdempotency,
  saveIdempotencyInTx,
  generateTransactionalDocNumber,
  recordAuditAndNotificationInTx,
  WorkflowResponse,
} from './common';

export async function handlePurchaseOrderAction(
  actor: TrustedActor,
  payload: {
    action: 'create' | 'approve' | 'reject';
    poId?: string;
    rejectionReason?: string;
    poData?: any;
    idempotencyKey?: string;
  }
): Promise<WorkflowResponse> {
  const { action, poId, rejectionReason, poData, idempotencyKey } = payload;
  const wsId = actor.workspaceId;

  if (idempotencyKey) {
    const cached = await checkIdempotency(wsId, idempotencyKey);
    if (cached) return { ...cached, idempotentReplay: true };
  }

  return await adminDb.runTransaction(async (tx) => {
    // Check idempotency inside transaction for strict race condition isolation
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
      if (!poData || !poData.projectId) {
        throw new Error('Data PO tidak valid: projectId wajib diisi.');
      }

      if (!isUserAssignedToProject(actor.role, actor.assignedProjectIds, poData.projectId)) {
        throw new Error(`Akses ditolak: Anda tidak ditugaskan pada proyek "${poData.projectId}".`);
      }

      const id = poData.id || `po-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      const docRef = getTenantCollection(wsId, 'purchase_orders').doc(id);
      const existingSnap = await tx.get(docRef);
      if (existingSnap.exists) {
        throw new Error(`PO dengan ID ${id} sudah ada.`);
      }

      const poNumber = await generateTransactionalDocNumber(
        tx,
        'PO',
        poData.projectName || 'IND',
        wsId
      );

      const sppNumber = poData.sppNumber || `SPP-2026-${poNumber.split('-').pop()}`;
      const now = new Date().toISOString();
      const totalCostInt = Math.round(Number(poData.totalCost || 0));

      const newRecord = {
        ...poData,
        id,
        poNumber,
        sppNumber,
        totalCost: totalCostInt,
        status: 'Menunggu',
        requester: actor.name,
        requesterUid: actor.uid,
        createdBy: actor.uid,
        updatedBy: actor.uid,
        workspaceId: wsId,
        schemaVersion: 2,
        createdAt: now,
        updatedAt: now,
      };

      tx.set(docRef, newRecord);

      recordAuditAndNotificationInTx(tx, actor, {
        action: 'PO_CREATED',
        recordType: 'purchase_order',
        recordId: id,
        details: `Membuat Purchase Order baru ${poNumber} senilai Rp ${totalCostInt.toLocaleString('id-ID')}`,
        projectId: newRecord.projectId,
        projectName: newRecord.projectName,
        previousValue: 'None',
        newValue: 'Menunggu',
        notification: {
          title: 'Pengajuan PO Baru Menunggu Persetujuan',
          message: `${poNumber} (${newRecord.itemDescription || 'Pengadaan'}) senilai Rp ${totalCostInt.toLocaleString('id-ID')} diajukan oleh ${actor.name}.`,
          type: 'info',
          targetScreen: 'procurement',
          targetRoles: ['Owner / Director', 'Project Manager', 'Finance / Accounting'],
        },
      });

      const response: WorkflowResponse = {
        success: true,
        message: `PO ${poNumber} berhasil diajukan untuk otorisasi.`,
        data: { id, poNumber, status: 'Menunggu' },
      };

      saveIdempotencyInTx(tx, wsId, idempotencyKey, response, now);

      return response;
    }

    // ----------------- ACTION: APPROVE / REJECT -----------------
    if (!poId) throw new Error('ID Purchase Order wajib disertakan.');
    const poRef = getTenantCollection(wsId, 'purchase_orders').doc(poId);
    const poSnap = await tx.get(poRef);
    if (!poSnap.exists) {
      throw new Error(`Purchase Order ${poId} tidak ditemukan.`);
    }

    const currentPO = poSnap.data()!;

    // Verify Project assignment
    if (!isUserAssignedToProject(actor.role, actor.assignedProjectIds, currentPO.projectId)) {
      throw new Error(`Akses ditolak: Anda tidak ditugaskan pada proyek "${currentPO.projectId}".`);
    }

    // Verify Authority
    if (!hasApprovalAuthority(actor.role, 'purchaseOrder')) {
      throw new Error(
        `Peran "${actor.role}" tidak memiliki hak persetujuan PO. Diperlukan Owner / Director, Finance / Accounting, atau Project Manager.`
      );
    }

    // State machine check
    if (currentPO.status !== 'Menunggu') {
      throw new Error(
        `Transisi status tidak valid: Dokumen berstatus "${currentPO.status}". Hanya status "Menunggu" yang dapat diproses.`
      );
    }

    const now = new Date().toISOString();

    // Segregation of Duties check: Maker cannot approve own document
    if (action === 'approve') {
      const creatorUid = currentPO.requesterUid || currentPO.createdBy;
      if (creatorUid && creatorUid === actor.uid) {
        throw new Error(
          'Segregation of Duties (SoD) Dilanggar: Pembuat/Pemohon dokumen tidak boleh menyetujui dokumen sendiri.'
        );
      }

      // Check project budget headroom in workspaces/{wsId}/projects/{pid}
      const projectRef = getTenantCollection(wsId, 'projects').doc(currentPO.projectId);
      const projectSnap = await tx.get(projectRef);
      if (projectSnap.exists) {
        const projectData = projectSnap.data()!;
        const approvedBudget = Math.round(Number(projectData.approvedBudget) || 0);
        const actualCost = Math.round(Number(projectData.actualCost) || 0);
        const poCost = Math.round(Number(currentPO.totalCost) || 0);

        if (approvedBudget > 0 && actualCost + poCost > approvedBudget) {
          const sisaPagu = Math.max(0, approvedBudget - actualCost);
          throw new Error(
            `Pengeluaran PO sebesar Rp ${poCost.toLocaleString('id-ID')} melebihi sisa anggaran proyek (Sisa pagu: Rp ${sisaPagu.toLocaleString('id-ID')}, Anggaran: Rp ${approvedBudget.toLocaleString('id-ID')}). Ajukan revisi anggaran terlebih dahulu.`
          );
        }
      }

      tx.update(poRef, {
        status: 'Disetujui',
        approvedBy: actor.name,
        approvedByUid: actor.uid,
        approvedAt: now,
        updatedAt: now,
        updatedBy: actor.uid,
      });

      recordAuditAndNotificationInTx(tx, actor, {
        action: 'PO_APPROVED',
        recordType: 'purchase_order',
        recordId: poId,
        details: `Menyetujui Purchase Order ${currentPO.poNumber} senilai Rp ${Number(currentPO.totalCost || 0).toLocaleString('id-ID')}`,
        projectId: currentPO.projectId,
        projectName: currentPO.projectName,
        previousValue: currentPO.status,
        newValue: 'Disetujui',
        notification: {
          title: 'Purchase Order Disetujui',
          message: `${currentPO.poNumber} senilai Rp ${Number(currentPO.totalCost || 0).toLocaleString('id-ID')} disetujui oleh ${actor.name}.`,
          type: 'success',
          targetScreen: 'procurement',
          targetRoles: ['Procurement', 'Project Manager', 'Warehouse / Inventory'],
        },
      });

      const response: WorkflowResponse = {
        success: true,
        message: `PO ${currentPO.poNumber} berhasil disetujui.`,
        data: { poId, status: 'Disetujui', approvedBy: actor.name },
      };

      saveIdempotencyInTx(tx, wsId, idempotencyKey, response, now);

      return response;
    }

    if (action === 'reject') {
      if (!rejectionReason || !rejectionReason.trim()) {
        throw new Error('Alasan penolakan PO wajib disertakan.');
      }

      tx.update(poRef, {
        status: 'Ditolak',
        rejectedBy: actor.name,
        rejectedByUid: actor.uid,
        rejectedAt: now,
        rejectionReason: rejectionReason.trim(),
        updatedAt: now,
        updatedBy: actor.uid,
      });

      recordAuditAndNotificationInTx(tx, actor, {
        action: 'PO_REJECTED',
        recordType: 'purchase_order',
        recordId: poId,
        details: `Menolak Purchase Order ${currentPO.poNumber}. Alasan: ${rejectionReason.trim()}`,
        projectId: currentPO.projectId,
        projectName: currentPO.projectName,
        previousValue: currentPO.status,
        newValue: 'Ditolak',
        metadata: { rejectionReason: rejectionReason.trim() },
        notification: {
          title: 'Purchase Order Ditolak',
          message: `${currentPO.poNumber} ditolak oleh ${actor.name}. Alasan: "${rejectionReason.trim()}".`,
          type: 'warning',
          targetScreen: 'procurement',
          targetRoles: ['Procurement', 'Project Manager'],
        },
      });

      const response: WorkflowResponse = {
        success: true,
        message: `PO ${currentPO.poNumber} berhasil ditolak.`,
        data: { poId, status: 'Ditolak', rejectionReason: rejectionReason.trim() },
      };

      saveIdempotencyInTx(tx, wsId, idempotencyKey, response, now);

      return response;
    }

    throw new Error(`Aksi "${action}" tidak didukung.`);
  });
}
