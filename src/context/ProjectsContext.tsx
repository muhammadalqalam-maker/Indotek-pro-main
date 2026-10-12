/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Projects Domain Context
 * Synchronizes projects, budget lines, milestones, WBS, and activities.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Project, BudgetLine, Milestone, WBSItem, BudgetVersion, ProjectActivity } from '../types';
import { firestoreService } from '../services/firestoreService';
import { useAuth } from './AuthContext';
import { useUI } from './UIContext';
import {
  calculateProjectFinancials,
  calculateProjectSchedule,
  calculateProjectMilestones
} from '../utils/projectCalculations';

export interface ProjectsContextType {
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  budgetLines: BudgetLine[];
  setBudgetLines: React.Dispatch<React.SetStateAction<BudgetLine[]>>;
  milestones: Milestone[];
  setMilestones: React.Dispatch<React.SetStateAction<Milestone[]>>;
  wbsList: WBSItem[];
  setWbsList: React.Dispatch<React.SetStateAction<WBSItem[]>>;
  budgetVersions: BudgetVersion[];
  setBudgetVersions: React.Dispatch<React.SetStateAction<BudgetVersion[]>>;
  activities: ProjectActivity[];
  setActivities: React.Dispatch<React.SetStateAction<ProjectActivity[]>>;

  addProject: (newProj: Omit<Project, 'id' | 'totalMilestones' | 'completedMilestones'>) => Promise<string>;
  addBudgetLine: (line: Omit<BudgetLine, 'id'>) => Promise<void>;
  updateBudgetLine: (lineId: string, updates: Partial<BudgetLine>) => Promise<void>;
  signOffMilestone: (milestoneId: string, milestoneTitle: string, projectName: string, bastRef?: string, notes?: string) => Promise<void>;
  updateWBSProgress: (wbsId: string, actualProgress: number, status: WBSItem['status']) => Promise<void>;
  refreshProjects: (force?: boolean) => Promise<void>;
}

const ProjectsContext = createContext<ProjectsContextType | undefined>(undefined);

export const ProjectsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const {
    workspaceId,
    actorInfo,
    selectedProjectId,
    setSelectedProjectId,
    currentScreen,
    addToast,
    setPendingActions,
    setIsLoadingData,
    setLoadError,
  } = useUI();

  const [projects, setProjects] = useState<Project[]>([]);
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [wbsList, setWbsList] = useState<WBSItem[]>([]);
  const [budgetVersions, setBudgetVersions] = useState<BudgetVersion[]>([]);
  const [activities, setActivities] = useState<ProjectActivity[]>([]);

  // Automatically select first project
  useEffect(() => {
    if (projects.length > 0) {
      if (!selectedProjectId || !projects.some((p) => p.id === selectedProjectId)) {
        setSelectedProjectId(projects[0].id);
      }
    }
  }, [projects, selectedProjectId, setSelectedProjectId]);

  // Load Projects Master List Once on boot
  useEffect(() => {
    if (!currentUser) return;
    let isMounted = true;
    firestoreService.getProjects(false, workspaceId).then((projs) => {
      if (isMounted && projs) setProjects(projs);
    }).catch((err) => {
      console.warn('Projects initial load notice:', err);
    });
    return () => { isMounted = false; };
  }, [currentUser, workspaceId]);

  // Load Active Project Subcollections on project selection
  useEffect(() => {
    if (!currentUser || !selectedProjectId) {
      setBudgetLines([]);
      setMilestones([]);
      setWbsList([]);
      setBudgetVersions([]);
      return;
    }

    let isMounted = true;
    firestoreService
      .getProjectSubcollections(selectedProjectId, false, workspaceId)
      .then((subs) => {
        if (isMounted && subs) {
          setBudgetLines(subs.budgetLines);
          setMilestones(subs.milestones);
          setWbsList(subs.wbsList);
          setBudgetVersions(subs.budgetVersions);
        }
      })
      .catch((err) => {
        console.warn('Project subcollections load notice:', err);
      });

    return () => { isMounted = false; };
  }, [currentUser, selectedProjectId, workspaceId]);

  // Load Dashboard Activities on demand
  useEffect(() => {
    if (!currentUser || currentScreen !== 'dashboard') return;
    let isMounted = true;
    firestoreService.getActivities(20, workspaceId).then((act) => {
      if (isMounted && act) setActivities(act);
    }).catch(console.warn);
    return () => { isMounted = false; };
  }, [currentUser, currentScreen, workspaceId]);

  const refreshProjects = async (force = true) => {
    try {
      const projs = await firestoreService.getProjects(force, workspaceId);
      if (projs) setProjects(projs);
      if (selectedProjectId) {
        const subs = await firestoreService.getProjectSubcollections(selectedProjectId, force, workspaceId);
        if (subs) {
          setBudgetLines(subs.budgetLines);
          setMilestones(subs.milestones);
          setWbsList(subs.wbsList);
          setBudgetVersions(subs.budgetVersions);
        }
      }
    } catch (err: any) {
      console.error('Failed refreshing projects:', err);
    }
  };

  const addProject = async (
    newProj: Omit<Project, 'id' | 'totalMilestones' | 'completedMilestones'>
  ): Promise<string> => {
    try {
      const generatedId = await firestoreService.addProject(newProj, actorInfo, workspaceId);
      setSelectedProjectId(generatedId);
      await refreshProjects(true);
      addToast({
        type: 'success',
        title: 'Proyek Berhasil Didaftarkan',
        message: `Proyek "${newProj.name}" (${newProj.code}) telah disimpan ke Firestore dengan baseline v0 Kontrak Induk.`,
      });
      return generatedId;
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Gagal Menambah Proyek',
        message: err?.message || 'Terjadi kesalahan saat menyimpan proyek baru.',
      });
      throw err;
    }
  };

  const addBudgetLine = async (lineData: Omit<BudgetLine, 'id'>) => {
    try {
      await firestoreService.addProjectBudgetLine(selectedProjectId, lineData, actorInfo, workspaceId);
      const updatedLines = [...budgetLines, { ...lineData, id: `line-${Date.now()}` } as BudgetLine];
      setBudgetLines(updatedLines);

      const financials = calculateProjectFinancials(updatedLines);
      await firestoreService.updateProject(selectedProjectId, {
        approvedBudget: financials.approvedBudget,
        actualCost: financials.actualCost,
      }, workspaceId);

      setProjects((prev) =>
        prev.map((p) =>
          p.id === selectedProjectId
            ? { ...p, approvedBudget: financials.approvedBudget, actualCost: financials.actualCost }
            : p
        )
      );

      addToast({
        type: 'success',
        title: 'Item RAB Ditambahkan',
        message: `${lineData.code} (${lineData.divisionName}) berhasil disimpan ke Firestore.`,
      });
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Gagal Menambah Item RAB',
        message: err?.message || 'Gagal menyimpan item RAB ke Firestore.',
      });
      throw err;
    }
  };

  const updateBudgetLine = async (lineId: string, updates: Partial<BudgetLine>) => {
    const oldLine = budgetLines.find((l) => l.id === lineId);
    try {
      await firestoreService.updateProjectBudgetLine(
        selectedProjectId,
        lineId,
        updates,
        actorInfo,
        oldLine,
        workspaceId
      );

      const updatedLines = budgetLines.map((l) => (l.id === lineId ? { ...l, ...updates } : l));
      setBudgetLines(updatedLines);

      const financials = calculateProjectFinancials(updatedLines);
      await firestoreService.updateProject(selectedProjectId, {
        actualCost: financials.actualCost,
        approvedBudget: financials.approvedBudget,
      }, workspaceId);

      setProjects((prev) =>
        prev.map((p) =>
          p.id === selectedProjectId
            ? { ...p, approvedBudget: financials.approvedBudget, actualCost: financials.actualCost }
            : p
        )
      );

      addToast({
        type: 'success',
        title: 'Baris RAB Diperbarui',
        message: `Perubahan pos ${oldLine?.code || lineId} berhasil disimpan ke Firestore dan audit log dicatat.`,
      });
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Gagal Memperbarui RAB',
        message: err?.message || 'Aturan keamanan Firestore menolak pembaruan RAB.',
      });
      throw err;
    }
  };

  const signOffMilestone = async (
    milestoneId: string,
    milestoneTitle: string,
    projectName: string,
    bastRef = 'BAST-MILESTONE-OFFICIAL.pdf',
    notes?: string
  ) => {
    setPendingActions((prev) => ({ ...prev, [milestoneId]: true }));
    try {
      await firestoreService.signOffProjectMilestone(
        selectedProjectId,
        milestoneId,
        actorInfo.name,
        bastRef,
        notes,
        actorInfo,
        milestoneTitle,
        projectName,
        workspaceId
      );

      const updatedMilestones = milestones.map((m) =>
        m.id === milestoneId ? { ...m, status: 'Selesai' as const, progress: 100 } : m
      );
      setMilestones(updatedMilestones);

      const metrics = calculateProjectMilestones(updatedMilestones);
      await firestoreService.updateProject(selectedProjectId, {
        completedMilestones: metrics.completedMilestones,
        totalMilestones: metrics.totalMilestones,
      }, workspaceId);

      setProjects((prev) =>
        prev.map((p) =>
          p.id === selectedProjectId
            ? { ...p, completedMilestones: metrics.completedMilestones, totalMilestones: metrics.totalMilestones }
            : p
        )
      );

      addToast({
        type: 'success',
        title: 'Milestone Resmi Disahkan',
        message: `Milestone "${milestoneTitle}" disahkan dengan BAST Ref ${bastRef} dan tercatat di audit log.`,
      });
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Sign-Off Milestone Gagal',
        message: err?.message || 'Wewenang tidak mencukupi untuk menandatangani BAST milestone.',
      });
      throw err;
    } finally {
      setPendingActions((prev) => {
        const next = { ...prev };
        delete next[milestoneId];
        return next;
      });
    }
  };

  const updateWBSProgress = async (
    wbsId: string,
    actualProgress: number,
    status: WBSItem['status']
  ) => {
    const targetWBS = wbsList.find((w) => w.id === wbsId);
    try {
      await firestoreService.updateProjectWBSProgress(
        selectedProjectId,
        wbsId,
        actualProgress,
        status,
        actorInfo,
        targetWBS?.name,
        workspaceId
      );

      const updatedWBS = wbsList.map((w) =>
        w.id === wbsId ? { ...w, actualProgress, status } : w
      );
      setWbsList(updatedWBS);

      const schedule = calculateProjectSchedule(updatedWBS);
      await firestoreService.updateProject(selectedProjectId, {
        progressActual: schedule.progressActual,
        progressPlanned: schedule.progressPlanned,
        scheduleStatus: schedule.scheduleStatus,
      }, workspaceId);

      setProjects((prev) =>
        prev.map((p) =>
          p.id === selectedProjectId
            ? {
                ...p,
                progressActual: schedule.progressActual,
                progressPlanned: schedule.progressPlanned,
                scheduleStatus: schedule.scheduleStatus,
              }
            : p
        )
      );

      addToast({
        type: 'success',
        title: 'Progres WBS Diperbarui',
        message: `Progres "${targetWBS?.name || wbsId}" disetel ke ${actualProgress}% (${status}). Progres proyek dihitung ulang.`,
      });
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Gagal Memperbarui WBS',
        message: err?.message || 'Kesalahan izin akses saat memperbarui progres WBS.',
      });
      throw err;
    }
  };

  return (
    <ProjectsContext.Provider
      value={{
        projects,
        setProjects,
        budgetLines,
        setBudgetLines,
        milestones,
        setMilestones,
        wbsList,
        setWbsList,
        budgetVersions,
        setBudgetVersions,
        activities,
        setActivities,
        addProject,
        addBudgetLine,
        updateBudgetLine,
        signOffMilestone,
        updateWBSProgress,
        refreshProjects,
      }}
    >
      {children}
    </ProjectsContext.Provider>
  );
};

export const useProjects = (): ProjectsContextType => {
  const context = useContext(ProjectsContext);
  if (!context) throw new Error('useProjects must be used within a ProjectsProvider');
  return context;
};
