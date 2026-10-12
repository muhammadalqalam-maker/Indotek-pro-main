/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrustedActor } from '../auth';
import {
  adminDb,
  getTenantCollection,
  checkIdempotency,
  saveIdempotencyInTx,
  recordAuditAndNotificationInTx,
  WorkflowResponse,
} from './common';

export async function handleStockMutationAction(
  actor: TrustedActor,
  payload: {
    materialId: string;
    type: 'Masuk' | 'Keluar';
    quantity: number;
    referenceNo: string;
    project?: string;
    handler?: string;
    idempotencyKey?: string;
  }
): Promise<WorkflowResponse> {
  const { materialId, type, quantity, referenceNo, project, handler, idempotencyKey } = payload;
  const wsId = actor.workspaceId;

  if (!materialId || !quantity || quantity <= 0) {
    throw new Error('Data mutasi tidak valid: materialId dan quantity positif wajib diisi.');
  }

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

    const matRef = getTenantCollection(wsId, 'materials').doc(materialId);
    const matSnap = await tx.get(matRef);
    if (!matSnap.exists) {
      throw new Error(`Material ${materialId} tidak ditemukan.`);
    }

    const matData = matSnap.data()!;
    const currentStock = Math.round(Number(matData.currentStock) || 0);
    const minStock = Math.round(Number(matData.minStock) || 0);
    const qtyInt = Math.round(quantity);

    let newStock = currentStock;

    if (type === 'Keluar') {
      if (currentStock < qtyInt) {
        throw new Error(
          `Stok tidak mencukupi untuk pengeluaran: Stok saat ini ${currentStock} ${matData.unit}, diminta ${qtyInt} ${matData.unit}. Transaksi dibatalkan untuk mencegah stok negatif.`
        );
      }
      newStock = currentStock - qtyInt;
    } else {
      newStock = currentStock + qtyInt;
    }

    const newStatus =
      newStock <= minStock * 0.5 ? 'Kritis' : newStock <= minStock ? 'Menipis' : 'Aman';

    const now = new Date().toISOString();

    tx.update(matRef, {
      currentStock: newStock,
      status: newStatus,
      lastRestocked: type === 'Masuk' ? now : matData.lastRestocked,
      updatedAt: now,
      updatedBy: actor.uid,
    });

    const mutId = `mut-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const mutRef = getTenantCollection(wsId, 'stock_mutations').doc(mutId);

    const mutationRecord = {
      id: mutId,
      materialId,
      materialName: matData.name,
      date: now,
      type,
      quantity: qtyInt,
      unit: matData.unit,
      referenceNo,
      project: project || '',
      handler: handler || actor.name,
      createdBy: actor.uid,
      updatedBy: actor.uid,
      workspaceId: wsId,
      schemaVersion: 2,
      createdAt: now,
      updatedAt: now,
    };

    tx.set(mutRef, mutationRecord);

    recordAuditAndNotificationInTx(tx, actor, {
      action: 'STOCK_MUTATION_RECORDED',
      recordType: 'material',
      recordId: mutId,
      details: `Mutasi ${type} ${qtyInt} ${matData.unit} material ${matData.name} (Ref: ${referenceNo}). Sisa stok: ${newStock}`,
      previousValue: `Stok: ${currentStock}`,
      newValue: `Stok: ${newStock}`,
      metadata: { materialId, type, quantity: qtyInt, referenceNo },
    });

    const response: WorkflowResponse = {
      success: true,
      message: `Mutasi ${type} ${qtyInt} ${matData.unit} berhasil dicatat. Sisa stok: ${newStock}.`,
      data: { mutId, materialId, oldStock: currentStock, newStock, newStatus },
    };

    saveIdempotencyInTx(tx, wsId, idempotencyKey, response, now);

    return response;
  });
}
