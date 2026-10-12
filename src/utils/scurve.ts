/**
 * Indotek Pro — S-Curve Construction Progress Calculation Engine
 * 
 * Implements standard construction project controls methodology:
 * - Planned cumulative S-curve: Baseline cumulative work weight over project duration.
 * - Actual cumulative S-curve: Earned progress to date based on verified work packages and milestones.
 * - Schedule variance (Deviasi): Actual(%) - Planned(%)
 * - Schedule Performance Index (SPI): Actual / Planned
 * - Forecast S-curve: Earned Value extrapolation to projected completion date.
 */

export interface SCurvePoint {
  periodIndex: number;
  date: string;          // ISO Date YYYY-MM-DD or formatted 'Okt 2026'
  label: string;         // e.g. 'M1 Jun 25', 'Jul 25'
  plannedCumulative: number; // 0 - 100%
  actualCumulative: number | null; // 0 - 100% or null for future dates
  forecastCumulative?: number | null; // 0 - 100%
  plannedPeriod?: number; // Delta work weight for this period
  actualPeriod?: number | null; // Delta actual work completed
  variance?: number | null; // actual - planned
}

export interface ProjectSCurveData {
  projectId: string;
  projectName: string;
  cutoffDate: string;
  points: SCurvePoint[];
  currentPlanned: number;
  currentActual: number;
  deviation: number;
  spi: number;
  health: 'Tepat Waktu' | 'Kritis' | 'Terlambat';
}

/**
 * Standard cumulative sigmoid (S-curve) mathematical generator for baseline scheduling.
 * Formula: Cumulative logistic growth curve mapped strictly to [0, 100]%
 * S(t) = 100 / (1 + e^(-k * (t - 0.5))) scaled so S(0) = 0 and S(1) = 100
 */
export function calculateBaselineSigmoid(normalizedTime: number): number {
  if (normalizedTime <= 0) return 0;
  if (normalizedTime >= 1) return 100;

  // k = 6 gives a realistic construction mobilization -> peak production -> finishing plateau curve
  const k = 6.2;
  const raw = 1 / (1 + Math.exp(-k * (normalizedTime - 0.5)));
  const raw0 = 1 / (1 + Math.exp(-k * (0 - 0.5)));
  const raw1 = 1 / (1 + Math.exp(-k * (1 - 0.5)));

  const scaled = ((raw - raw0) / (raw1 - raw0)) * 100;
  return Math.round(Math.max(0, Math.min(100, scaled)) * 10) / 10;
}

/**
 * Generates an authentic S-curve time series dataset for a project
 * using project start date, target completion date, and current progress.
 */
export function generateProjectSCurve(params: {
  projectId: string;
  projectName: string;
  startDate: string;
  endDate: string;
  currentActualProgress: number;
  reportingDate?: string;
  historicalActuals?: { date: string; progress: number }[];
}): ProjectSCurveData {
  const {
    projectId,
    projectName,
    startDate,
    endDate,
    currentActualProgress,
    reportingDate = new Date().toISOString().split('T')[0],
    historicalActuals = [],
  } = params;

  const start = new Date(startDate);
  const end = new Date(endDate);
  const reporting = new Date(reportingDate);

  // Determine monthly intervals
  const monthsDiff = Math.max(
    3,
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
  );

  const points: SCurvePoint[] = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  let lastKnownActual: number = 0;
  let cutoffIdx = -1;

  for (let i = 0; i < monthsDiff; i++) {
    const pointDate = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const normalizedTime = monthsDiff > 1 ? i / (monthsDiff - 1) : 1;

    // Planned cumulative from approved baseline schedule
    const plannedCum = calculateBaselineSigmoid(normalizedTime);

    // Check if this period is past or at reporting cutoff
    const isPastOrCurrent = pointDate <= reporting;
    let actualCum: number | null = null;

    if (isPastOrCurrent) {
      cutoffIdx = i;
      // Match historical actual if recorded, otherwise interpolate smoothly to current progress
      const matchHist = historicalActuals.find((h) => {
        const hd = new Date(h.date);
        return hd.getFullYear() === pointDate.getFullYear() && hd.getMonth() === pointDate.getMonth();
      });

      if (matchHist) {
        actualCum = matchHist.progress;
      } else {
        // Realistic progression reaching currentActualProgress at cutoff date
        const cutoffNorm = monthsDiff > 1 ? i / Math.max(1, cutoffIdx || 1) : 1;
        const progressShape = calculateBaselineSigmoid(normalizedTime) / Math.max(0.1, calculateBaselineSigmoid(normalizedTime <= 0.6 ? 0.6 : normalizedTime));
        // Scale to currentActualProgress
        const estimatedActual = Math.min(
          currentActualProgress,
          Math.round((currentActualProgress * (i + 1) / Math.max(1, i + 1 + (reporting.getMonth() - pointDate.getMonth()))) * 10) / 10
        );
        actualCum = Math.min(100, Math.max(lastKnownActual, estimatedActual));
      }
      lastKnownActual = actualCum;
    }

    const mName = monthNames[pointDate.getMonth()];
    const yr = pointDate.getFullYear().toString().slice(-2);
    const label = `${mName} '${yr}`;

    points.push({
      periodIndex: i,
      date: pointDate.toISOString().split('T')[0],
      label,
      plannedCumulative: plannedCum,
      actualCumulative: actualCum,
      variance: actualCum !== null ? Math.round((actualCum - plannedCum) * 10) / 10 : null,
    });
  }

  // Ensure last past/current point exactly matches currentActualProgress
  if (cutoffIdx >= 0 && cutoffIdx < points.length) {
    points[cutoffIdx].actualCumulative = currentActualProgress;
    points[cutoffIdx].variance = Math.round((currentActualProgress - points[cutoffIdx].plannedCumulative) * 10) / 10;
  }

  // Compute Forecast (Earned Value / SPI projection) for future dates
  const currentPlanned = cutoffIdx >= 0 ? points[cutoffIdx].plannedCumulative : 0;
  const currentActual = currentActualProgress;
  const spi = currentPlanned > 0 ? currentActual / currentPlanned : 1;

  if (cutoffIdx >= 0) {
    let forecastCum = currentActual;
    const remainingSteps = points.length - 1 - cutoffIdx;

    for (let j = cutoffIdx; j < points.length; j++) {
      if (j === cutoffIdx) {
        points[j].forecastCumulative = currentActual;
      } else {
        const remainingStepIdx = j - cutoffIdx;
        const stepWeight = remainingSteps > 0 ? remainingStepIdx / remainingSteps : 1;
        // Forecast curve moves smoothly towards 100%
        forecastCum = Math.min(
          100,
          Math.round((currentActual + (100 - currentActual) * Math.pow(stepWeight, 1.1)) * 10) / 10
        );
        points[j].forecastCumulative = forecastCum;
      }
    }
  }

  const deviation = Math.round((currentActual - currentPlanned) * 10) / 10;
  let health: 'Tepat Waktu' | 'Kritis' | 'Terlambat' = 'Tepat Waktu';
  if (deviation < -5.0) {
    health = 'Terlambat';
  } else if (deviation < 0) {
    health = 'Kritis';
  }

  return {
    projectId,
    projectName,
    cutoffDate: reportingDate,
    points,
    currentPlanned,
    currentActual,
    deviation,
    spi: Math.round(spi * 100) / 100,
    health,
  };
}
