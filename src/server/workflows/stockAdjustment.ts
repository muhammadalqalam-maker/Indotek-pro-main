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

export async function handleStockAdjustmentAction(
  actor: TrustedActor,
  payload: {
    action: 'create' | 'approve' | 'reject';
    adjId?: string;
    rejectionReason?: string;
    adjData?: any;
    idempotencyKey?: string;
  }
): Promise<WorkflowResponse> {
  const { action, adjId, rejectionReason, adjData, idempotencyKey } = payload;
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
      if (!adjData || !adjData.materialId) {
        throw new Error('Data Penyesuaian Stok tidak lengkap: materialId wajib diisi.');
      }

      const id = adjData.id || `adj-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      const docRef = getTenantCollection(wsId, 'stock_adjustments').doc(id);

      const adjustmentNo = await generateTransactionalDocNumber(
        tx,
        'ADJ',
        adjData.projectName || 'IND',
        wsId
      );

      const now = new Date().toISOString();
      const prevStock = Math.round(Number(adjData.previousStock || 0));
      const physStock = Math.round(Number(adjData.physicalStock || 0));
      const varQty = Math.round(Number(adjData.varianceQuantity || physStock - prevStock));

      const newRecord = {
        ...adjData,
        id,
        adjustmentNo,
        previousStock: prevStock,
        physicalStock: physStock,
        varianceQuantity: varQty,
        status: 'Menunggu',
        submittedBy: actor.name,
        submittedByUid: actor.uid,
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
        action: 'STOCK_ADJUSTMENT_SUBMITTED',
        recordType: 'material',
        recordId: id,
        details: `Mengajukan Berita Acara Opname Stok ${adjustmentNo} untuk material ${adjData.materialName} (Selisih: ${varQty} ${adjData.unit})`,
        projectId: newRecord.projectId,
        projectName: newRecord.projectName,
        previousValue: 'None',
        newValue: 'Menunggu',
        notification: {
          title: 'Pengajuan Penyesuaian Stok Opname',
          message: `${adjustmentNo} diajukan oleh ${actor.name} (${adjData.materialName}).`,
          type: 'info',
          targetScreen: 'materials',
          targetRoles: ['Warehouse / Inventory', 'Project Manager', 'Owner / Director'],
        },
      });

      const response: WorkflowResponse = {
        success: true,
        message: `Penyesuaian stok ${adjustmentNo} berhasil diajukan.`,
        data: { id, adjustmentNo, status: 'Menunggu' },
      };

      saveIdempotencyInTx(tx, wsId, idempotencyKey, response, now);

      return response;
    }

    // ----------------- ACTION: APPROVE / REJECT -----------------
    if (!adjId) throw new Error('ID Penyesuaian Stok wajib disertakan.');
    const adjRef = getTenantCollection(wsId, 'stock_adjustments').doc(adjId);
    const adjSnap = await tx.get(adjRef);
    if (!adjSnap.exists) {
      throw new Error(`Penyesuaian stok ${adjId} tidak ditemukan.`);
    }

    const currentAdj = adjSnap.data()!;

    if (!hasApprovalAuthority(actor.role, 'stockAdjustment')) {
      throw new Error(
        `Peran "${actor.role}" tidak memiliki hak persetujuan penyesuaian stok. Diperlukan Warehouse / Inventory, Project Manager, atau Owner.`
      );
    }

    if (currentAdj.status !== 'Menunggu') {
      throw new Error(
        `Transisi status tidak valid: Dokumen berstatus "${currentAdj.status}". Hanya status "Menunggu" yang dapat diproses.`
      );
    }

    const now = new Date().toISOString();

    if (action === 'approve') {
      const creatorUid = currentAdj.submittedByUid || currentAdj.createdBy;
      if (creatorUid && creatorUid === actor.uid) {
        throw new Error(
          'Segregation of Duties (SoD) Dilanggar: Pembuat berita acara opname tidak boleh menyetujui penyesuaian sendiri.'
        );
      }

      // 1. Read & Update target Material in workspaces/{wsId}/materials
      const matRef = getTenantCollection(wsId, 'materials').doc(currentAdj.materialId);
      const matSnap = await tx.get(matRef);
      if (!matSnap.exists) {
        throw new Error(`Material ${currentAdj.materialId} tidak ditemukan.`);
      }

      const matData = matSnap.data()!;
      const oldStock = Math.round(Number(matData.currentStock) || 0);
      const newStock = Math.round(Number(currentAdj.physicalStock));
      if (isNaN(newStock) || newStock < 0) {
        throw new Error('Kuantitas stok fisik tidak boleh negatif.');
      }

      const minStock = Math.round(Number(matData.minStock) || 0);
      const newStatus =
        newStock <= minStock * 0.5 ? 'Kritis' : newStock <= minStock ? 'Menipis' : 'Aman';

      tx.update(matRef, {
        currentStock: newStock,
        status: newStatus,
        updatedAt: now,
        updatedBy: actor.uid,
      });

      // 2. Record automatic stock mutation entry
      const mutId = `mut-adj-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      const mutRef = getTenantCollection(wsId, 'stock_mutations').doc(mutId);
      const variance = Math.round(Number(currentAdj.varianceQuantity) || 0);

      tx.set(mutRef, {
        id: mutId,
        materialId: currentAdj.materialId,
        materialName: currentAdj.materialName,
        date: now,
        type: variance >= 0 ? 'Masuk' : 'Keluar',
        quantity: Math.abs(variance),
        unit: currentAdj.unit,
        referenceNo: currentAdj.adjustmentNo,
        project: currentAdj.projectName || 'Gudang Utama',
        handler: actor.name,
        createdBy: actor.uid,
        updatedBy: actor.uid,
        workspaceId: wsId,
        schemaVersion: 2,
        createdAt: now,
        updatedAt: now,
      });

      // 3. Update adjustment record
      tx.update(adjRef, {
        status: 'Disetujui',
        reviewedBy: actor.name,
        reviewedByUid: actor.uid,
        reviewedAt: now,
        updatedAt: now,
        updatedBy: actor.uid,
      });

      // 4. Record audit log
      recordAuditAndNotificationInTx(tx, actor, {
        action: 'STOCK_ADJUSTMENT_APPROVED',
        recordType: 'material',
        recordId: adjId,
        details: `Menyetujui Opname Stok ${currentAdj.adjustmentNo}: Stok ${currentAdj.materialName} diperbarui dari ${oldStock} menjadi ${newStock} ${currentAdj.unit}`,
        projectId: currentAdj.projectId,
        projectName: currentAdj.projectName,
        previousValue: `Stok: ${oldStock}`,
        newValue: `Stok: ${newStock}`,
        metadata: {
          materialId: currentAdj.materialId,
          varianceQuantity: variance,
          mutationId: mutId,
        },
        notification: {
          title: 'Penyesuaian Stok Disetujui',
          message: `Stok fisik ${currentAdj.materialName} telah disesuaikan menjadi ${newStock} ${currentAdj.unit} oleh ${actor.name}.`,
          type: 'success',
          targetScreen: 'materials',
          targetRoles: ['Warehouse / Inventory', 'Project Manager', 'Site Manager / Supervisor'],
        },
      });

      const response: WorkflowResponse = {
        success: true,
        message: `Penyesuaian stok ${currentAdj.adjustmentNo} berhasil disetujui. Stok material kini ${newStock} ${currentAdj.unit}.`,
        data: { adjId, status: 'Disetujui', oldStock, newStock, newStatus },
      };

      saveIdempotencyInTx(tx, wsId, idempotencyKey, response, now);

      return response;
    }

    if (action === 'reject') {
      if (!rejectionReason || !rejectionReason.trim()) {
        throw new Error('Alasan penolakan penyesuaian stok wajib disertakan.');
      }

      tx.update(adjRef, {
        status: 'Ditolak',
        reviewedBy: actor.name,
        reviewedByUid: actor.uid,
        reviewedAt: now,
        rejectionReason: rejectionReason.trim(),
        updatedAt: now,
        updatedBy: actor.uid,
      });

      recordAuditAndNotificationInTx(tx, actor, {
        action: 'STOCK_ADJUSTMENT_REJECTED',
        recordType: 'material',
        recordId: adjId,
        details: `Menolak Opname Stok ${currentAdj.adjustmentNo}. Alasan: ${rejectionReason.trim()}`,
        projectId: currentAdj.projectId,
        projectName: currentAdj.projectName,
        previousValue: currentAdj.status,
        newValue: 'Ditolak',
        metadata: { rejectionReason: rejectionReason.trim() },
        notification: {
          title: 'Penyesuaian Stok Ditolak',
          message: `${currentAdj.adjustmentNo} ditolak oleh ${actor.name}. Alasan: "${rejectionReason.trim()}".`,
          type: 'warning',
          targetScreen: 'materials',
          targetRoles: ['Warehouse / Inventory', 'Site Manager / Supervisor'],
        },
      });

      const response: WorkflowResponse = {
        success: true,
        message: `Penyesuaian stok ${currentAdj.adjustmentNo} berhasil ditolak.`,
        data: { adjId, status: 'Ditolak', rejectionReason: rejectionReason.trim() },
      };

      saveIdempotencyInTx(tx, wsId, idempotencyKey, response, now);

      return response;
    }

    throw new Error(`Aksi "${action}" tidak didukung.`);
  });
}
