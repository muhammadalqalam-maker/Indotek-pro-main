/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Enterprise Multi-Tenant Firestore Service
 * Strict single source of truth: all persistent data resides in Cloud Firestore.
 * Subcollections architecture:
 *   workspaces/{wsId}/projects/{projectId}/budget_lines/{lineId}
 *   workspaces/{wsId}/projects/{projectId}/milestones/{milestoneId}
 *   workspaces/{wsId}/projects/{projectId}/wbs_items/{wbsId}
 *   workspaces/{wsId}/projects/{projectId}/budget_versions/{versionId}
 *   workspaces/{wsId}/settings/company_default
 * Zero dependency on local mock constants.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  getDocFromCache,
  getDocsFromCache,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  startAfter,
  writeBatch,
  runTransaction
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, auth, isQuotaExhaustedError } from '../lib/firebase';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { supabaseDataService, resolveWorkspaceId } from './supabaseDataService';
import {
  Project,
  PurchaseOrder,
  MaterialItem,
  FieldReport,
  StockMutation,
  NotificationItem,
  ProjectActivity,
  TeamMember,
  AuditLogEntry,
  BudgetRevision,
  PettyCashEntry,
  FieldReportStatus,
  StockAdjustment,
  BudgetLine,
  Milestone,
  WBSItem,
  BudgetVersion,
  AppRole
} from '../types';
import { calculateProjectFinancials, calculateProjectSchedule } from '../utils/projectCalculations';

export const DEFAULT_WORKSPACE_ID = 'indotek-jkt';

export interface AppSettings {
  companyName: string;
  companyAddress: string;
  taxNumberNPWP: string;
  tableDensity: 'comfortable' | 'compact';
  currency: string;
  dateFormat: string;
  alertScheduleDeviation: boolean;
  alertCriticalStock: boolean;
  alertHighValuePO: boolean;
  language: 'id' | 'en';
  updatedAt?: string;
}

export interface ActorInfo {
  uid: string;
  name: string;
  role: AppRole | string;
  email?: string;
}

/**
 * Multi-tenant Collection Path Resolvers
 */
export function getWorkspaceCol(col: string, wsId = DEFAULT_WORKSPACE_ID) {
  return collection(db, 'workspaces', wsId, col);
}

export function getWorkspaceDoc(col: string, docId: string, wsId = DEFAULT_WORKSPACE_ID) {
  return doc(db, 'workspaces', wsId, col, docId);
}

export function getProjectSubCol(projectId: string, subCol: string, wsId = DEFAULT_WORKSPACE_ID) {
  return collection(db, 'workspaces', wsId, 'projects', projectId, subCol);
}

export function getProjectSubDoc(projectId: string, subCol: string, docId: string, wsId = DEFAULT_WORKSPACE_ID) {
  return doc(db, 'workspaces', wsId, 'projects', projectId, subCol, docId);
}

/**
 * In-Memory & Local Cache System for Rare-Change Collections (Requirement 3 & 5)
 * Minimizes Firestore read quota usage by keeping cache with TTL.
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
const memoryCacheStore = new Map<string, CacheEntry<any>>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function getCachedItem<T>(key: string): T | null {
  const entry = memoryCacheStore.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    memoryCacheStore.delete(key);
    return null;
  }
  return entry.data;
}

export function setCachedItem<T>(key: string, data: T): void {
  memoryCacheStore.set(key, { data, timestamp: Date.now() });
}

export function invalidateCache(keyPrefix?: string): void {
  if (!keyPrefix) {
    memoryCacheStore.clear();
    return;
  }
  for (const k of memoryCacheStore.keys()) {
    if (k.startsWith(keyPrefix)) {
      memoryCacheStore.delete(k);
    }
  }
}

export interface PaginatedResult<T> {
  items: T[];
  lastDoc: any | null;
  hasMore: boolean;
}

/**
 * Attempts to call the server-side workflow endpoint; throws if unavailable.
 */
export async function callWorkflowApi<T = any>(endpoint: string, body: any): Promise<T> {
  let token = '';

  if (isSupabaseConfigured()) {
    try {
      const sessionRes = await supabase.auth.getSession();
      if (sessionRes.data.session?.access_token) {
        token = sessionRes.data.session.access_token;
      }
    } catch {
      // Fallback
    }
  }

  if (!token) {
    const currentUser = auth.currentUser;
    if (currentUser) {
      token = await currentUser.getIdToken();
    }
  }

  if (!token) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:required'));
    }
    throw new Error('Sesi autentikasi diperlukan. Silakan login ke akun Anda terlebih dahulu.');
  }

  const idempotencyKey = crypto.randomUUID();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-idempotency-key': idempotencyKey,
    'Authorization': `Bearer ${token}`,
  };

  const response = await fetch(`/api/workflows/${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body, idempotencyKey }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:required'));
    }
    throw new Error(data.error || `Workflow request failed (HTTP ${response.status})`);
  }
  return data;
}

export const firestoreService = {
  /**
   * Generates sequential document numbers conforming strictly to Indonesian construction conventions.
   */
  async generateDocumentNumber(
    type: 'PO' | 'ADD-REV' | 'LHP' | 'KAS' | 'ADJ',
    projectCodeOrAbbr = 'IND',
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<string> {
    try {
      const res = await callWorkflowApi<{ success: boolean; docNumber: string }>('document-number', {
        type,
        projectCodeOrAbbr,
      });
      if (res && res.docNumber) return res.docNumber;
    } catch {
      // Fallback via Firestore direct counter
    }

    const cleanCode = projectCodeOrAbbr.replace(/[^A-Z0-9]/gi, '').substring(0, 4).toUpperCase() || 'IND';
    const counterRef = getWorkspaceDoc('counters', `2026_${type}`, wsId);

    try {
      const nextNum = await runTransaction(db, async (transaction) => {
        const counterSnap = await transaction.get(counterRef);
        let cur = 100;
        if (counterSnap.exists()) {
          cur = counterSnap.data().lastNumber || 100;
        }
        const updated = cur + 1;
        transaction.set(counterRef, {
          docType: type,
          lastNumber: updated,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
        return updated;
      });

      switch (type) {
        case 'PO':
          return `PO-2026-${cleanCode}-${nextNum.toString().padStart(4, '0')}`;
        case 'ADD-REV':
          return `ADD-REV-${nextNum.toString().padStart(2, '0')}/${cleanCode}/2026`;
        case 'LHP':
          return `LHP-2026-${nextNum.toString().padStart(3, '0')}`;
        case 'KAS':
          return `KAS-${cleanCode}-2026-${nextNum.toString().padStart(3, '0')}`;
        case 'ADJ':
          return `ADJ-${cleanCode}-2026-${nextNum.toString().padStart(3, '0')}`;
      }
    } catch {
      const fallbackSeq = (150 + Math.floor(Math.random() * 80)).toString();
      switch (type) {
        case 'PO':
          return `PO-2026-${cleanCode}-${fallbackSeq.padStart(4, '0')}`;
        case 'ADD-REV':
          return `ADD-REV-01/${cleanCode}/2026`;
        case 'LHP':
          return `LHP-2026-${fallbackSeq}`;
        case 'KAS':
          return `KAS-${cleanCode}-2026-${fallbackSeq}`;
        case 'ADJ':
          return `ADJ-${cleanCode}-2026-${fallbackSeq}`;
      }
    }
  },

  // =========================================================================
  // 1. PROJECTS (workspaces/{wsId}/projects)
  // =========================================================================
  subscribeProjects(
    callback: (projects: Project[]) => void,
    onError?: (err: any) => void,
    wsId = DEFAULT_WORKSPACE_ID
  ) {
    if (isSupabaseConfigured()) {
      return supabaseDataService.subscribeProjects(callback, wsId);
    }
    const colRef = getWorkspaceCol('projects', wsId);
    return onSnapshot(
      colRef,
      (snapshot) => {
        const items: Project[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });
        callback(items);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, `workspaces/${wsId}/projects`);
      }
    );
  },
  async getProjects(forceRefresh = false, wsId = DEFAULT_WORKSPACE_ID): Promise<Project[]> {
    if (isSupabaseConfigured()) {
      return await supabaseDataService.getProjects(wsId);
    }
    const cacheKey = `projects_${wsId}`;
    if (!forceRefresh) {
      const cached = getCachedItem<Project[]>(cacheKey);
      if (cached) return cached;
    }

    const colRef = getWorkspaceCol('projects', wsId);
    try {
      const snap = await getDocs(colRef);
      const items: Project[] = [];
      snap.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...(docSnap.data() as any) });
      });
      setCachedItem(cacheKey, items);
      return items;
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        try {
          const cacheSnap = await getDocsFromCache(colRef);
          const items: Project[] = [];
          cacheSnap.forEach((docSnap) => items.push({ id: docSnap.id, ...(docSnap.data() as any) }));
          if (items.length > 0) return items;
        } catch {
          // ignore
        }
      }
      handleFirestoreError(err, OperationType.GET, `workspaces/${wsId}/projects`);
    }
  },

  async addProject(
    projectData: Omit<Project, 'id' | 'totalMilestones' | 'completedMilestones'>,
    actor?: ActorInfo,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<string> {
    const id = `prj-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const fullProject: Project = {
      ...projectData,
      id,
      totalMilestones: 4,
      completedMilestones: 0,
      actualCost: 0,
      progressActual: 0,
      progressPlanned: 10,
      scheduleStatus: 'Tepat Waktu',
      createdAt: now,
      updatedAt: now,
      createdBy: actor?.uid || auth.currentUser?.uid || 'user',
    };

    if (isSupabaseConfigured()) {
      const ws = resolveWorkspaceId(wsId);
      const { data: pInserted, error: pErr } = await supabase
        .from('projects')
        .insert({
          workspace_id: ws,
          legacy_id: id,
          code: projectData.code,
          name: projectData.name,
          client: projectData.client,
          category: projectData.category,
          location: projectData.location,
          project_manager: projectData.projectManager,
          site_engineer: projectData.siteEngineer,
          contract_value: projectData.contractValue,
          approved_budget: projectData.approvedBudget,
          actual_cost: 0,
          start_date: projectData.startDate ? projectData.startDate.split('T')[0] : null,
          target_end_date: projectData.targetEndDate ? projectData.targetEndDate.split('T')[0] : null,
          progress_actual: 0,
          progress_planned: 10,
          status: projectData.status,
          schedule_status: 'Tepat Waktu',
          image_url: projectData.image || null,
          description: projectData.description || null,
          total_milestones: 4,
          completed_milestones: 0,
        })
        .select('id')
        .single();

      if (pErr) {
        console.error('[Supabase addProject Error]:', pErr.message);
        throw new Error(pErr.message);
      }

      const newPid = pInserted.id;

      // Create initial Baseline Version record: v0 Kontrak Induk
      const verId = `ver-${id}-v0`;
      await supabase.from('budget_versions').insert({
        workspace_id: ws,
        project_id: newPid,
        legacy_id: verId,
        version_number: 'v0 Kontrak Induk',
        effective_date: projectData.startDate ? projectData.startDate.split('T')[0] : now.split('T')[0],
        approved_by_name: actor?.name || 'Direksi / Owner',
        total_planned_amount: projectData.approvedBudget,
        description: `Pagu anggaran awal disahkan sesuai Kontrak Kerja Konstruksi ${projectData.code}.`,
        division_amounts: {
          'Pekerjaan Persiapan': Math.round(projectData.approvedBudget * 0.08),
          'Pekerjaan Struktur': Math.round(projectData.approvedBudget * 0.65),
          'Pekerjaan Arsitektur': Math.round(projectData.approvedBudget * 0.15),
          'Pekerjaan MEP': Math.round(projectData.approvedBudget * 0.12),
        },
      });

      // Default budget lines
      const defaultDivisions = [
        { code: 'DIV-01', name: 'Pekerjaan Persiapan', cat: 'Pekerjaan Persiapan', pct: 0.08 },
        { code: 'DIV-02', name: 'Pekerjaan Struktur Utama', cat: 'Pekerjaan Struktur', pct: 0.65 },
        { code: 'DIV-03', name: 'Pekerjaan Arsitektural & Finishing', cat: 'Pekerjaan Arsitektur', pct: 0.15 },
        { code: 'DIV-04', name: 'Pekerjaan Mekanikal & Elektrikal (MEP)', cat: 'Pekerjaan MEP', pct: 0.12 },
      ];

      for (const div of defaultDivisions) {
        const lineId = `bl-${id}-${div.code.toLowerCase()}`;
        const lineAmount = Math.round(projectData.approvedBudget * div.pct);
        await supabase.from('budget_lines').insert({
          workspace_id: ws,
          project_id: newPid,
          legacy_id: lineId,
          code: div.code,
          division_name: div.name,
          category: div.cat,
          planned_amount: lineAmount,
          actual_amount: 0,
          volume: 1,
          unit: 'ls',
          unit_rate: lineAmount,
          status: 'Aman',
        });
      }

      // Default milestones
      const defaultMilestones = [
        { id: `ms-${id}-1`, title: 'Mobilisasi & Pek. Persiapan', targetDate: '2026-03-31', weight: 10 },
        { id: `ms-${id}-2`, title: 'Selesai Struktur Bawah / Fondasi', targetDate: '2026-06-30', weight: 30 },
        { id: `ms-${id}-3`, title: 'Topping Off Struktur Atas', targetDate: '2026-09-30', weight: 35 },
        { id: `ms-${id}-4`, title: 'Finishing & BAST Final', targetDate: projectData.targetEndDate || '2026-12-31', weight: 25 },
      ];

      for (const ms of defaultMilestones) {
        await supabase.from('milestones').insert({
          workspace_id: ws,
          project_id: newPid,
          legacy_id: ms.id,
          title: ms.title,
          wbs_code: `MS-${ms.id.slice(-1)}`,
          planned_date: ms.targetDate ? ms.targetDate.split('T')[0] : null,
          progress: 0,
          weight_percent: ms.weight,
          status: 'Menunggu',
        });
      }

      // Default WBS
      const defaultWBS = [
        { code: 'WBS-1.1', name: 'Mobilisasi Alat Berat & Direksi Keet', dur: 14, cat: 'Persiapan' },
        { code: 'WBS-2.1', name: 'Pekerjaan Galian & Pondasi Bored Pile', dur: 45, cat: 'Struktur Bawah' },
        { code: 'WBS-2.2', name: 'Pengecoran Kolom & Balok Lt. 1-4', dur: 60, cat: 'Struktur Atas' },
        { code: 'WBS-3.1', name: 'Pekerjaan Dinding & Plesteran', dur: 40, cat: 'Arsitektur' },
        { code: 'WBS-4.1', name: 'Instalasi Tray Kabel & Pemipaan MEP', dur: 30, cat: 'MEP' },
      ];

      for (let idx = 0; idx < defaultWBS.length; idx++) {
        const item = defaultWBS[idx];
        const wbsId = `wbs-${id}-${idx + 1}`;
        await supabase.from('wbs_items').insert({
          workspace_id: ws,
          project_id: newPid,
          legacy_id: wbsId,
          code: item.code,
          name: item.name,
          category: item.cat,
          duration_days: item.dur,
          start_date: projectData.startDate ? projectData.startDate.split('T')[0] : null,
          end_date: projectData.targetEndDate ? projectData.targetEndDate.split('T')[0] : null,
          planned_progress: 10,
          actual_progress: 0,
          status: 'Belum Mulai',
          critical_path: idx === 1 || idx === 2,
          assigned_team: 'Tim Operasional Lapangan',
        });
      }

      await this.logAuditEvent({
        action: 'PROJECT_CREATED',
        recordType: 'project',
        recordId: id,
        projectId: id,
        projectName: projectData.name,
        details: `Membuat proyek baru "${projectData.name}" (${projectData.code}) dengan pagu RAB Rp ${projectData.approvedBudget.toLocaleString('id-ID')}`,
        actor: {
          uid: actor?.uid || auth.currentUser?.uid || 'user',
          name: actor?.name || 'Pengguna',
          role: actor?.role || 'Project Manager',
          email: actor?.email || auth.currentUser?.email || '',
        },
      }, wsId);

      invalidateCache('projects_');
      return id;
    }

    try {
      const batch = writeBatch(db);
      const projRef = getWorkspaceDoc('projects', id, wsId);
      batch.set(projRef, fullProject);

      // Create initial Baseline Version record: v0 Kontrak Induk
      const verId = `ver-${id}-v0`;
      const verRef = getProjectSubDoc(id, 'budget_versions', verId, wsId);
      const v0Record: BudgetVersion = {
        id: verId,
        projectId: id,
        versionNumber: 'v0 Kontrak Induk',
        effectiveDate: projectData.startDate || now,
        approvedBy: actor?.name || 'Direksi / Owner',
        approvedByUid: actor?.uid || auth.currentUser?.uid,
        totalPlannedAmount: projectData.approvedBudget,
        description: `Pagu anggaran awal disahkan sesuai Kontrak Kerja Konstruksi ${projectData.code}.`,
        divisionAmounts: {
          'Pekerjaan Persiapan': Math.round(projectData.approvedBudget * 0.08),
          'Pekerjaan Struktur': Math.round(projectData.approvedBudget * 0.65),
          'Pekerjaan Arsitektur': Math.round(projectData.approvedBudget * 0.15),
          'Pekerjaan MEP': Math.round(projectData.approvedBudget * 0.12),
        },
        createdAt: now,
      };
      batch.set(verRef, v0Record);

      // Initialize default contract BOQ divisions under project subcollection
      const defaultDivisions = [
        { code: 'DIV-01', name: 'Pekerjaan Persiapan', cat: 'Pekerjaan Persiapan', pct: 0.08 },
        { code: 'DIV-02', name: 'Pekerjaan Struktur Utama', cat: 'Pekerjaan Struktur', pct: 0.65 },
        { code: 'DIV-03', name: 'Pekerjaan Arsitektural & Finishing', cat: 'Pekerjaan Arsitektur', pct: 0.15 },
        { code: 'DIV-04', name: 'Pekerjaan Mekanikal & Elektrikal (MEP)', cat: 'Pekerjaan MEP', pct: 0.12 },
      ];

      for (const div of defaultDivisions) {
        const lineId = `bl-${id}-${div.code.toLowerCase()}`;
        const lineAmount = Math.round(projectData.approvedBudget * div.pct);
        const lineRef = getProjectSubDoc(id, 'budget_lines', lineId, wsId);
        batch.set(lineRef, {
          id: lineId,
          projectId: id,
          code: div.code,
          divisionName: div.name,
          category: div.cat,
          plannedAmount: lineAmount,
          actualAmount: 0,
          volume: 1,
          unit: 'ls',
          unitRate: lineAmount,
          varianceAmount: lineAmount,
          variancePercent: 100,
          status: 'Aman',
          createdAt: now,
          updatedAt: now,
        });
      }

      // Initialize default milestones
      const defaultMilestones = [
        { id: `ms-${id}-1`, title: 'Mobilisasi & Pek. Persiapan', targetDate: '2026-03-31', weight: 10 },
        { id: `ms-${id}-2`, title: 'Selesai Struktur Bawah / Fondasi', targetDate: '2026-06-30', weight: 30 },
        { id: `ms-${id}-3`, title: 'Topping Off Struktur Atas', targetDate: '2026-09-30', weight: 35 },
        { id: `ms-${id}-4`, title: 'Finishing & BAST Final', targetDate: projectData.targetEndDate || '2026-12-31', weight: 25 },
      ];

      for (const ms of defaultMilestones) {
        const msRef = getProjectSubDoc(id, 'milestones', ms.id, wsId);
        batch.set(msRef, {
          id: ms.id,
          projectId: id,
          code: `MS-${ms.id.slice(-1)}`,
          title: ms.title,
          description: `Pencapaian milestone kontraktual ${ms.title}`,
          category: 'Struktural',
          plannedDate: ms.targetDate,
          progress: 0,
          weightPercent: ms.weight,
          status: 'Menunggu',
          createdAt: now,
          updatedAt: now,
        });
      }

      // Initialize default WBS items
      const defaultWBS = [
        { code: 'WBS-1.1', name: 'Mobilisasi Alat Berat & Direksi Keet', dur: 14, cat: 'Persiapan' },
        { code: 'WBS-2.1', name: 'Pekerjaan Galian & Pondasi Bored Pile', dur: 45, cat: 'Struktur Bawah' },
        { code: 'WBS-2.2', name: 'Pengecoran Kolom & Balok Lt. 1-4', dur: 60, cat: 'Struktur Atas' },
        { code: 'WBS-3.1', name: 'Pekerjaan Dinding & Plesteran', dur: 40, cat: 'Arsitektur' },
        { code: 'WBS-4.1', name: 'Instalasi Tray Kabel & Pemipaan MEP', dur: 30, cat: 'MEP' },
      ];

      for (let idx = 0; idx < defaultWBS.length; idx++) {
        const item = defaultWBS[idx];
        const wbsId = `wbs-${id}-${idx + 1}`;
        const wbsRef = getProjectSubDoc(id, 'wbs_items', wbsId, wsId);
        batch.set(wbsRef, {
          id: wbsId,
          projectId: id,
          code: item.code,
          name: item.name,
          category: item.cat,
          durationDays: item.dur,
          startDate: projectData.startDate || now,
          endDate: projectData.targetEndDate || now,
          plannedProgress: 10,
          actualProgress: 0,
          status: 'Belum Mulai',
          criticalPath: idx === 1 || idx === 2,
          assignedTeam: 'Tim Operasional Lapangan',
          createdAt: now,
          updatedAt: now,
        });
      }

      // Record audit log
      const auditId = `aud-${Date.now().toString(36)}`;
      batch.set(getWorkspaceDoc('audit_logs', auditId, wsId), {
        id: auditId,
        action: 'PROJECT_CREATED',
        recordType: 'project',
        recordId: id,
        projectId: id,
        projectName: projectData.name,
        details: `Membuat proyek baru "${projectData.name}" (${projectData.code}) dengan pagu RAB Rp ${projectData.approvedBudget.toLocaleString('id-ID')}`,
        actor: {
          uid: actor?.uid || auth.currentUser?.uid || 'user',
          name: actor?.name || 'Pengguna',
          role: actor?.role || 'Project Manager',
          email: actor?.email || auth.currentUser?.email || '',
        },
        timestamp: now,
        correlationId: `tx-${Date.now()}`,
      });

      await batch.commit();
      invalidateCache('projects_');
      return id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `workspaces/${wsId}/projects/${id}`);
    }
  },

  async updateProject(
    projectId: string,
    updates: Partial<Project>,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<void> {
    if (isSupabaseConfigured()) {
      const ws = resolveWorkspaceId(wsId);
      const payload: any = { updated_at: new Date().toISOString() };
      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.code !== undefined) payload.code = updates.code;
      if (updates.client !== undefined) payload.client = updates.client;
      if (updates.category !== undefined) payload.category = updates.category;
      if (updates.location !== undefined) payload.location = updates.location;
      if (updates.projectManager !== undefined) payload.project_manager = updates.projectManager;
      if (updates.siteEngineer !== undefined) payload.site_engineer = updates.siteEngineer;
      if (updates.contractValue !== undefined) payload.contract_value = updates.contractValue;
      if (updates.approvedBudget !== undefined) payload.approved_budget = updates.approvedBudget;
      if (updates.actualCost !== undefined) payload.actual_cost = updates.actualCost;
      if (updates.progressActual !== undefined) payload.progress_actual = updates.progressActual;
      if (updates.progressPlanned !== undefined) payload.progress_planned = updates.progressPlanned;
      if (updates.status !== undefined) payload.status = updates.status;
      if (updates.scheduleStatus !== undefined) payload.schedule_status = updates.scheduleStatus;
      if (updates.completedMilestones !== undefined) payload.completed_milestones = updates.completedMilestones;
      if (updates.totalMilestones !== undefined) payload.total_milestones = updates.totalMilestones;
      if (updates.startDate !== undefined) payload.start_date = updates.startDate ? updates.startDate.split('T')[0] : null;
      if (updates.targetEndDate !== undefined) payload.target_end_date = updates.targetEndDate ? updates.targetEndDate.split('T')[0] : null;

      const { error: upErr } = await supabase
        .from('projects')
        .update(payload)
        .eq('workspace_id', ws)
        .or(`id.eq.${projectId.length === 36 ? projectId : '00000000-0000-0000-0000-000000000000'},legacy_id.eq.${projectId}`);

      if (upErr) {
        console.warn('[Supabase updateProject Notice]:', upErr.message);
      }
      invalidateCache('projects_');
      return;
    }

    try {
      const projRef = getWorkspaceDoc('projects', projectId, wsId);
      await updateDoc(projRef, {
        ...updates,
        updatedAt: new Date().toISOString(),
      });
      invalidateCache('projects_');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `workspaces/${wsId}/projects/${projectId}`);
    }
  },

  // =========================================================================
  // 2. PROJECT SUBCOLLECTIONS: BUDGET LINES (workspaces/{wsId}/projects/{pid}/budget_lines)
  // =========================================================================
  subscribeProjectBudgetLines(
    projectId: string,
    callback: (lines: BudgetLine[]) => void,
    onError?: (err: any) => void,
    wsId = DEFAULT_WORKSPACE_ID
  ) {
    if (!projectId) return () => {};
    if (isSupabaseConfigured()) {
      supabaseDataService.getProjectSubcollections(projectId, wsId).then((res) => {
        callback(res.budgetLines);
      }).catch((err) => {
        if (onError) onError(err);
      });
      return () => {};
    }
    const colRef = getProjectSubCol(projectId, 'budget_lines', wsId);
    return onSnapshot(
      colRef,
      (snapshot) => {
        const items: BudgetLine[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });
        items.sort((a, b) => a.code.localeCompare(b.code));
        callback(items);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, `workspaces/${wsId}/projects/${projectId}/budget_lines`);
      }
    );
  },

  async addProjectBudgetLine(
    projectId: string,
    lineData: Omit<BudgetLine, 'id'>,
    actor?: ActorInfo,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<string> {
    const id = `bl-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const planned = Math.round(Number(lineData.plannedAmount) || 0);
    const actual = Math.round(Number(lineData.actualAmount) || 0);
    const variance = planned - actual;
    const variancePct = planned > 0 ? Number(((variance / planned) * 100).toFixed(2)) : 0;
    const status = actual > planned ? 'Overbudget' : (actual / planned) > 0.85 ? 'Peringatan' : 'Aman';

    const fullLine: BudgetLine = {
      ...lineData,
      id,
      projectId,
      plannedAmount: planned,
      actualAmount: actual,
      varianceAmount: variance,
      variancePercent: variancePct,
      status,
      createdAt: now,
      updatedAt: now,
    };

    if (isSupabaseConfigured()) {
      const ws = resolveWorkspaceId(wsId);
      let pid = projectId;
      const { data: pRow } = await supabase
        .from('projects')
        .select('id, legacy_id')
        .eq('workspace_id', ws)
        .or(`id.eq.${projectId.length === 36 ? projectId : '00000000-0000-0000-0000-000000000000'},legacy_id.eq.${projectId}`)
        .maybeSingle();

      if (pRow) pid = pRow.id;

      const { error: insErr } = await supabase.from('budget_lines').insert({
        workspace_id: ws,
        project_id: pid,
        legacy_id: id,
        code: fullLine.code,
        division_name: fullLine.divisionName,
        category: fullLine.category,
        planned_amount: planned,
        actual_amount: actual,
        unit: fullLine.unit || '',
        volume: fullLine.volume || 0,
        unit_rate: fullLine.unitRate || 0,
        status: status,
      });

      if (insErr) {
        console.error('[Supabase addProjectBudgetLine Error]:', insErr.message);
        throw new Error(insErr.message);
      }

      await this.logAuditEvent({
        action: 'BUDGET_REVISED',
        recordType: 'budget',
        recordId: id,
        projectId,
        details: `Menambah baris RAB baru "${fullLine.code} - ${fullLine.divisionName}" (Pagu: Rp ${planned.toLocaleString('id-ID')})`,
        previousValue: 'None',
        newValue: `Pagu Rp ${planned.toLocaleString('id-ID')}`,
        actor: {
          uid: actor?.uid || auth.currentUser?.uid || 'user',
          name: actor?.name || 'Estimator',
          role: actor?.role || 'Quantity Surveyor / Estimator',
          email: actor?.email || auth.currentUser?.email || '',
        },
      }, wsId);

      return id;
    }

    try {
      const lineRef = getProjectSubDoc(projectId, 'budget_lines', id, wsId);
      await setDoc(lineRef, fullLine);

      // Audit log
      await this.logAuditEvent({
        action: 'BUDGET_REVISED',
        recordType: 'budget',
        recordId: id,
        projectId,
        details: `Menambah baris RAB baru "${fullLine.code} - ${fullLine.divisionName}" (Pagu: Rp ${planned.toLocaleString('id-ID')})`,
        previousValue: 'None',
        newValue: `Pagu Rp ${planned.toLocaleString('id-ID')}`,
        actor: {
          uid: actor?.uid || auth.currentUser?.uid || 'user',
          name: actor?.name || 'Estimator',
          role: actor?.role || 'Quantity Surveyor / Estimator',
          email: actor?.email || auth.currentUser?.email || '',
        },
      }, wsId);

      return id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `workspaces/${wsId}/projects/${projectId}/budget_lines/${id}`);
    }
  },

  async updateProjectBudgetLine(
    projectId: string,
    lineId: string,
    updates: Partial<BudgetLine>,
    actor?: ActorInfo,
    oldLine?: BudgetLine,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<void> {
    const now = new Date().toISOString();
    const planned = updates.plannedAmount !== undefined ? Math.round(Number(updates.plannedAmount)) : oldLine?.plannedAmount || 0;
    const actual = updates.actualAmount !== undefined ? Math.round(Number(updates.actualAmount)) : oldLine?.actualAmount || 0;
    const variance = planned - actual;
    const variancePct = planned > 0 ? Number(((variance / planned) * 100).toFixed(2)) : 0;
    const status = actual > planned ? 'Overbudget' : (actual / planned) > 0.85 ? 'Peringatan' : 'Aman';

    if (isSupabaseConfigured()) {
      const ws = resolveWorkspaceId(wsId);
      let pid = projectId;
      const { data: pRow } = await supabase
        .from('projects')
        .select('id, legacy_id')
        .eq('workspace_id', ws)
        .or(`id.eq.${projectId.length === 36 ? projectId : '00000000-0000-0000-0000-000000000000'},legacy_id.eq.${projectId}`)
        .maybeSingle();

      if (pRow) pid = pRow.id;

      const payload: any = { updated_at: now };
      if (updates.code !== undefined) payload.code = updates.code;
      if (updates.divisionName !== undefined) payload.division_name = updates.divisionName;
      if (updates.category !== undefined) payload.category = updates.category;
      if (updates.plannedAmount !== undefined) payload.planned_amount = planned;
      if (updates.actualAmount !== undefined) payload.actual_amount = actual;
      if (updates.unit !== undefined) payload.unit = updates.unit;
      if (updates.volume !== undefined) payload.volume = updates.volume;
      if (updates.unitRate !== undefined) payload.unit_rate = updates.unitRate;
      payload.status = status;

      const { error: upErr } = await supabase
        .from('budget_lines')
        .update(payload)
        .eq('workspace_id', ws)
        .eq('project_id', pid)
        .or(`id.eq.${lineId.length === 36 ? lineId : '00000000-0000-0000-0000-000000000000'},legacy_id.eq.${lineId}`);

      if (upErr) {
        console.error('[Supabase updateProjectBudgetLine Error]:', upErr.message);
        throw new Error(upErr.message);
      }

      await this.logAuditEvent({
        action: 'BUDGET_REVISED',
        recordType: 'budget',
        recordId: lineId,
        projectId,
        details: `Memperbarui baris RAB "${oldLine?.code || lineId} - ${oldLine?.divisionName || ''}": Pagu: Rp ${(oldLine?.plannedAmount || 0).toLocaleString('id-ID')} -> Rp ${planned.toLocaleString('id-ID')}, Realisasi: Rp ${(oldLine?.actualAmount || 0).toLocaleString('id-ID')} -> Rp ${actual.toLocaleString('id-ID')}`,
        previousValue: `Pagu: ${oldLine?.plannedAmount}, Real: ${oldLine?.actualAmount}`,
        newValue: `Pagu: ${planned}, Real: ${actual}`,
        actor: {
          uid: actor?.uid || auth.currentUser?.uid || 'user',
          name: actor?.name || 'Estimator',
          role: actor?.role || 'Quantity Surveyor / Estimator',
          email: actor?.email || auth.currentUser?.email || '',
        },
      }, wsId);

      return;
    }

    try {
      const lineRef = getProjectSubDoc(projectId, 'budget_lines', lineId, wsId);

      const mergedUpdates: Partial<BudgetLine> = {
        ...updates,
        plannedAmount: planned,
        actualAmount: actual,
        varianceAmount: variance,
        variancePercent: variancePct,
        status,
        updatedAt: now,
      };

      await updateDoc(lineRef, mergedUpdates);

      // Audit log recording exact before/after details
      await this.logAuditEvent({
        action: 'BUDGET_REVISED',
        recordType: 'budget',
        recordId: lineId,
        projectId,
        details: `Memperbarui baris RAB "${oldLine?.code || lineId} - ${oldLine?.divisionName || ''}": Pagu: Rp ${(oldLine?.plannedAmount || 0).toLocaleString('id-ID')} -> Rp ${planned.toLocaleString('id-ID')}, Realisasi: Rp ${(oldLine?.actualAmount || 0).toLocaleString('id-ID')} -> Rp ${actual.toLocaleString('id-ID')}`,
        previousValue: `Pagu: ${oldLine?.plannedAmount}, Real: ${oldLine?.actualAmount}`,
        newValue: `Pagu: ${planned}, Real: ${actual}`,
        actor: {
          uid: actor?.uid || auth.currentUser?.uid || 'user',
          name: actor?.name || 'Estimator',
          role: actor?.role || 'Quantity Surveyor / Estimator',
          email: actor?.email || auth.currentUser?.email || '',
        },
      }, wsId);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `workspaces/${wsId}/projects/${projectId}/budget_lines/${lineId}`);
    }
  },

  // =========================================================================
  // 3. PROJECT SUBCOLLECTIONS: MILESTONES (workspaces/{wsId}/projects/{pid}/milestones)
  // =========================================================================
  subscribeProjectMilestones(
    projectId: string,
    callback: (milestones: Milestone[]) => void,
    onError?: (err: any) => void,
    wsId = DEFAULT_WORKSPACE_ID
  ) {
    if (!projectId) return () => {};
    if (isSupabaseConfigured()) {
      supabaseDataService.getProjectSubcollections(projectId, wsId).then((res) => {
        callback(res.milestones);
      }).catch((err) => {
        if (onError) onError(err);
      });
      return () => {};
    }
    const colRef = getProjectSubCol(projectId, 'milestones', wsId);
    return onSnapshot(
      colRef,
      (snapshot) => {
        const items: Milestone[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });
        items.sort((a, b) => (a.plannedDate || '').localeCompare(b.plannedDate || ''));
        callback(items);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, `workspaces/${wsId}/projects/${projectId}/milestones`);
      }
    );
  },

  async signOffProjectMilestone(
    projectId: string,
    milestoneId: string,
    signerName: string,
    bastRef: string,
    notes?: string,
    actor?: ActorInfo,
    milestoneTitle?: string,
    projectName?: string,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<void> {
    const now = new Date().toISOString();

    try {
      // 1. Try server-side workflow endpoint first
      await callWorkflowApi('milestone-signoff', {
        milestoneId,
        projectId,
        bastRef,
        notes: notes || '',
      });
    } catch {
      if (isSupabaseConfigured()) {
        const ws = resolveWorkspaceId(wsId);
        let pid = projectId;
        const { data: pRow } = await supabase
          .from('projects')
          .select('id, legacy_id, completed_milestones')
          .eq('workspace_id', ws)
          .or(`id.eq.${projectId.length === 36 ? projectId : '00000000-0000-0000-0000-000000000000'},legacy_id.eq.${projectId}`)
          .maybeSingle();

        if (pRow) {
          pid = pRow.id;
          const currentCompleted = Number(pRow.completed_milestones) || 0;
          await supabase
            .from('projects')
            .update({
              completed_milestones: currentCompleted + 1,
              updated_at: now,
            })
            .eq('id', pid);
        }

        await supabase
          .from('milestones')
          .update({
            status: 'Selesai',
            progress: 100,
            bast_ref: bastRef || 'BA-OPNAME-01.pdf',
            actual_date: now.split('T')[0],
            signed_off_at: now,
            signed_off_by_name: signerName,
            updated_at: now,
          })
          .eq('workspace_id', ws)
          .eq('project_id', pid)
          .or(`id.eq.${milestoneId.length === 36 ? milestoneId : '00000000-0000-0000-0000-000000000000'},legacy_id.eq.${milestoneId}`);

        await this.logAuditEvent({
          action: 'MILESTONE_SIGNED_OFF',
          recordType: 'milestone',
          recordId: milestoneId,
          projectId,
          projectName: projectName || '',
          details: `Pengesahan BAST Fisik Milestone: "${milestoneTitle || milestoneId}" disetujui oleh ${signerName} (Ref: ${bastRef})`,
          previousValue: 'Menunggu',
          newValue: 'Selesai (100%)',
          actor: {
            uid: actor?.uid || auth.currentUser?.uid || 'user',
            name: signerName,
            role: actor?.role || 'Project Manager',
            email: actor?.email || auth.currentUser?.email || '',
          },
        }, wsId);

        return;
      }

      // 2. Direct client Firestore transaction fallback
      const msRef = getProjectSubDoc(projectId, 'milestones', milestoneId, wsId);
      const projRef = getWorkspaceDoc('projects', projectId, wsId);

      await runTransaction(db, async (tx) => {
        const msSnap = await tx.get(msRef);
        if (!msSnap.exists()) throw new Error('Milestone tidak ditemukan di Firestore.');
        const curMs = msSnap.data();
        if (curMs.status === 'Selesai') throw new Error('Milestone sudah disahkan sebelumnya.');

        const projSnap = await tx.get(projRef);
        let completedCount = 1;
        if (projSnap.exists()) {
          completedCount = (Number(projSnap.data().completedMilestones) || 0) + 1;
          tx.update(projRef, {
            completedMilestones: completedCount,
            updatedAt: now,
          });
        }

        tx.update(msRef, {
          status: 'Selesai',
          progress: 100,
          signedOffBy: signerName,
          signedOffByUid: actor?.uid || auth.currentUser?.uid || 'user',
          signedOffAt: now,
          bastRef: bastRef || 'BA-OPNAME-01.pdf',
          updatedAt: now,
        });

        // Audit log inside batch/transaction
        const auditId = `aud-${Date.now().toString(36)}`;
        tx.set(getWorkspaceDoc('audit_logs', auditId, wsId), {
          id: auditId,
          action: 'MILESTONE_SIGNED',
          recordType: 'milestone',
          recordId: milestoneId,
          projectId,
          projectName: projectName || '',
          details: `Pengesahan BAST Fisik Milestone: "${milestoneTitle || curMs.title}" disetujui oleh ${signerName} (Ref: ${bastRef})`,
          previousValue: curMs.status,
          newValue: 'Selesai (100%)',
          actor: {
            uid: actor?.uid || auth.currentUser?.uid || 'user',
            name: signerName,
            role: actor?.role || 'Project Manager',
            email: actor?.email || auth.currentUser?.email || '',
          },
          timestamp: now,
          correlationId: `bast-${Date.now()}`,
        });
      });
    }
  },

  // =========================================================================
  // 4. PROJECT SUBCOLLECTIONS: WBS ITEMS (workspaces/{wsId}/projects/{pid}/wbs_items)
  // =========================================================================
  subscribeProjectWBS(
    projectId: string,
    callback: (items: WBSItem[]) => void,
    onError?: (err: any) => void,
    wsId = DEFAULT_WORKSPACE_ID
  ) {
    if (!projectId) return () => {};
    if (isSupabaseConfigured()) {
      supabaseDataService.getProjectSubcollections(projectId, wsId).then((res) => {
        callback(res.wbsList);
      }).catch((err) => {
        if (onError) onError(err);
      });
      return () => {};
    }
    const colRef = getProjectSubCol(projectId, 'wbs_items', wsId);
    return onSnapshot(
      colRef,
      (snapshot) => {
        const items: WBSItem[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });
        items.sort((a, b) => a.code.localeCompare(b.code));
        callback(items);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, `workspaces/${wsId}/projects/${projectId}/wbs_items`);
      }
    );
  },

  async updateProjectWBSProgress(
    projectId: string,
    wbsId: string,
    actualProgress: number,
    status: WBSItem['status'],
    actor?: ActorInfo,
    wbsName?: string,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<void> {
    const now = new Date().toISOString();
    const boundedProgress = Math.min(100, Math.max(0, actualProgress));

    if (isSupabaseConfigured()) {
      const ws = resolveWorkspaceId(wsId);
      let pid = projectId;
      const { data: pRow } = await supabase
        .from('projects')
        .select('id, legacy_id')
        .eq('workspace_id', ws)
        .or(`id.eq.${projectId.length === 36 ? projectId : '00000000-0000-0000-0000-000000000000'},legacy_id.eq.${projectId}`)
        .maybeSingle();

      if (pRow) pid = pRow.id;

      const { error: upErr } = await supabase
        .from('wbs_items')
        .update({
          actual_progress: boundedProgress,
          status,
          updated_at: now,
        })
        .eq('workspace_id', ws)
        .eq('project_id', pid)
        .or(`id.eq.${wbsId.length === 36 ? wbsId : '00000000-0000-0000-0000-000000000000'},legacy_id.eq.${wbsId}`);

      if (upErr) {
        console.error('[Supabase updateProjectWBSProgress Error]:', upErr.message);
        throw new Error(upErr.message);
      }

      await this.logAuditEvent({
        action: 'SCHEDULE_UPDATED',
        recordType: 'project',
        recordId: wbsId,
        projectId,
        details: `Mengubah progres pekerjaan WBS "${wbsName || wbsId}" menjadi ${boundedProgress}% (Status: ${status})`,
        previousValue: 'Previous Progress',
        newValue: `${boundedProgress}% (${status})`,
        actor: {
          uid: actor?.uid || auth.currentUser?.uid || 'user',
          name: actor?.name || 'Supervisor',
          role: actor?.role || 'Site Manager / Supervisor',
          email: actor?.email || auth.currentUser?.email || '',
        },
      }, wsId);

      return;
    }

    try {
      const wbsRef = getProjectSubDoc(projectId, 'wbs_items', wbsId, wsId);

      await updateDoc(wbsRef, {
        actualProgress: boundedProgress,
        status,
        updatedAt: now,
      });

      // Audit Log
      await this.logAuditEvent({
        action: 'SCHEDULE_UPDATED',
        recordType: 'project',
        recordId: wbsId,
        projectId,
        details: `Mengubah progres pekerjaan WBS "${wbsName || wbsId}" menjadi ${actualProgress}% (Status: ${status})`,
        previousValue: 'Previous Progress',
        newValue: `${actualProgress}% (${status})`,
        actor: {
          uid: actor?.uid || auth.currentUser?.uid || 'user',
          name: actor?.name || 'Supervisor',
          role: actor?.role || 'Site Manager / Supervisor',
          email: actor?.email || auth.currentUser?.email || '',
        },
      }, wsId);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `workspaces/${wsId}/projects/${projectId}/wbs_items/${wbsId}`);
    }
  },

  // =========================================================================
  // 5. BUDGET VERSIONS & ADDENDA (workspaces/{wsId}/projects/{pid}/budget_versions)
  // =========================================================================
  subscribeProjectBudgetVersions(
    projectId: string,
    callback: (versions: BudgetVersion[]) => void,
    onError?: (err: any) => void,
    wsId = DEFAULT_WORKSPACE_ID
  ) {
    if (!projectId) return () => {};
    if (isSupabaseConfigured()) {
      supabaseDataService.getProjectSubcollections(projectId, wsId).then((res) => {
        callback(res.budgetVersions);
      }).catch((err) => {
        if (onError) onError(err);
      });
      return () => {};
    }
    const colRef = getProjectSubCol(projectId, 'budget_versions', wsId);
    return onSnapshot(
      colRef,
      (snapshot) => {
        const items: BudgetVersion[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });
        items.sort((a, b) => new Date(a.createdAt || a.effectiveDate).getTime() - new Date(b.createdAt || b.effectiveDate).getTime());
        callback(items);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, `workspaces/${wsId}/projects/${projectId}/budget_versions`);
      }
    );
  },

  async getProjectSubcollections(
    projectId: string,
    forceRefresh = false,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<{
    budgetLines: BudgetLine[];
    milestones: Milestone[];
    wbsList: WBSItem[];
    budgetVersions: BudgetVersion[];
  }> {
    if (isSupabaseConfigured()) {
      return await supabaseDataService.getProjectSubcollections(projectId, wsId);
    }
    const cacheKey = `subcols_${projectId}_${wsId}`;
    if (!forceRefresh) {
      const cached = getCachedItem<any>(cacheKey);
      if (cached) return cached;
    }

    try {
      const [linesSnap, msSnap, wbsSnap, verSnap] = await Promise.all([
        getDocs(getProjectSubCol(projectId, 'budget_lines', wsId)),
        getDocs(getProjectSubCol(projectId, 'milestones', wsId)),
        getDocs(getProjectSubCol(projectId, 'wbs_items', wsId)),
        getDocs(getProjectSubCol(projectId, 'budget_versions', wsId)),
      ]);

      const budgetLines: BudgetLine[] = [];
      linesSnap.forEach((d) => budgetLines.push({ id: d.id, ...(d.data() as any) }));
      budgetLines.sort((a, b) => (a.code || '').localeCompare(b.code || ''));

      const milestones: Milestone[] = [];
      msSnap.forEach((d) => milestones.push({ id: d.id, ...(d.data() as any) }));
      milestones.sort((a, b) => (a.plannedDate || '').localeCompare(b.plannedDate || ''));

      const wbsList: WBSItem[] = [];
      wbsSnap.forEach((d) => wbsList.push({ id: d.id, ...(d.data() as any) }));
      wbsList.sort((a, b) => (a.code || '').localeCompare(b.code || ''));

      const budgetVersions: BudgetVersion[] = [];
      verSnap.forEach((d) => budgetVersions.push({ id: d.id, ...(d.data() as any) }));
      budgetVersions.sort((a, b) => (b.versionNumber || '').localeCompare(a.versionNumber || ''));

      const result = { budgetLines, milestones, wbsList, budgetVersions };
      setCachedItem(cacheKey, result);
      return result;
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        try {
          const [linesSnap, msSnap, wbsSnap, verSnap] = await Promise.all([
            getDocsFromCache(getProjectSubCol(projectId, 'budget_lines', wsId)),
            getDocsFromCache(getProjectSubCol(projectId, 'milestones', wsId)),
            getDocsFromCache(getProjectSubCol(projectId, 'wbs_items', wsId)),
            getDocsFromCache(getProjectSubCol(projectId, 'budget_versions', wsId)),
          ]);
          const budgetLines: BudgetLine[] = [];
          linesSnap.forEach((d) => budgetLines.push({ id: d.id, ...(d.data() as any) }));
          const milestones: Milestone[] = [];
          msSnap.forEach((d) => milestones.push({ id: d.id, ...(d.data() as any) }));
          const wbsList: WBSItem[] = [];
          wbsSnap.forEach((d) => wbsList.push({ id: d.id, ...(d.data() as any) }));
          const budgetVersions: BudgetVersion[] = [];
          verSnap.forEach((d) => budgetVersions.push({ id: d.id, ...(d.data() as any) }));
          return { budgetLines, milestones, wbsList, budgetVersions };
        } catch {
          // ignore
        }
      }
      handleFirestoreError(err, OperationType.GET, `workspaces/${wsId}/projects/${projectId}/subcollections`);
    }
  },

  // =========================================================================
  // 6. BUDGET REVISIONS WORKFLOW (workspaces/{wsId}/budget_revisions)
  // =========================================================================
  subscribeBudgetRevisions(
    callback: (revisions: BudgetRevision[]) => void,
    onError?: (err: any) => void,
    wsId = DEFAULT_WORKSPACE_ID
  ) {
    if (isSupabaseConfigured()) {
      return supabaseDataService.subscribeBudgetRevisions(callback, wsId);
    }
    const colRef = getWorkspaceCol('budget_revisions', wsId);
    const q = query(colRef, limit(50));
    return onSnapshot(
      q,
      (snapshot) => {
        const items: BudgetRevision[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });
        items.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
        callback(items);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, `workspaces/${wsId}/budget_revisions`);
      }
    );
  },

  async getBudgetRevisions(forceRefresh = false, wsId = DEFAULT_WORKSPACE_ID): Promise<BudgetRevision[]> {
    if (isSupabaseConfigured()) {
      return await supabaseDataService.getBudgetRevisions(wsId);
    }
    const cacheKey = `budget_revs_${wsId}`;
    if (!forceRefresh) {
      const cached = getCachedItem<BudgetRevision[]>(cacheKey);
      if (cached) return cached;
    }
    const colRef = getWorkspaceCol('budget_revisions', wsId);
    try {
      const snap = await getDocs(query(colRef, limit(50)));
      const items: BudgetRevision[] = [];
      snap.forEach((docSnap) => items.push({ id: docSnap.id, ...(docSnap.data() as any) }));
      items.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
      setCachedItem(cacheKey, items);
      return items;
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        try {
          const cacheSnap = await getDocsFromCache(query(colRef, limit(50)));
          const items: BudgetRevision[] = [];
          cacheSnap.forEach((docSnap) => items.push({ id: docSnap.id, ...(docSnap.data() as any) }));
          if (items.length > 0) return items;
        } catch {}
      }
      handleFirestoreError(err, OperationType.GET, `workspaces/${wsId}/budget_revisions`);
    }
  },

  async submitBudgetRevision(
    revData: Omit<BudgetRevision, 'id' | 'revisionNumber' | 'status' | 'submittedAt'>,
    actor?: ActorInfo,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<string> {
    const id = `rev-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const docNumber = await this.generateDocumentNumber('ADD-REV', revData.projectName || 'IND', wsId);

    const orig = Math.round(Number(revData.originalAmount) || 0);
    const prop = Math.round(Number(revData.proposedAmount) || 0);
    const variance = prop - orig;

    const fullRecord: BudgetRevision = {
      ...revData,
      id,
      revisionNumber: docNumber,
      originalAmount: orig,
      proposedAmount: prop,
      varianceAmount: variance,
      status: 'Menunggu',
      submittedBy: actor?.name || 'Estimator',
      submittedByUid: actor?.uid || auth.currentUser?.uid,
      submittedAt: now,
      createdAt: now,
    };

    try {
      const docRef = getWorkspaceDoc('budget_revisions', id, wsId);
      await setDoc(docRef, fullRecord);

      await this.logAuditEvent({
        action: 'BUDGET_REVISED',
        recordType: 'budget',
        recordId: id,
        projectId: revData.projectId,
        projectName: revData.projectName,
        details: `Mengajukan Addendum Revisi Anggaran ${docNumber} (${revData.divisionName}: +Rp ${variance.toLocaleString('id-ID')})`,
        previousValue: 'None',
        newValue: 'Menunggu Persetujuan Direksi',
        actor: {
          uid: actor?.uid || auth.currentUser?.uid || 'user',
          name: actor?.name || 'Estimator',
          role: actor?.role || 'Quantity Surveyor / Estimator',
          email: actor?.email || auth.currentUser?.email || '',
        },
      }, wsId);

      return id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `workspaces/${wsId}/budget_revisions/${id}`);
    }
  },

  async approveBudgetRevision(
    revId: string,
    approverName: string,
    actor?: ActorInfo,
    allRevisions: BudgetRevision[] = [],
    existingLines: BudgetLine[] = [],
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<void> {
    const now = new Date().toISOString();

    try {
      // 1. Try server workflow
      await callWorkflowApi('budget-revision', {
        action: 'approve',
        revId,
      });
    } catch {
      // 2. Direct client transactional update with version snapshot
      const revRef = getWorkspaceDoc('budget_revisions', revId, wsId);
      const revSnap = await getDoc(revRef);
      if (!revSnap.exists()) throw new Error('Revisi Anggaran tidak ditemukan.');
      const currentRev = revSnap.data() as BudgetRevision;

      const pid = currentRev.projectId;
      const projRef = getWorkspaceDoc('projects', pid, wsId);

      // Match budget line in project subcollection
      const blColRef = getProjectSubCol(pid, 'budget_lines', wsId);
      const blDocs = await getDocs(blColRef);
      let targetLineDoc: any = null;
      blDocs.forEach((d) => {
        const dData = d.data();
        if (dData.divisionName === currentRev.divisionName || dData.category === currentRev.divisionName) {
          targetLineDoc = d;
        }
      });

      const batch = writeBatch(db);

      // Update revision status
      batch.update(revRef, {
        status: 'Disetujui',
        reviewedBy: approverName,
        reviewedByUid: actor?.uid || auth.currentUser?.uid,
        reviewedAt: now,
        updatedAt: now,
      });

      // Update matching budget line
      let oldPlanned = currentRev.originalAmount;
      const newPlanned = currentRev.proposedAmount;
      if (targetLineDoc) {
        oldPlanned = targetLineDoc.data().plannedAmount || oldPlanned;
        const actual = targetLineDoc.data().actualAmount || 0;
        const variance = newPlanned - actual;
        batch.update(targetLineDoc.ref, {
          plannedAmount: newPlanned,
          varianceAmount: variance,
          variancePercent: newPlanned > 0 ? Number(((variance / newPlanned) * 100).toFixed(2)) : 0,
          updatedAt: now,
        });
      }

      // Update Project approvedBudget
      const projSnap = await getDoc(projRef);
      let oldProjBudget = 0;
      let newProjBudget = 0;
      if (projSnap.exists()) {
        const pData = projSnap.data() as Project;
        oldProjBudget = pData.approvedBudget || 0;
        newProjBudget = oldProjBudget + (currentRev.varianceAmount || (newPlanned - oldPlanned));
        batch.update(projRef, {
          approvedBudget: newProjBudget,
          updatedAt: now,
        });
      }

      // Record BudgetVersion record: "Addendum N (ADD-REV-...)"
      const versionId = `ver-${pid}-${Date.now().toString(36)}`;
      const verRef = getProjectSubDoc(pid, 'budget_versions', versionId, wsId);
      const verRecord: BudgetVersion = {
        id: versionId,
        projectId: pid,
        versionNumber: `Addendum (${currentRev.revisionNumber})`,
        effectiveDate: now,
        approvedBy: approverName,
        approvedByUid: actor?.uid || auth.currentUser?.uid,
        revisionId: revId,
        revisionNumber: currentRev.revisionNumber,
        totalPlannedAmount: newProjBudget || newPlanned,
        description: `Persetujuan ${currentRev.revisionNumber} (${currentRev.divisionName}): pagu disesuaikan menjadi Rp ${newPlanned.toLocaleString('id-ID')}`,
        divisionAmounts: {
          [currentRev.divisionName]: newPlanned,
        },
        notes: currentRev.justification,
        createdAt: now,
      };
      batch.set(verRef, verRecord);

      // Record Audit Log
      const auditId = `aud-${Date.now().toString(36)}`;
      batch.set(getWorkspaceDoc('audit_logs', auditId, wsId), {
        id: auditId,
        action: 'BUDGET_APPROVED',
        recordType: 'budget',
        recordId: revId,
        projectId: pid,
        projectName: currentRev.projectName,
        details: `Menyetujui Addendum Revisi Anggaran ${currentRev.revisionNumber} (${currentRev.divisionName}): Nilai pagu berubah dari Rp ${oldPlanned.toLocaleString('id-ID')} menjadi Rp ${newPlanned.toLocaleString('id-ID')}`,
        previousValue: `Rp ${oldPlanned.toLocaleString('id-ID')}`,
        newValue: `Rp ${newPlanned.toLocaleString('id-ID')}`,
        actor: {
          uid: actor?.uid || auth.currentUser?.uid || 'user',
          name: approverName,
          role: actor?.role || 'Owner / Director',
          email: actor?.email || auth.currentUser?.email || '',
        },
        timestamp: now,
        correlationId: `add-${Date.now()}`,
      });

      await batch.commit();
    }
  },

  async rejectBudgetRevision(
    revId: string,
    rejectorName: string,
    rejectionReason: string,
    actor?: ActorInfo,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<void> {
    try {
      await callWorkflowApi('budget-revision', {
        action: 'reject',
        revId,
        rejectionReason,
      });
    } catch {
      const revRef = getWorkspaceDoc('budget_revisions', revId, wsId);
      const now = new Date().toISOString();
      await updateDoc(revRef, {
        status: 'Ditolak',
        reviewedBy: rejectorName,
        reviewedByUid: actor?.uid || auth.currentUser?.uid,
        reviewedAt: now,
        rejectionReason,
        updatedAt: now,
      });

      await this.logAuditEvent({
        action: 'BUDGET_REVISED',
        recordType: 'budget',
        recordId: revId,
        details: `Menolak Addendum Revisi Anggaran ${revId} oleh ${rejectorName}. Alasan: ${rejectionReason}`,
        actor: {
          uid: actor?.uid || auth.currentUser?.uid || 'user',
          name: rejectorName,
          role: actor?.role || 'Owner / Director',
          email: actor?.email || auth.currentUser?.email || '',
        },
      }, wsId);
    }
  },

  // =========================================================================
  // 7. PURCHASE ORDERS & PROCUREMENT (workspaces/{wsId}/purchase_orders)
  // =========================================================================
  subscribePurchaseOrders(
    callback: (orders: PurchaseOrder[]) => void,
    onError?: (err: any) => void,
    wsId = DEFAULT_WORKSPACE_ID
  ) {
    if (isSupabaseConfigured()) {
      return supabaseDataService.subscribePurchaseOrders(callback, wsId);
    }
    const colRef = getWorkspaceCol('purchase_orders', wsId);
    const q = query(colRef, limit(50));
    return onSnapshot(
      q,
      (snapshot) => {
        const items: PurchaseOrder[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });
        items.sort((a, b) => new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime());
        callback(items);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, `workspaces/${wsId}/purchase_orders`);
      }
    );
  },

  async getPurchaseOrdersPaginated(
    limitCount = 50,
    lastDoc?: any,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<PaginatedResult<PurchaseOrder>> {
    if (isSupabaseConfigured()) {
      const items = await supabaseDataService.getPurchaseOrders(wsId);
      return {
        items: items.slice(0, limitCount),
        lastDoc: null,
        hasMore: items.length > limitCount,
      };
    }
    try {
      const colRef = getWorkspaceCol('purchase_orders', wsId);
      let q = query(colRef, limit(limitCount));
      if (lastDoc) {
        q = query(colRef, startAfter(lastDoc), limit(limitCount));
      }
      const snap = await getDocs(q);
      const items: PurchaseOrder[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...(d.data() as any) }));
      items.sort((a, b) => new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime());
      const newLastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
      return {
        items,
        lastDoc: newLastDoc,
        hasMore: snap.docs.length === limitCount,
      };
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        return { items: [], lastDoc: null, hasMore: false };
      }
      handleFirestoreError(err, OperationType.GET, `workspaces/${wsId}/purchase_orders`);
    }
  },

  async addPurchaseOrder(
    poData: Omit<PurchaseOrder, 'id' | 'poNumber' | 'status'>,
    actor?: ActorInfo,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<string> {
    const id = `po-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const poNumber = await this.generateDocumentNumber('PO', poData.projectName || 'IND', wsId);

    const fullPO: PurchaseOrder = {
      ...poData,
      id,
      poNumber,
      status: 'Menunggu',
      requester: actor?.name || 'Staf Pengadaan',
      requesterUid: actor?.uid || auth.currentUser?.uid,
      createdAt: now,
      updatedAt: now,
    };

    try {
      const docRef = getWorkspaceDoc('purchase_orders', id, wsId);
      await setDoc(docRef, fullPO);

      await this.logAuditEvent({
        action: 'PO_CREATED',
        recordType: 'purchase_order',
        recordId: id,
        projectId: poData.projectId,
        projectName: poData.projectName,
        details: `Menerbitkan pengajuan PO ${poNumber} untuk ${poData.supplierName} (Total: Rp ${poData.totalCost.toLocaleString('id-ID')})`,
        actor: {
          uid: actor?.uid || auth.currentUser?.uid || 'user',
          name: actor?.name || 'Pengadaan',
          role: actor?.role || 'Procurement',
          email: actor?.email || auth.currentUser?.email || '',
        },
      }, wsId);

      return id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `workspaces/${wsId}/purchase_orders/${id}`);
    }
  },

  async approvePurchaseOrder(
    poId: string,
    approverName: string,
    actor?: ActorInfo,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<void> {
    const now = new Date().toISOString();
    try {
      await callWorkflowApi('purchase-order', {
        action: 'approve',
        poId,
      });
    } catch {
      const poRef = getWorkspaceDoc('purchase_orders', poId, wsId);
      await updateDoc(poRef, {
        status: 'Disetujui',
        approvedBy: approverName,
        approvedByUid: actor?.uid || auth.currentUser?.uid,
        approvedAt: now,
        updatedAt: now,
      });

      await this.logAuditEvent({
        action: 'PO_APPROVED',
        recordType: 'purchase_order',
        recordId: poId,
        details: `Menyetujui Purchase Order ${poId} oleh ${approverName}`,
        actor: {
          uid: actor?.uid || auth.currentUser?.uid || 'user',
          name: approverName,
          role: actor?.role || 'Owner / Director',
          email: actor?.email || auth.currentUser?.email || '',
        },
      }, wsId);
    }
  },

  async rejectPurchaseOrder(
    poId: string,
    rejectorName: string,
    rejectionReason: string,
    actor?: ActorInfo,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<void> {
    const now = new Date().toISOString();
    try {
      await callWorkflowApi('purchase-order', {
        action: 'reject',
        poId,
        rejectionReason,
      });
    } catch {
      const poRef = getWorkspaceDoc('purchase_orders', poId, wsId);
      await updateDoc(poRef, {
        status: 'Ditolak',
        rejectedBy: rejectorName,
        rejectedByUid: actor?.uid || auth.currentUser?.uid,
        rejectedAt: now,
        rejectionReason,
        updatedAt: now,
      });

      await this.logAuditEvent({
        action: 'PO_REJECTED',
        recordType: 'purchase_order',
        recordId: poId,
        details: `Menolak Purchase Order ${poId}. Alasan: ${rejectionReason}`,
        actor: {
          uid: actor?.uid || auth.currentUser?.uid || 'user',
          name: rejectorName,
          role: actor?.role || 'Owner / Director',
          email: actor?.email || auth.currentUser?.email || '',
        },
      }, wsId);
    }
  },

  // =========================================================================
  // 8. MATERIALS & INVENTORY (workspaces/{wsId}/materials)
  // =========================================================================
  subscribeMaterials(
    callback: (materials: MaterialItem[]) => void,
    onError?: (err: any) => void,
    wsId = DEFAULT_WORKSPACE_ID
  ) {
    if (isSupabaseConfigured()) {
      return supabaseDataService.subscribeMaterials(callback, wsId);
    }
    const colRef = getWorkspaceCol('materials', wsId);
    return onSnapshot(
      colRef,
      (snapshot) => {
        const items: MaterialItem[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });
        items.sort((a, b) => a.code.localeCompare(b.code));
        callback(items);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, `workspaces/${wsId}/materials`);
      }
    );
  },

  async getMaterials(forceRefresh = false, wsId = DEFAULT_WORKSPACE_ID): Promise<MaterialItem[]> {
    if (isSupabaseConfigured()) {
      return await supabaseDataService.getMaterials(wsId);
    }
    const cacheKey = `materials_${wsId}`;
    if (!forceRefresh) {
      const cached = getCachedItem<MaterialItem[]>(cacheKey);
      if (cached) return cached;
    }
    const colRef = getWorkspaceCol('materials', wsId);
    try {
      const snap = await getDocs(colRef);
      const items: MaterialItem[] = [];
      snap.forEach((docSnap) => items.push({ id: docSnap.id, ...(docSnap.data() as any) }));
      items.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
      setCachedItem(cacheKey, items);
      return items;
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        try {
          const cacheSnap = await getDocsFromCache(colRef);
          const items: MaterialItem[] = [];
          cacheSnap.forEach((docSnap) => items.push({ id: docSnap.id, ...(docSnap.data() as any) }));
          if (items.length > 0) return items;
        } catch {}
      }
      handleFirestoreError(err, OperationType.GET, `workspaces/${wsId}/materials`);
    }
  },

  async getStockMutationsPaginated(
    limitCount = 50,
    lastDoc?: any,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<PaginatedResult<StockMutation>> {
    if (isSupabaseConfigured()) {
      const items = await supabaseDataService.getStockMutations(wsId);
      return {
        items: items.slice(0, limitCount),
        lastDoc: null,
        hasMore: items.length > limitCount,
      };
    }
    try {
      const colRef = getWorkspaceCol('stock_mutations', wsId);
      let q = query(colRef, limit(limitCount));
      if (lastDoc) {
        q = query(colRef, startAfter(lastDoc), limit(limitCount));
      }
      const snap = await getDocs(q);
      const items: StockMutation[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...(d.data() as any) }));
      items.sort((a, b) => new Date(b.date || b.createdAt || '').getTime() - new Date(a.date || a.createdAt || '').getTime());
      const newLastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
      return {
        items,
        lastDoc: newLastDoc,
        hasMore: snap.docs.length === limitCount,
      };
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        return { items: [], lastDoc: null, hasMore: false };
      }
      handleFirestoreError(err, OperationType.GET, `workspaces/${wsId}/stock_mutations`);
    }
  },

  async addStockMutation(
    mutationData: Omit<StockMutation, 'id'>,
    currentMaterial?: MaterialItem,
    actor?: ActorInfo,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<string> {
    const id = `mut-${Date.now().toString(36)}`;
    const now = new Date().toISOString();

    try {
      await callWorkflowApi('stock-mutation', {
        materialId: mutationData.materialId,
        type: mutationData.type,
        quantity: mutationData.quantity,
        referenceNo: mutationData.referenceNo,
        project: mutationData.project,
        handler: mutationData.handler,
      });
      return id;
    } catch {
      // Direct Firestore transaction fallback
      const matRef = getWorkspaceDoc('materials', mutationData.materialId, wsId);
      const mutRef = getWorkspaceDoc('stock_mutations', id, wsId);

      await runTransaction(db, async (tx) => {
        const matSnap = await tx.get(matRef);
        if (!matSnap.exists()) throw new Error('Material tidak ditemukan di Firestore.');
        const mat = matSnap.data() as MaterialItem;
        const curStock = mat.currentStock || 0;

        let newStock = curStock;
        if (mutationData.type === 'Masuk') {
          newStock += mutationData.quantity;
        } else {
          if (curStock < mutationData.quantity) {
            throw new Error(`Stok tidak mencukupi: Tersedia ${curStock} ${mat.unit}, diminta ${mutationData.quantity} ${mat.unit}.`);
          }
          newStock -= mutationData.quantity;
        }

        const newStatus = newStock <= 0 ? 'Kritis' : newStock <= mat.minStock ? 'Menipis' : 'Aman';

        tx.update(matRef, {
          currentStock: newStock,
          status: newStatus,
          updatedAt: now,
        });

        tx.set(mutRef, {
          ...mutationData,
          id,
          createdAt: now,
        });

        // Audit log
        const auditId = `aud-${Date.now().toString(36)}`;
        tx.set(getWorkspaceDoc('audit_logs', auditId, wsId), {
          id: auditId,
          action: 'STOCK_MUTATION_RECORDED',
          recordType: 'material',
          recordId: mutationData.materialId,
          details: `Mutasi stok ${mutationData.type} ${mutationData.quantity} ${mutationData.unit} untuk ${mat.name} (${mutationData.referenceNo}). Stok sisa: ${newStock}`,
          actor: {
            uid: actor?.uid || auth.currentUser?.uid || 'user',
            name: mutationData.handler,
            role: actor?.role || 'Warehouse / Inventory',
            email: actor?.email || auth.currentUser?.email || '',
          },
          timestamp: now,
          correlationId: `mut-${Date.now()}`,
        });
      });

      return id;
    }
  },

  // =========================================================================
  // 9. FIELD REPORTS (workspaces/{wsId}/field_reports)
  // =========================================================================
  subscribeFieldReports(
    callback: (reports: FieldReport[]) => void,
    onError?: (err: any) => void,
    wsId = DEFAULT_WORKSPACE_ID
  ) {
    if (isSupabaseConfigured()) {
      return supabaseDataService.subscribeFieldReports(callback, wsId);
    }
    const colRef = getWorkspaceCol('field_reports', wsId);
    const q = query(colRef, limit(50));
    return onSnapshot(
      q,
      (snapshot) => {
        const items: FieldReport[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });
        items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        callback(items);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, `workspaces/${wsId}/field_reports`);
      }
    );
  },

  async getFieldReportsPaginated(
    limitCount = 50,
    lastDoc?: any,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<PaginatedResult<FieldReport>> {
    if (isSupabaseConfigured()) {
      const items = await supabaseDataService.getFieldReports(wsId);
      return {
        items: items.slice(0, limitCount),
        lastDoc: null,
        hasMore: items.length > limitCount,
      };
    }
    try {
      const colRef = getWorkspaceCol('field_reports', wsId);
      let q = query(colRef, limit(limitCount));
      if (lastDoc) {
        q = query(colRef, startAfter(lastDoc), limit(limitCount));
      }
      const snap = await getDocs(q);
      const items: FieldReport[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...(d.data() as any) }));
      items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const newLastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
      return {
        items,
        lastDoc: newLastDoc,
        hasMore: snap.docs.length === limitCount,
      };
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        return { items: [], lastDoc: null, hasMore: false };
      }
      handleFirestoreError(err, OperationType.GET, `workspaces/${wsId}/field_reports`);
    }
  },

  async addFieldReport(
    reportData: Omit<FieldReport, 'id' | 'reportNumber' | 'status'>,
    actor?: ActorInfo,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<string> {
    const id = `fr-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const docNumber = await this.generateDocumentNumber('LHP', reportData.projectName || 'IND', wsId);

    const fullReport: FieldReport = {
      ...reportData,
      id,
      reportNumber: docNumber,
      status: 'Draft',
      siteSupervisor: actor?.name || reportData.siteSupervisor || 'Site Supervisor',
      siteSupervisorUid: actor?.uid || auth.currentUser?.uid,
      createdAt: now,
      updatedAt: now,
    };

    try {
      const docRef = getWorkspaceDoc('field_reports', id, wsId);
      await setDoc(docRef, fullReport);

      await this.logAuditEvent({
        action: 'FIELD_REPORT_SUBMITTED',
        recordType: 'field_report',
        recordId: id,
        projectId: reportData.projectId,
        projectName: reportData.projectName,
        details: `Mengirimkan Laporan Harian Proyek (LHP) ${docNumber} untuk ${reportData.projectName}`,
        actor: {
          uid: actor?.uid || auth.currentUser?.uid || 'user',
          name: actor?.name || 'Site Supervisor',
          role: actor?.role || 'Site Manager / Supervisor',
          email: actor?.email || auth.currentUser?.email || '',
        },
      }, wsId);

      return id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `workspaces/${wsId}/field_reports/${id}`);
    }
  },

  async reviewFieldReport(
    reportId: string,
    reviewerName: string,
    status: FieldReportStatus,
    reviewerNotes?: string,
    actor?: ActorInfo,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<void> {
    const now = new Date().toISOString();
    try {
      await updateDoc(getWorkspaceDoc('field_reports', reportId, wsId), {
        status,
        updatedAt: now,
      });

      await this.logAuditEvent({
        action: status === 'Disetujui' ? 'FIELD_REPORT_APPROVED' : 'FIELD_REPORT_SUBMITTED',
        recordType: 'field_report',
        recordId: reportId,
        details: `Verifikasi LHP ${reportId}: Status diubah menjadi "${status}". Catatan: ${reviewerNotes || '-'}`,
        actor: {
          uid: actor?.uid || auth.currentUser?.uid || 'user',
          name: reviewerName,
          role: actor?.role || 'Project Manager',
          email: actor?.email || auth.currentUser?.email || '',
        },
      }, wsId);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `workspaces/${wsId}/field_reports/${reportId}`);
    }
  },

  // =========================================================================
  // 10. PETTY CASH & KAS KECIL (workspaces/{wsId}/petty_cash)
  // =========================================================================
  subscribePettyCash(
    callback: (entries: PettyCashEntry[]) => void,
    onError?: (err: any) => void,
    wsId = DEFAULT_WORKSPACE_ID
  ) {
    if (isSupabaseConfigured()) {
      return supabaseDataService.subscribePettyCash(callback, wsId);
    }
    const colRef = getWorkspaceCol('petty_cash', wsId);
    const q = query(colRef, limit(50));
    return onSnapshot(
      q,
      (snapshot) => {
        const items: PettyCashEntry[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });
        items.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
        callback(items);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, `workspaces/${wsId}/petty_cash`);
      }
    );
  },

  async getPettyCashPaginated(
    limitCount = 50,
    lastDoc?: any,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<PaginatedResult<PettyCashEntry>> {
    if (isSupabaseConfigured()) {
      const items = await supabaseDataService.getPettyCash(wsId);
      return {
        items: items.slice(0, limitCount),
        lastDoc: null,
        hasMore: items.length > limitCount,
      };
    }
    try {
      const colRef = getWorkspaceCol('petty_cash', wsId);
      let q = query(colRef, limit(limitCount));
      if (lastDoc) {
        q = query(colRef, startAfter(lastDoc), limit(limitCount));
      }
      const snap = await getDocs(q);
      const items: PettyCashEntry[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...(d.data() as any) }));
      items.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
      const newLastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
      return {
        items,
        lastDoc: newLastDoc,
        hasMore: snap.docs.length === limitCount,
      };
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        return { items: [], lastDoc: null, hasMore: false };
      }
      handleFirestoreError(err, OperationType.GET, `workspaces/${wsId}/petty_cash`);
    }
  },

  async addPettyCash(
    entryData: Omit<PettyCashEntry, 'id' | 'pettyCashNo' | 'status' | 'submittedAt'>,
    actor?: ActorInfo,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<string> {
    const id = `pc-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const docNumber = await this.generateDocumentNumber('KAS', entryData.projectName || 'IND', wsId);

    const fullRecord: PettyCashEntry = {
      ...entryData,
      id,
      pettyCashNo: docNumber,
      status: 'Menunggu',
      requester: actor?.name || entryData.requester || 'Site Supervisor',
      requesterUid: actor?.uid || auth.currentUser?.uid,
      submittedAt: now,
      createdAt: now,
    };

    try {
      const docRef = getWorkspaceDoc('petty_cash', id, wsId);
      await setDoc(docRef, fullRecord);

      await this.logAuditEvent({
        action: 'PETTY_CASH_SUBMITTED',
        recordType: 'petty_cash',
        recordId: id,
        projectId: entryData.projectId,
        projectName: entryData.projectName,
        details: `Pengajuan Kas Kecil Lapangan ${docNumber} (Rp ${entryData.amount.toLocaleString('id-ID')}) untuk "${entryData.purpose}"`,
        actor: {
          uid: actor?.uid || auth.currentUser?.uid || 'user',
          name: actor?.name || 'Supervisor',
          role: actor?.role || 'Site Manager / Supervisor',
          email: actor?.email || auth.currentUser?.email || '',
        },
      }, wsId);

      return id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `workspaces/${wsId}/petty_cash/${id}`);
    }
  },

  async approvePettyCash(
    cashId: string,
    approverName: string,
    actor?: ActorInfo,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<void> {
    const now = new Date().toISOString();
    try {
      await updateDoc(getWorkspaceDoc('petty_cash', cashId, wsId), {
        status: 'Disetujui',
        reviewedBy: approverName,
        reviewedByUid: actor?.uid || auth.currentUser?.uid,
        reviewedAt: now,
        updatedAt: now,
      });

      await this.logAuditEvent({
        action: 'PETTY_CASH_APPROVED',
        recordType: 'petty_cash',
        recordId: cashId,
        details: `Menyetujui voucher kas kecil ${cashId} oleh ${approverName}`,
        actor: {
          uid: actor?.uid || auth.currentUser?.uid || 'user',
          name: approverName,
          role: actor?.role || 'Finance / Accounting',
          email: actor?.email || auth.currentUser?.email || '',
        },
      }, wsId);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `workspaces/${wsId}/petty_cash/${cashId}`);
    }
  },

  async rejectPettyCash(
    cashId: string,
    rejectorName: string,
    rejectionReason: string,
    actor?: ActorInfo,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<void> {
    const now = new Date().toISOString();
    try {
      await updateDoc(getWorkspaceDoc('petty_cash', cashId, wsId), {
        status: 'Ditolak',
        reviewedBy: rejectorName,
        reviewedByUid: actor?.uid || auth.currentUser?.uid,
        reviewedAt: now,
        rejectionReason,
        updatedAt: now,
      });

      await this.logAuditEvent({
        action: 'PETTY_CASH_REJECTED',
        recordType: 'petty_cash',
        recordId: cashId,
        details: `Menolak klaim kas kecil ${cashId}. Alasan: ${rejectionReason}`,
        actor: {
          uid: actor?.uid || auth.currentUser?.uid || 'user',
          name: rejectorName,
          role: actor?.role || 'Finance / Accounting',
          email: actor?.email || auth.currentUser?.email || '',
        },
      }, wsId);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `workspaces/${wsId}/petty_cash/${cashId}`);
    }
  },

  async disbursePettyCash(
    cashId: string,
    disburserName: string,
    actor?: ActorInfo,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<void> {
    const now = new Date().toISOString();
    try {
      await updateDoc(getWorkspaceDoc('petty_cash', cashId, wsId), {
        status: 'Dicairkan',
        disbursedBy: disburserName,
        disbursedByUid: actor?.uid || auth.currentUser?.uid,
        disbursedAt: now,
        updatedAt: now,
      });

      await this.logAuditEvent({
        action: 'PETTY_CASH_DISBURSED',
        recordType: 'petty_cash',
        recordId: cashId,
        details: `Mencairkan dana kas kecil ${cashId} kepada pelaksana lapangan`,
        actor: {
          uid: actor?.uid || auth.currentUser?.uid || 'user',
          name: disburserName,
          role: actor?.role || 'Finance / Accounting',
          email: actor?.email || auth.currentUser?.email || '',
        },
      }, wsId);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `workspaces/${wsId}/petty_cash/${cashId}`);
    }
  },

  // =========================================================================
  // 11. STOCK ADJUSTMENTS & OPNAME (workspaces/{wsId}/stock_adjustments)
  // =========================================================================
  subscribeStockAdjustments(
    callback: (adjustments: StockAdjustment[]) => void,
    onError?: (err: any) => void,
    wsId = DEFAULT_WORKSPACE_ID
  ) {
    if (isSupabaseConfigured()) {
      return supabaseDataService.subscribeStockAdjustments(callback, wsId);
    }
    const colRef = getWorkspaceCol('stock_adjustments', wsId);
    return onSnapshot(
      colRef,
      (snapshot) => {
        const items: StockAdjustment[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });
        items.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
        callback(items);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, `workspaces/${wsId}/stock_adjustments`);
      }
    );
  },

  async addStockAdjustment(
    adjData: Omit<StockAdjustment, 'id' | 'adjustmentNo' | 'status' | 'submittedAt'>,
    actor?: ActorInfo,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<string> {
    const id = `adj-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const docNumber = await this.generateDocumentNumber('ADJ', adjData.projectName || 'IND', wsId);

    const fullRecord: StockAdjustment = {
      ...adjData,
      id,
      adjustmentNo: docNumber,
      status: 'Menunggu',
      submittedBy: actor?.name || 'Petugas Gudang',
      submittedByUid: actor?.uid || auth.currentUser?.uid,
      submittedAt: now,
      createdAt: now,
    };

    try {
      const docRef = getWorkspaceDoc('stock_adjustments', id, wsId);
      await setDoc(docRef, fullRecord);

      await this.logAuditEvent({
        action: 'STOCK_ADJUSTMENT_SUBMITTED',
        recordType: 'stock_adjustment',
        recordId: id,
        projectId: adjData.projectId,
        projectName: adjData.projectName,
        details: `Mengajukan Berita Acara Opname Fisik ${docNumber} untuk ${adjData.materialName} (Selisih: ${adjData.varianceQuantity} ${adjData.unit})`,
        actor: {
          uid: actor?.uid || auth.currentUser?.uid || 'user',
          name: actor?.name || 'Gudang',
          role: actor?.role || 'Warehouse / Inventory',
          email: actor?.email || auth.currentUser?.email || '',
        },
      }, wsId);

      return id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `workspaces/${wsId}/stock_adjustments/${id}`);
    }
  },

  async approveStockAdjustment(
    adjId: string,
    approverName: string,
    actor?: ActorInfo,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<void> {
    const now = new Date().toISOString();
    try {
      const adjRef = getWorkspaceDoc('stock_adjustments', adjId, wsId);
      const adjSnap = await getDoc(adjRef);
      if (!adjSnap.exists()) throw new Error('Data Opname tidak ditemukan.');
      const curAdj = adjSnap.data() as StockAdjustment;

      const batch = writeBatch(db);

      // Adjust physical stock on material document
      const matRef = getWorkspaceDoc('materials', curAdj.materialId, wsId);
      const matSnap = await getDoc(matRef);
      if (matSnap.exists()) {
        const mat = matSnap.data() as MaterialItem;
        const newStock = curAdj.physicalStock;
        const newStatus = newStock <= 0 ? 'Kritis' : newStock <= mat.minStock ? 'Menipis' : 'Aman';
        batch.update(matRef, {
          currentStock: newStock,
          status: newStatus,
          updatedAt: now,
        });
      }

      batch.update(adjRef, {
        status: 'Disetujui',
        reviewedBy: approverName,
        reviewedByUid: actor?.uid || auth.currentUser?.uid,
        reviewedAt: now,
        updatedAt: now,
      });

      // Atomic Audit Log in same batch (Requirement 6)
      const auditId = `aud-${Date.now().toString(36)}`;
      batch.set(getWorkspaceDoc('audit_logs', auditId, wsId), {
        id: auditId,
        action: 'STOCK_ADJUSTMENT_APPROVED',
        recordType: 'stock_adjustment',
        recordId: adjId,
        details: `Menyetujui BA Opname Fisik ${curAdj.adjustmentNo}. Stok disesuaikan menjadi ${curAdj.physicalStock} ${curAdj.unit}`,
        actor: {
          uid: actor?.uid || auth.currentUser?.uid || 'user',
          name: approverName,
          role: actor?.role || 'Owner / Director',
          email: actor?.email || auth.currentUser?.email || '',
        },
        timestamp: now,
        correlationId: `tx-${Date.now()}`,
      });

      await batch.commit();
      invalidateCache('materials_');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `workspaces/${wsId}/stock_adjustments/${adjId}`);
    }
  },

  async rejectStockAdjustment(
    adjId: string,
    rejectorName: string,
    rejectionReason: string,
    actor?: ActorInfo,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<void> {
    const now = new Date().toISOString();
    try {
      const batch = writeBatch(db);
      batch.update(getWorkspaceDoc('stock_adjustments', adjId, wsId), {
        status: 'Ditolak',
        reviewedBy: rejectorName,
        reviewedByUid: actor?.uid || auth.currentUser?.uid,
        reviewedAt: now,
        rejectionReason,
        updatedAt: now,
      });

      const auditId = `aud-${Date.now().toString(36)}`;
      batch.set(getWorkspaceDoc('audit_logs', auditId, wsId), {
        id: auditId,
        action: 'STOCK_ADJUSTMENT_REJECTED',
        recordType: 'stock_adjustment',
        recordId: adjId,
        details: `Menolak pengajuan opname fisik ${adjId}. Alasan: ${rejectionReason}`,
        actor: {
          uid: actor?.uid || auth.currentUser?.uid || 'user',
          name: rejectorName,
          role: actor?.role || 'Owner / Director',
          email: actor?.email || auth.currentUser?.email || '',
        },
        timestamp: now,
        correlationId: `tx-${Date.now()}`,
      });

      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `workspaces/${wsId}/stock_adjustments/${adjId}`);
    }
  },

  // =========================================================================
  // 12. TEAM MEMBERS & GOVERNANCE (workspaces/{wsId}/team_members)
  // =========================================================================
  subscribeTeamMembers(
    callback: (members: TeamMember[]) => void,
    onError?: (err: any) => void,
    wsId = DEFAULT_WORKSPACE_ID
  ) {
    if (isSupabaseConfigured()) {
      return supabaseDataService.subscribeTeamMembers(callback, wsId);
    }
    const colRef = getWorkspaceCol('team_members', wsId);
    const q = query(colRef, limit(50));
    return onSnapshot(
      q,
      (snapshot) => {
        const items: TeamMember[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });
        callback(items);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, `workspaces/${wsId}/team_members`);
      }
    );
  },

  async getTeamMembers(forceRefresh = false, wsId = DEFAULT_WORKSPACE_ID): Promise<TeamMember[]> {
    if (isSupabaseConfigured()) {
      return await supabaseDataService.getTeamMembers(wsId);
    }
    const cacheKey = `team_${wsId}`;
    if (!forceRefresh) {
      const cached = getCachedItem<TeamMember[]>(cacheKey);
      if (cached) return cached;
    }
    const colRef = getWorkspaceCol('team_members', wsId);
    try {
      const snap = await getDocs(colRef);
      const items: TeamMember[] = [];
      snap.forEach((docSnap) => items.push({ id: docSnap.id, ...(docSnap.data() as any) }));
      setCachedItem(cacheKey, items);
      return items;
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        try {
          const cacheSnap = await getDocsFromCache(colRef);
          const items: TeamMember[] = [];
          cacheSnap.forEach((docSnap) => items.push({ id: docSnap.id, ...(docSnap.data() as any) }));
          if (items.length > 0) return items;
        } catch {}
      }
      handleFirestoreError(err, OperationType.GET, `workspaces/${wsId}/team_members`);
    }
  },

  async updateTeamMember(
    memberId: string,
    updates: Partial<TeamMember>,
    actor?: ActorInfo,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<void> {
    const now = new Date().toISOString();

    if (isSupabaseConfigured()) {
      const ws = resolveWorkspaceId(wsId);
      const memberPayload: any = { updated_at: now };
      if (updates.role !== undefined) memberPayload.role = updates.role;
      if (updates.status !== undefined) memberPayload.status = updates.status === 'Aktif' ? 'active' : 'inactive';
      if (updates.assignedProjects !== undefined) memberPayload.assigned_projects = updates.assignedProjects;

      await supabase
        .from('workspace_members')
        .update(memberPayload)
        .eq('workspace_id', ws)
        .or(`user_id.eq.${memberId.length === 36 ? memberId : '00000000-0000-0000-0000-000000000000'},id.eq.${memberId.length === 36 ? memberId : '00000000-0000-0000-0000-000000000000'}`);

      if (updates.name !== undefined || updates.phone !== undefined) {
        const profilePayload: any = { updated_at: now };
        if (updates.name !== undefined) profilePayload.full_name = updates.name;
        if (updates.phone !== undefined) profilePayload.phone = updates.phone;
        if (memberId.length === 36) {
          await supabase.from('profiles').update(profilePayload).eq('id', memberId);
        }
      }

      await this.logAuditEvent({
        action: 'ROLE_MODIFIED',
        recordType: 'team_member',
        recordId: memberId,
        details: `Memperbarui peran / penugasan personil ${memberId}`,
        actor: {
          uid: actor?.uid || auth.currentUser?.uid || 'user',
          name: actor?.name || 'Administrator',
          role: actor?.role || 'Owner / Director',
          email: actor?.email || auth.currentUser?.email || '',
        },
      }, wsId);

      invalidateCache('team_');
      return;
    }

    try {
      const batch = writeBatch(db);
      const docRef = getWorkspaceDoc('team_members', memberId, wsId);
      batch.update(docRef, {
        ...updates,
        updatedAt: now,
      });

      const auditId = `aud-${Date.now().toString(36)}`;
      batch.set(getWorkspaceDoc('audit_logs', auditId, wsId), {
        id: auditId,
        action: 'ROLE_MODIFIED',
        recordType: 'team_member',
        recordId: memberId,
        details: `Memperbarui peran / penugasan personil ${memberId}`,
        actor: {
          uid: actor?.uid || auth.currentUser?.uid || 'user',
          name: actor?.name || 'Administrator',
          role: actor?.role || 'Owner / Director',
          email: actor?.email || auth.currentUser?.email || '',
        },
        timestamp: now,
        correlationId: `tx-${Date.now()}`,
      });

      await batch.commit();
      invalidateCache('team_');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `workspaces/${wsId}/team_members/${memberId}`);
    }
  },

  async addTeamMember(
    memberData: TeamMember,
    actor?: ActorInfo,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<string> {
    const now = new Date().toISOString();

    if (isSupabaseConfigured()) {
      const ws = resolveWorkspaceId(wsId);
      const memberId = memberData.id || crypto.randomUUID();

      if (memberData.id && memberData.id.length === 36) {
        await supabase.from('profiles').upsert({
          id: memberData.id,
          full_name: memberData.name,
          email: memberData.email,
          phone: memberData.phone || null,
          role: memberData.role,
          updated_at: now,
        });

        await supabase.from('workspace_members').insert({
          workspace_id: ws,
          user_id: memberData.id,
          role: memberData.role,
          status: memberData.status === 'Aktif' ? 'active' : 'inactive',
          assigned_projects: memberData.assignedProjects || [],
          created_at: now,
          updated_at: now,
        });
      }

      await this.logAuditEvent({
        action: 'ROLE_MODIFIED',
        recordType: 'team_member',
        recordId: memberId,
        details: `Menambahkan personil baru "${memberData.name}" sebagai ${memberData.role}`,
        actor: {
          uid: actor?.uid || auth.currentUser?.uid || 'user',
          name: actor?.name || 'Administrator',
          role: actor?.role || 'Owner / Director',
          email: actor?.email || auth.currentUser?.email || '',
        },
      }, wsId);

      invalidateCache('team_');
      return memberId;
    }

    try {
      const batch = writeBatch(db);
      const docRef = getWorkspaceDoc('team_members', memberData.id, wsId);
      batch.set(docRef, {
        ...memberData,
        createdAt: now,
        updatedAt: now,
      });

      const auditId = `aud-${Date.now().toString(36)}`;
      batch.set(getWorkspaceDoc('audit_logs', auditId, wsId), {
        id: auditId,
        action: 'ROLE_MODIFIED',
        recordType: 'team_member',
        recordId: memberData.id,
        details: `Menambahkan personil baru "${memberData.name}" sebagai ${memberData.role}`,
        actor: {
          uid: actor?.uid || auth.currentUser?.uid || 'user',
          name: actor?.name || 'Administrator',
          role: actor?.role || 'Owner / Director',
          email: actor?.email || auth.currentUser?.email || '',
        },
        timestamp: now,
        correlationId: `tx-${Date.now()}`,
      });

      await batch.commit();
      invalidateCache('team_');
      return memberData.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `workspaces/${wsId}/team_members/${memberData.id}`);
    }
  },

  // =========================================================================
  // 13. AUDIT LOGS (workspaces/{wsId}/audit_logs - Append-Only)
  // =========================================================================
  subscribeAuditLogs(
    callback: (logs: AuditLogEntry[]) => void,
    onError?: (err: any) => void,
    wsId = DEFAULT_WORKSPACE_ID
  ) {
    if (isSupabaseConfigured()) {
      return supabaseDataService.subscribeAuditLogs(callback, wsId);
    }
    const colRef = getWorkspaceCol('audit_logs', wsId);
    const q = query(colRef, limit(50));
    return onSnapshot(
      q,
      (snapshot) => {
        const items: AuditLogEntry[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });
        items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        callback(items);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, `workspaces/${wsId}/audit_logs`);
      }
    );
  },

  async getAuditLogsPaginated(
    limitCount = 50,
    lastDoc?: any,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<PaginatedResult<AuditLogEntry>> {
    if (isSupabaseConfigured()) {
      const items = await supabaseDataService.getAuditLogs(wsId);
      return {
        items: items.slice(0, limitCount),
        lastDoc: items.length > limitCount ? items[limitCount - 1] : null,
        hasMore: items.length > limitCount,
      };
    }
    try {
      const colRef = getWorkspaceCol('audit_logs', wsId);
      let q = query(colRef, limit(limitCount));
      if (lastDoc) {
        q = query(colRef, startAfter(lastDoc), limit(limitCount));
      }
      const snap = await getDocs(q);
      const items: AuditLogEntry[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...(d.data() as any) }));
      items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const newLastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
      return {
        items,
        lastDoc: newLastDoc,
        hasMore: snap.docs.length === limitCount,
      };
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        return { items: [], lastDoc: null, hasMore: false };
      }
      handleFirestoreError(err, OperationType.GET, `workspaces/${wsId}/audit_logs`);
    }
  },

  async logAuditEvent(
    logData: Omit<AuditLogEntry, 'id' | 'timestamp' | 'correlationId' | 'actor' | 'workspaceId'> & {
      workspaceId?: string;
      actor: {
        uid: string;
        name: string;
        email: string;
        role: AppRole | string;
      };
    },
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<string> {
    if (isSupabaseConfigured()) {
      return await supabaseDataService.logAuditEvent(logData, wsId);
    }
    const id = `aud-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const fullLog: AuditLogEntry = {
      ...logData,
      id,
      workspaceId: logData.workspaceId || wsId,
      actor: {
        ...logData.actor,
        role: logData.actor.role as AppRole,
      },
      timestamp: new Date().toISOString(),
      correlationId: `tx-${Date.now()}`,
    };
    try {
      const docRef = getWorkspaceDoc('audit_logs', id, wsId);
      await setDoc(docRef, fullLog);
      return id;
    } catch (error) {
      console.warn('Audit logging notice:', error);
      return id;
    }
  },

  // =========================================================================
  // 14. NOTIFICATIONS (workspaces/{wsId}/notifications)
  // =========================================================================
  subscribeNotifications(
    callback: (notifications: NotificationItem[]) => void,
    onError?: (err: any) => void,
    wsId = DEFAULT_WORKSPACE_ID
  ) {
    if (isSupabaseConfigured()) {
      return supabaseDataService.subscribeNotifications(callback, wsId);
    }
    const colRef = getWorkspaceCol('notifications', wsId);
    const q = query(colRef, limit(50));
    return onSnapshot(
      q,
      (snapshot) => {
        const items: NotificationItem[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });
        items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        callback(items);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, `workspaces/${wsId}/notifications`);
      }
    );
  },

  async getNotificationsPaginated(
    limitCount = 50,
    lastDoc?: any,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<PaginatedResult<NotificationItem>> {
    if (isSupabaseConfigured()) {
      const items = await supabaseDataService.getNotifications(wsId);
      return {
        items: items.slice(0, limitCount),
        lastDoc: items.length > limitCount ? items[limitCount - 1] : null,
        hasMore: items.length > limitCount,
      };
    }
    try {
      const colRef = getWorkspaceCol('notifications', wsId);
      let q = query(colRef, limit(limitCount));
      if (lastDoc) {
        q = query(colRef, startAfter(lastDoc), limit(limitCount));
      }
      const snap = await getDocs(q);
      const items: NotificationItem[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...(d.data() as any) }));
      items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const newLastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
      return {
        items,
        lastDoc: newLastDoc,
        hasMore: snap.docs.length === limitCount,
      };
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        return { items: [], lastDoc: null, hasMore: false };
      }
      handleFirestoreError(err, OperationType.GET, `workspaces/${wsId}/notifications`);
    }
  },

  async markNotificationAsRead(id: string, wsId = DEFAULT_WORKSPACE_ID): Promise<void> {
    if (isSupabaseConfigured()) {
      await supabase.from('notifications').update({ read: true }).eq('id', id);
      return;
    }
    try {
      await updateDoc(getWorkspaceDoc('notifications', id, wsId), { read: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `workspaces/${wsId}/notifications/${id}`);
    }
  },

  async markAllNotificationsRead(ids: string[], wsId = DEFAULT_WORKSPACE_ID): Promise<void> {
    if (isSupabaseConfigured()) {
      await supabase.from('notifications').update({ read: true }).in('id', ids);
      return;
    }
    try {
      const batch = writeBatch(db);
      for (const id of ids) {
        batch.update(getWorkspaceDoc('notifications', id, wsId), { read: true });
      }
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `workspaces/${wsId}/notifications`);
    }
  },

  // =========================================================================
  // 15. ACTIVITIES (workspaces/{wsId}/activities)
  // =========================================================================
  subscribeActivities(
    callback: (activities: ProjectActivity[]) => void,
    onError?: (err: any) => void,
    wsId = DEFAULT_WORKSPACE_ID
  ) {
    if (isSupabaseConfigured()) {
      return supabaseDataService.subscribeAuditLogs((logs) => {
        const activities: ProjectActivity[] = logs.map((log) => {
          let type: 'progress' | 'cost' | 'material' | 'report' | 'milestone' = 'progress';
          if (log.recordType === 'budget' || log.recordType === 'purchase_order' || log.recordType === 'petty_cash') type = 'cost';
          else if (log.recordType === 'material' || log.recordType === 'stock_adjustment') type = 'material';
          else if (log.recordType === 'field_report') type = 'report';
          else if (log.recordType === 'milestone') type = 'milestone';

          return {
            id: log.id,
            projectId: log.projectId || 'all',
            projectName: log.projectName || 'Semua Proyek',
            user: log.actor?.name || 'User',
            action: log.details || log.action,
            timestamp: log.timestamp,
            type,
          };
        });
        callback(activities.slice(0, 20));
      }, wsId);
    }
    const colRef = getWorkspaceCol('activities', wsId);
    const q = query(colRef, limit(20));
    return onSnapshot(
      q,
      (snapshot) => {
        const items: ProjectActivity[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });
        items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        callback(items);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, `workspaces/${wsId}/activities`);
      }
    );
  },

  async getActivities(limitCount = 20, wsId = DEFAULT_WORKSPACE_ID): Promise<ProjectActivity[]> {
    if (isSupabaseConfigured()) {
      const logs = await supabaseDataService.getAuditLogs(wsId);
      const activities: ProjectActivity[] = logs.map((log) => {
        let type: 'progress' | 'cost' | 'material' | 'report' | 'milestone' = 'progress';
        if (log.recordType === 'budget' || log.recordType === 'purchase_order' || log.recordType === 'petty_cash') type = 'cost';
        else if (log.recordType === 'material' || log.recordType === 'stock_adjustment') type = 'material';
        else if (log.recordType === 'field_report') type = 'report';
        else if (log.recordType === 'milestone') type = 'milestone';

        return {
          id: log.id,
          projectId: log.projectId || 'all',
          projectName: log.projectName || 'Semua Proyek',
          user: log.actor?.name || 'User',
          action: log.details || log.action,
          timestamp: log.timestamp,
          type,
        };
      });
      return activities.slice(0, limitCount);
    }
    const colRef = getWorkspaceCol('activities', wsId);
    try {
      const snap = await getDocs(query(colRef, limit(limitCount)));
      const items: ProjectActivity[] = [];
      snap.forEach((docSnap) => items.push({ id: docSnap.id, ...(docSnap.data() as any) }));
      items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return items;
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        try {
          const cacheSnap = await getDocsFromCache(query(colRef, limit(limitCount)));
          const items: ProjectActivity[] = [];
          cacheSnap.forEach((docSnap) => items.push({ id: docSnap.id, ...(docSnap.data() as any) }));
          if (items.length > 0) return items;
        } catch {}
      }
      handleFirestoreError(err, OperationType.GET, `workspaces/${wsId}/activities`);
    }
  },

  // =========================================================================
  // 16. WORKSPACE SETTINGS (workspaces/{wsId}/settings/company_default)
  // =========================================================================
  subscribeSettings(
    callback: (settings: AppSettings) => void,
    onError?: (err: any) => void,
    wsId = DEFAULT_WORKSPACE_ID
  ) {
    if (isSupabaseConfigured()) {
      supabaseDataService.getSettings(wsId).then((settings: any) => {
        callback(settings);
      }).catch((err) => {
        if (onError) onError(err);
      });
      return () => {};
    }
    const docRef = getWorkspaceDoc('settings', 'company_default', wsId);
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          callback(snap.data() as AppSettings);
        }
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, `workspaces/${wsId}/settings/company_default`);
      }
    );
  },

  async getSettings(forceRefresh = false, wsId = DEFAULT_WORKSPACE_ID): Promise<AppSettings | null> {
    if (isSupabaseConfigured()) {
      return (await supabaseDataService.getSettings(wsId)) as any;
    }
    const cacheKey = `settings_${wsId}`;
    if (!forceRefresh) {
      const cached = getCachedItem<AppSettings>(cacheKey);
      if (cached) return cached;
    }
    const docRef = getWorkspaceDoc('settings', 'company_default', wsId);
    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as AppSettings;
        setCachedItem(cacheKey, data);
        return data;
      }
      return null;
    } catch (err) {
      if (isQuotaExhaustedError(err)) {
        try {
          const cacheSnap = await getDocFromCache(docRef);
          if (cacheSnap.exists()) return cacheSnap.data() as AppSettings;
        } catch {}
      }
      handleFirestoreError(err, OperationType.GET, `workspaces/${wsId}/settings/company_default`);
    }
  },

  async saveSettings(
    settings: AppSettings,
    actor?: ActorInfo,
    wsId = DEFAULT_WORKSPACE_ID
  ): Promise<void> {
    if (isSupabaseConfigured()) {
      await supabaseDataService.saveSettings(settings as any, wsId);
      return;
    }
    try {
      const docRef = getWorkspaceDoc('settings', 'company_default', wsId);
      const now = new Date().toISOString();
      const batch = writeBatch(db);

      batch.set(docRef, {
        ...settings,
        updatedAt: now,
      });

      // Atomic Audit Log in same batch (Requirement 6)
      const auditId = `aud-${Date.now().toString(36)}`;
      batch.set(getWorkspaceDoc('audit_logs', auditId, wsId), {
        id: auditId,
        action: 'SYSTEM_SETTINGS_MODIFIED',
        recordType: 'settings',
        recordId: 'company_default',
        details: `Memperbarui konfigurasi perusahaan "${settings.companyName}" (Bahasa: ${settings.language}, NPWP: ${settings.taxNumberNPWP})`,
        actor: {
          uid: actor?.uid || auth.currentUser?.uid || 'user',
          name: actor?.name || 'Direktur Utama',
          role: actor?.role || 'Owner / Director',
          email: actor?.email || auth.currentUser?.email || '',
        },
        timestamp: now,
        correlationId: `tx-${Date.now()}`,
      });

      await batch.commit();
      invalidateCache('settings_');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `workspaces/${wsId}/settings/company_default`);
    }
  },

  invalidateCache(keyPrefix?: string) {
    invalidateCache(keyPrefix);
  }
};
