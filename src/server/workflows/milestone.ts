/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrustedActor } from '../auth';
import { hasApprovalAuthority } from '../../lib/rbac';
import {
  adminDb,
  getTenantCollection,
  getProjectSubcollection,
  checkIdempotency,
  saveIdempotencyInTx,
  recordAuditAndNotificationInTx,
  WorkflowResponse,
} from './common';

export async function handleMilestoneSignOffAction(
  actor: TrustedActor,
  payload: {
    milestoneId: string;
    projectId?: string;
    bastRef: string;
    notes?: string;
    idempotencyKey?: string;
  }
): Promise<WorkflowResponse> {
  const { milestoneId, bastRef, notes, idempotencyKey } = payload;
  const wsId = actor.workspaceId;

  if (!milestoneId) throw new Error('milestoneId wajib disertakan.');
  if (!bastRef || !bastRef.trim()) {
    throw new Error('Nomor Berita Acara Serah Terima (BAST Ref) wajib disertakan untuk sign-off milestone.');
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

    // Find target milestone either directly or via projectId
    let pid = payload.projectId || '';
    let msRef: FirebaseFirestore.DocumentReference | null = null;
    let currentMS: any = null;

    if (pid) {
      msRef = getProjectSubcollection(wsId, pid, 'milestones').doc(milestoneId);
      const snap = await tx.get(msRef);
      if (snap.exists) {
        currentMS = snap.data();
      }
    }

    // Fallback search across projects in workspace if projectId was not supplied
    if (!currentMS) {
      const projectsSnap = await getTenantCollection(wsId, 'projects').get();
      for (const pDoc of projectsSnap.docs) {
        const candidateRef = getProjectSubcollection(wsId, pDoc.id, 'milestones').doc(milestoneId);
        const candidateSnap = await tx.get(candidateRef);
        if (candidateSnap.exists) {
          msRef = candidateRef;
          currentMS = candidateSnap.data();
          pid = pDoc.id;
          break;
        }
      }
    }

    if (!msRef || !currentMS) {
      throw new Error(`Milestone ${milestoneId} tidak ditemukan dalam workspace.`);
    }

    if (!hasApprovalAuthority(actor.role, 'milestoneSignOff')) {
      throw new Error(
        `Peran "${actor.role}" tidak berwenang mengesahkan BAST milestone. Diperlukan peran Project Manager atau Owner / Director.`
      );
    }

    if (currentMS.status === 'Selesai') {
      throw new Error(`Milestone "${currentMS.title}" sudah disahkan sebelumnya (Status: Selesai).`);
    }

    const now = new Date().toISOString();

    // Update Project completed milestones count
    const projectRef = getTenantCollection(wsId, 'projects').doc(pid);
    const projectSnap = await tx.get(projectRef);
    let completedCount = 1;
    let projectName = '';

    if (projectSnap.exists) {
      const pData = projectSnap.data()!;
      projectName = pData.name || '';
      completedCount = (Number(pData.completedMilestones) || 0) + 1;
      tx.update(projectRef, {
        completedMilestones: completedCount,
        updatedAt: now,
        updatedBy: actor.uid,
      });
    }

    tx.update(msRef, {
      status: 'Selesai',
      progress: 100,
      signedOffBy: actor.name,
      signedOffByUid: actor.uid,
      signedOffAt: now,
      bastRef: bastRef.trim(),
      updatedAt: now,
      updatedBy: actor.uid,
    });

    recordAuditAndNotificationInTx(tx, actor, {
      action: 'MILESTONE_SIGNED_OFF',
      recordType: 'milestone',
      recordId: milestoneId,
      details: `Pengesahan milestone: "${currentMS.title}" disahkan oleh ${actor.name} (Ref: ${bastRef.trim()})`,
      projectId: pid,
      projectName,
      previousValue: currentMS.status,
      newValue: 'Selesai',
      metadata: { bastRef: bastRef.trim(), notes: notes || '' },
      notification: {
        title: 'Milestone Resmi Disahkan',
        message: `Milestone "${currentMS.title}" telah disahkan oleh ${actor.name} (BAST: ${bastRef.trim()}).`,
        type: 'success',
        targetScreen: 'schedule',
        targetRoles: ['Owner / Director', 'Project Manager', 'Finance / Accounting'],
      },
    });

    const response: WorkflowResponse = {
      success: true,
      message: `Milestone "${currentMS.title}" berhasil disahkan dengan BAST Ref: ${bastRef.trim()}.`,
      data: { milestoneId, status: 'Selesai', signedOffBy: actor.name, bastRef: bastRef.trim() },
    };

    saveIdempotencyInTx(tx, wsId, idempotencyKey, response, now);

    return response;
  });
}
