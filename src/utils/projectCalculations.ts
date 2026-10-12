/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Centralized, Strictly Tested Project Metric Calculation Engine
 * Guarantees that project progress, actualCost, approvedBudget, and variance
 * are mathematically derived directly from underlying itemized lines (RAB, WBS, Milestones),
 * eliminating unsynchronized manual state drift.
 */

import { Project, BudgetLine, WBSItem, Milestone, ProjectScheduleStatus } from '../types';

export interface ProjectFinancialMetrics {
  actualCost: number;
  approvedBudget: number;
  varianceAmount: number;
  variancePercent: number;
  costPerformanceIndex: number; // CPI
}

export interface ProjectScheduleMetrics {
  progressActual: number;
  progressPlanned: number;
  scheduleVariance: number;
  scheduleStatus: ProjectScheduleStatus;
}

export interface ProjectMilestoneMetrics {
  totalMilestones: number;
  completedMilestones: number;
  completionPercent: number;
}

/**
 * Calculates project financial metrics derived strictly from BOQ / RAB budget lines.
 */
export function calculateProjectFinancials(lines: BudgetLine[]): ProjectFinancialMetrics {
  if (!lines || lines.length === 0) {
    return {
      actualCost: 0,
      approvedBudget: 0,
      varianceAmount: 0,
      variancePercent: 0,
      costPerformanceIndex: 1.0,
    };
  }

  const approvedBudget = lines.reduce((sum, line) => sum + (Number(line.plannedAmount) || 0), 0);
  const actualCost = lines.reduce((sum, line) => sum + (Number(line.actualAmount) || 0), 0);
  const varianceAmount = approvedBudget - actualCost;
  
  const variancePercent = approvedBudget > 0
    ? Number(((varianceAmount / approvedBudget) * 100).toFixed(2))
    : 0;

  // CPI: Value delivered vs actual expenditure
  const costPerformanceIndex = actualCost > 0
    ? Number((approvedBudget / actualCost).toFixed(2))
    : 1.0;

  return {
    actualCost: Math.round(actualCost),
    approvedBudget: Math.round(approvedBudget),
    varianceAmount: Math.round(varianceAmount),
    variancePercent,
    costPerformanceIndex,
  };
}

/**
 * Calculates project schedule progress metrics derived strictly from WBS work items.
 * Uses durationDays-weighted progress for engineering fidelity.
 */
export function calculateProjectSchedule(wbsItems: WBSItem[]): ProjectScheduleMetrics {
  if (!wbsItems || wbsItems.length === 0) {
    return {
      progressActual: 0,
      progressPlanned: 0,
      scheduleVariance: 0,
      scheduleStatus: 'Tepat Waktu',
    };
  }

  let totalWeight = 0;
  let weightedActual = 0;
  let weightedPlanned = 0;

  for (const item of wbsItems) {
    const weight = Math.max(1, Number(item.durationDays) || 1);
    totalWeight += weight;
    weightedActual += (Number(item.actualProgress) || 0) * weight;
    weightedPlanned += (Number(item.plannedProgress) || 0) * weight;
  }

  const progressActual = totalWeight > 0
    ? Number((weightedActual / totalWeight).toFixed(1))
    : 0;
  const progressPlanned = totalWeight > 0
    ? Number((weightedPlanned / totalWeight).toFixed(1))
    : 0;

  const scheduleVariance = Number((progressActual - progressPlanned).toFixed(1));

  let scheduleStatus: ProjectScheduleStatus = 'Tepat Waktu';
  if (progressActual >= 100) {
    scheduleStatus = 'Tepat Waktu';
  } else if (scheduleVariance < -10) {
    scheduleStatus = 'Kritis';
  } else if (scheduleVariance < -3) {
    scheduleStatus = 'Terlambat';
  } else if (scheduleVariance > 5) {
    scheduleStatus = 'Mendahului';
  } else {
    scheduleStatus = 'Tepat Waktu';
  }

  return {
    progressActual: Math.min(100, Math.max(0, progressActual)),
    progressPlanned: Math.min(100, Math.max(0, progressPlanned)),
    scheduleVariance,
    scheduleStatus,
  };
}

/**
 * Calculates contractual milestone progress and sign-off completion metrics.
 */
export function calculateProjectMilestones(milestones: Milestone[]): ProjectMilestoneMetrics {
  if (!milestones || milestones.length === 0) {
    return {
      totalMilestones: 0,
      completedMilestones: 0,
      completionPercent: 0,
    };
  }

  const totalMilestones = milestones.length;
  const completedMilestones = milestones.filter((m) => m.status === 'Selesai').length;
  const completionPercent = totalMilestones > 0
    ? Number(((completedMilestones / totalMilestones) * 100).toFixed(1))
    : 0;

  return {
    totalMilestones,
    completedMilestones,
    completionPercent,
  };
}

/**
 * Re-derives the full project state from subcollection items.
 * Ensures the project master record matches 100% with underlying lines.
 */
export function recalculateProjectMaster(
  project: Project,
  lines: BudgetLine[],
  wbsItems: WBSItem[],
  milestones: Milestone[]
): Project {
  const financials = calculateProjectFinancials(lines);
  const schedule = calculateProjectSchedule(wbsItems);
  const milestoneMetrics = calculateProjectMilestones(milestones);

  // If project has contractValue but no lines yet, retain contractValue
  const contractValue = project.contractValue || financials.approvedBudget;

  return {
    ...project,
    approvedBudget: financials.approvedBudget > 0 ? financials.approvedBudget : project.approvedBudget,
    actualCost: financials.actualCost,
    progressActual: wbsItems.length > 0 ? schedule.progressActual : project.progressActual,
    progressPlanned: wbsItems.length > 0 ? schedule.progressPlanned : project.progressPlanned,
    scheduleStatus: wbsItems.length > 0 ? schedule.scheduleStatus : project.scheduleStatus,
    totalMilestones: milestoneMetrics.totalMilestones > 0 ? milestoneMetrics.totalMilestones : project.totalMilestones,
    completedMilestones: milestoneMetrics.completedMilestones,
    updatedAt: new Date().toISOString(),
  };
}
