/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Projects Domain Context
 * Synchronizes projects, budget lines, milestones, WBS, and activities.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Project, BudgetLine, Milestone, WBSItem, BudgetVersion, ProjectActivity } from '../types';
import * as projectData from '../data/projects';
import { dataService } from '../services/dataService';
import { useAuth } from './AuthContext';
import { useUI, getScreenIdFromPathname } from './UIContext';
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
  const location = useLocation();
  const screenId = getScreenIdFromPathname(location.pathname);
  const {
    workspaceId,
    actorInfo,
    selectedProjectId,
    setSelectedProjectId,
    addToast,
    setPendingActions,
    setIsLoadingData,
    setLoadError,
    setLoadingProjects,
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
    setLoadingProjects(true);
    dataService.getProjects(workspaceId).then((projs) => {
      if (isMounted && projs) setProjects(projs);
    }).catch((err: any) => {
      if (isMounted) {
        setLoadError(`Gagal memuat daftar proyek: ${err?.message || 'Kesalahan tidak diketahui'}`);
        addToast({
          type: 'danger',
          title: 'Gagal Memuat Proyek',
          message: 'Kesalahan saat memuat daftar proyek. Coba muat ulang halaman atau hubungi dukungan.',
        });
      }
    }).finally(() => {
      if (isMounted) setLoadingProjects(false);
    });
    return () => { isMounted = false; };
  }, [currentUser, workspaceId, setLoadingProjects, addToast, setLoadError]);

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
    dataService
      .getProjectSubcollections(selectedProjectId, workspaceId)
      .then((subs) => {
        if (isMounted && subs) {
          setBudgetLines(subs.budgetLines);
          setMilestones(subs.milestones);
          setWbsList(subs.wbsList);
          setBudgetVersions(subs.budgetVersions);
        }
      })
      .catch((err: any) => {
        if (isMounted) {
          addToast({
            type: 'warning',
            title: 'Data Proyek Tidak Lengkap',
            message: err?.message || 'Beberapa data proyek tidak dapat dimuat. Coba muat ulang.',
          });
        }
      });

    return () => { isMounted = false; };
  }, [currentUser, selectedProjectId, workspaceId]);

  // Load Dashboard Activities on demand
  useEffect(() => {
    if (!currentUser || screenId !== 'dashboard') return;
    let isMounted = true;
    dataService.getActivities(20, workspaceId).then((act) => {
      if (isMounted && act) setActivities(act);
    }).catch((err: any) => {
      if (isMounted) {
        addToast({
          type: 'danger',
          title: 'Gagal Memuat Aktivitas',
          message: err?.message || 'Tidak dapat mengambil aktivitas terbaru.',
        });
      }
    });
    return () => { isMounted = false; };
  }, [currentUser, location.pathname, workspaceId, addToast]);

  const refreshProjects = async (force = true) => {
    const projs = await dataService.getProjects(workspaceId);
    if (projs) setProjects(projs);
    if (selectedProjectId) {
      const subs = await dataService.getProjectSubcollections(selectedProjectId, workspaceId);
      if (subs) {
        setBudgetLines(subs.budgetLines);
        setMilestones(subs.milestones);
        setWbsList(subs.wbsList);
        setBudgetVersions(subs.budgetVersions);
      }
    }
  };

  const addProject = async (
    newProj: Omit<Project, 'id' | 'totalMilestones' | 'completedMilestones'>
  ): Promise<string> => {
    try {
      const generatedId = await dataService.addProject(newProj, workspaceId);
      setSelectedProjectId(generatedId);
      await refreshProjects(true);
      addToast({
        type: 'success',
        title: 'Proyek Berhasil Didaftarkan',
        message: `Proyek "${newProj.name}" (${newProj.code}) telah disimpan ke Supabase dengan baseline v0 Kontrak Induk.`,
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
      await dataService.addProjectBudgetLine(selectedProjectId, lineData, actorInfo, workspaceId);
      const updatedLines = [...budgetLines, { ...lineData, id: `line-${Date.now()}` } as BudgetLine];
      setBudgetLines(updatedLines);

      const financials = calculateProjectFinancials(updatedLines);
      await projectData.updateProject(selectedProjectId, {
        approvedBudget: financials.approvedBudget,
        actualCost: financials.actualCost,
      });

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
        message: `${lineData.code} (${lineData.divisionName}) berhasil disimpan ke Supabase.`,
      });
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Gagal Menambah Item RAB',
        message: err?.message || 'Gagal menyimpan item RAB ke Supabase.',
      });
      throw err;
    }
  };

  const updateBudgetLine = async (lineId: string, updates: Partial<BudgetLine>) => {
    const oldLine = budgetLines.find((l) => l.id === lineId);
    try {
      await dataService.updateProjectBudgetLine(
        selectedProjectId,
        lineId,
        updates,
        actorInfo,
        workspaceId
      );

      const updatedLines = budgetLines.map((l) => (l.id === lineId ? { ...l, ...updates } : l));
      setBudgetLines(updatedLines);

      const financials = calculateProjectFinancials(updatedLines);
      await projectData.updateProject(selectedProjectId, {
        actualCost: financials.actualCost,
        approvedBudget: financials.approvedBudget,
      });

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
        message: `Perubahan pos ${oldLine?.code || lineId} berhasil disimpan ke Supabase dan audit log dicatat.`,
      });
    } catch (err: any) {
      addToast({
        type: 'danger',
        title: 'Gagal Memperbarui RAB',
        message: err?.message || 'Kebijakan akses Supabase menolak pembaruan RAB.',
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
      await dataService.signOffProjectMilestone(
        selectedProjectId,
        milestoneId,
        { notes, attachments: bastRef ? [bastRef] : [] },
        actorInfo,
        workspaceId
      );

      const updatedMilestones = milestones.map((m) =>
        m.id === milestoneId ? { ...m, status: 'Selesai' as const, progress: 100 } : m
      );
      setMilestones(updatedMilestones);

      const metrics = calculateProjectMilestones(updatedMilestones);
      await projectData.updateProject(selectedProjectId, {
        completedMilestones: metrics.completedMilestones,
        totalMilestones: metrics.totalMilestones,
      });

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
      await dataService.updateProjectWBSProgress(
        selectedProjectId,
        wbsId,
        actualProgress,
        actorInfo,
        workspaceId
      );

      const updatedWBS = wbsList.map((w) =>
        w.id === wbsId ? { ...w, actualProgress, status } : w
      );
      setWbsList(updatedWBS);

      const schedule = calculateProjectSchedule(updatedWBS);
      await dataService.updateProject(selectedProjectId, {
        progressActual: schedule.progressActual,
        progressPlanned: schedule.progressPlanned,
        scheduleStatus: schedule.scheduleStatus,
      }, actorInfo, workspaceId);

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
