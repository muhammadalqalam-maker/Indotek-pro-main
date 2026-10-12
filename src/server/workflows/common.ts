/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getAdminDb } from '../firebaseAdmin';
import { TrustedActor } from '../auth';
import { AuditActionType } from '../../types/rbac';

// Dynamic database proxy ensuring tests can inject test double / emulator seamlessly
export const adminDb = new Proxy({} as FirebaseFirestore.Firestore, {
  get(_target, prop) {
    return (getAdminDb() as any)[prop];
  },
});

export interface WorkflowResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  idempotentReplay?: boolean;
}

/**
 * Multi-tenant Collection Path Resolvers
 * workspaces/{wsId}/{subCol}
 * workspaces/{wsId}/projects/{pid}/{subCol}
 */
export function getTenantCollection(workspaceId: string, col: string) {
  return adminDb.collection('workspaces').doc(workspaceId).collection(col);
}

export function getProjectSubcollection(workspaceId: string, projectId: string, subCol: string) {
  return adminDb
    .collection('workspaces')
    .doc(workspaceId)
    .collection('projects')
    .doc(projectId)
    .collection(subCol);
}

/**
 * Default Idempotency Expiration: 24 Hours (in milliseconds)
 */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Checks and records idempotency key inside or outside transaction.
 * Strictly respects expiration (expiresAt).
 */
export async function checkIdempotency(workspaceId: string, key: string): Promise<any | null> {
  if (!key) return null;
  const docRef = getTenantCollection(workspaceId, 'idempotency_keys').doc(key);
  const snap = await docRef.get();
  if (snap.exists) {
    const data = snap.data();
    if (data?.status === 'COMPLETED') {
      // Check expiration
      if (data.expiresAt && new Date(data.expiresAt).getTime() < Date.now()) {
        return null; // Expired key is invalid
      }
      return data.result;
    }
  }
  return null;
}

/**
 * Writes idempotency record within the current transaction with expiration timestamp.
 */
export function saveIdempotencyInTx(
  tx: FirebaseFirestore.Transaction,
  workspaceId: string,
  key: string | undefined,
  result: any,
  nowIso: string
) {
  if (!key) return;
  const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_MS).toISOString();
  tx.set(getTenantCollection(workspaceId, 'idempotency_keys').doc(key), {
    key,
    status: 'COMPLETED',
    result,
    createdAt: nowIso,
    expiresAt,
  });
}

/**
 * Generates sequential, collision-free, server-enforced document numbers
 * via transactional counters per workspace + year + docType.
 * Replaces Math.random() and length+1!
 * Path: workspaces/{workspaceId}/counters/{year}_{type}
 */
export async function generateTransactionalDocNumber(
  transaction: FirebaseFirestore.Transaction,
  type: 'PO' | 'ADD-REV' | 'LHP' | 'KAS' | 'ADJ',
  projectCodeOrAbbr = 'IND',
  workspaceId: string,
  year = '2026'
): Promise<string> {
  const cleanCode =
    projectCodeOrAbbr.replace(/[^A-Z0-9]/gi, '').substring(0, 4).toUpperCase() || 'IND';
  const counterDocId = `${year}_${type}`;
  const counterRef = getTenantCollection(workspaceId, 'counters').doc(counterDocId);

  const counterSnap = await transaction.get(counterRef);
  let nextNumber = 1;
  if (counterSnap.exists) {
    const data = counterSnap.data();
    nextNumber = (data?.lastNumber || 0) + 1;
  }

  transaction.set(
    counterRef,
    {
      workspaceId,
      year,
      docType: type,
      lastNumber: nextNumber,
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  const paddedSeq4 = String(nextNumber).padStart(4, '0');
  const paddedSeq3 = String(nextNumber).padStart(3, '0');
  const paddedSeq2 = String(nextNumber).padStart(2, '0');

  switch (type) {
    case 'PO':
      return `PO-${year}-${cleanCode}-${paddedSeq4}`;
    case 'ADD-REV':
      return `ADD-REV-${paddedSeq2}/${cleanCode}/${year}`;
    case 'LHP':
      return `LHP-${year}-${paddedSeq4}`;
    case 'KAS':
      return `KAS-${cleanCode}-${year}-${paddedSeq4}`;
    case 'ADJ':
      return `ADJ-${cleanCode}-${year}-${paddedSeq4}`;
  }
}

/**
 * Record audit log and notification within the provided Firestore transaction.
 * Path: workspaces/{wsId}/audit_logs and workspaces/{wsId}/notifications
 */
export function recordAuditAndNotificationInTx(
  transaction: FirebaseFirestore.Transaction,
  actor: TrustedActor,
  options: {
    action: AuditActionType;
    recordType: string;
    recordId: string;
    details: string;
    projectId?: string;
    projectName?: string;
    previousValue?: string;
    newValue?: string;
    metadata?: Record<string, any>;
    notification?: {
      title: string;
      message: string;
      type: 'warning' | 'info' | 'success' | 'alert';
      targetRoles: string[];
      targetScreen: string;
      dedupKey?: string;
    };
  }
) {
  const now = new Date().toISOString();
  const auditId = `aud-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const auditRef = getTenantCollection(actor.workspaceId, 'audit_logs').doc(auditId);

  transaction.set(auditRef, {
    id: auditId,
    action: options.action,
    actor: {
      uid: actor.uid,
      name: actor.name,
      email: actor.email,
      role: actor.role,
    },
    workspaceId: actor.workspaceId,
    projectId: options.projectId || '',
    projectName: options.projectName || '',
    recordType: options.recordType,
    recordId: options.recordId,
    details: options.details,
    previousValue: options.previousValue || '',
    newValue: options.newValue || '',
    metadata: options.metadata || {},
    timestamp: now,
    createdAt: now,
    createdBy: actor.uid,
    updatedAt: now,
    updatedBy: actor.uid,
    schemaVersion: 2,
    correlationId: auditId,
  });

  if (options.notification) {
    const notifId = `notif-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const notifRef = getTenantCollection(actor.workspaceId, 'notifications').doc(notifId);
    transaction.set(notifRef, {
      id: notifId,
      title: options.notification.title,
      message: options.notification.message,
      type: options.notification.type,
      read: false,
      recipientUid: actor.uid,
      timestamp: now,
      createdAt: now,
      createdBy: actor.uid,
      updatedAt: now,
      updatedBy: actor.uid,
      schemaVersion: 2,
      targetScreen: options.notification.targetScreen,
      targetRoles: options.notification.targetRoles,
      projectId: options.projectId || '',
      dedupKey: options.notification.dedupKey || notifId,
      workspaceId: actor.workspaceId,
    });
  }
}
