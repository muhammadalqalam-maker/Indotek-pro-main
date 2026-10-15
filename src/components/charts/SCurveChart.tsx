import React, { useState, useMemo, useRef } from 'react';
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Layers,
  Eye,
  Info
} from 'lucide-react';
import { SCurvePoint, ProjectSCurveData } from '../../utils/scurve';

interface SCurveChartProps {
  data: ProjectSCurveData;
  className?: string;
  showForecastToggle?: boolean;
}

export const SCurveChart: React.FC<SCurveChartProps> = ({
  data,
  className = '',
  showForecastToggle = true,
}) => {
  const [showPlanned, setShowPlanned] = useState(true);
  const [showActual, setShowActual] = useState(true);
  const [showForecast, setShowForecast] = useState(true);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const { points, currentPlanned, currentActual, deviation, cutoffDate, health, projectName } = data;

  // Chart dimensions in SVG coordinate space
  const svgWidth = 800;
  const svgHeight = 320;
  const paddingLeft = 45;
  const paddingRight = 35;
  const paddingTop = 25;
  const paddingBottom = 45;

  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;

  // Coordinate mapping functions
  const getX = (idx: number) => {
    if (points.length <= 1) return paddingLeft + chartWidth / 2;
    return paddingLeft + (idx / (points.length - 1)) * chartWidth;
  };

  const getY = (val: number) => {
    const clamped = Math.max(0, Math.min(100, val));
    return paddingTop + chartHeight - (clamped / 100) * chartHeight;
  };

  // Build SVG path strings using smooth Bézier curves
  const plannedPath = useMemo(() => {
    if (!points.length) return '';
    return points.reduce((path, pt, idx, arr) => {
      const x = getX(idx);
      const y = getY(pt.plannedCumulative);
      if (idx === 0) return `M ${x} ${y}`;
      const prevX = getX(idx - 1);
      const prevY = getY(arr[idx - 1].plannedCumulative);
      const cp1X = prevX + (x - prevX) / 2;
      const cp2X = prevX + (x - prevX) / 2;
      return `${path} C ${cp1X} ${prevY}, ${cp2X} ${y}, ${x} ${y}`;
    }, '');
  }, [points, chartWidth, chartHeight]);

  const actualPoints = useMemo(() => {
    return points.filter((p) => p.actualCumulative !== null);
  }, [points]);

  const actualPath = useMemo(() => {
    if (!actualPoints.length) return '';
    return actualPoints.reduce((path, pt, idx, arr) => {
      const originalIdx = points.findIndex((p) => p.periodIndex === pt.periodIndex);
      const x = getX(originalIdx);
      const y = getY(pt.actualCumulative!);
      if (idx === 0) return `M ${x} ${y}`;
      const prevOrigIdx = points.findIndex((p) => p.periodIndex === arr[idx - 1].periodIndex);
      const prevX = getX(prevOrigIdx);
      const prevY = getY(arr[idx - 1].actualCumulative!);
      const cp1X = prevX + (x - prevX) / 2;
      const cp2X = prevX + (x - prevX) / 2;
      return `${path} C ${cp1X} ${prevY}, ${cp2X} ${y}, ${x} ${y}`;
    }, '');
  }, [points, actualPoints, chartWidth, chartHeight]);

  // Actual area under curve
  const actualAreaPath = useMemo(() => {
    if (!actualPoints.length) return '';
    const firstOrigIdx = points.findIndex((p) => p.periodIndex === actualPoints[0].periodIndex);
    const lastOrigIdx = points.findIndex((p) => p.periodIndex === actualPoints[actualPoints.length - 1].periodIndex);
    const firstX = getX(firstOrigIdx);
    const lastX = getX(lastOrigIdx);
    const bottomY = getY(0);

    return `${actualPath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [actualPoints, actualPath, points]);

  // Forecast path from last actual point to end
  const forecastPoints = useMemo(() => {
    return points.filter((p) => p.forecastCumulative !== undefined && p.forecastCumulative !== null);
  }, [points]);

  const forecastPath = useMemo(() => {
    if (forecastPoints.length < 2) return '';
    return forecastPoints.reduce((path, pt, idx, arr) => {
      const originalIdx = points.findIndex((p) => p.periodIndex === pt.periodIndex);
      const x = getX(originalIdx);
      const y = getY(pt.forecastCumulative!);
      if (idx === 0) return `M ${x} ${y}`;
      const prevOrigIdx = points.findIndex((p) => p.periodIndex === arr[idx - 1].periodIndex);
      const prevX = getX(prevOrigIdx);
      const prevY = getY(arr[idx - 1].forecastCumulative!);
      const cp1X = prevX + (x - prevX) / 2;
      const cp2X = prevX + (x - prevX) / 2;
      return `${path} C ${cp1X} ${prevY}, ${cp2X} ${y}, ${x} ${y}`;
    }, '');
  }, [points, forecastPoints, chartWidth, chartHeight]);

  // Y-axis grid lines (0%, 20%, 40%, 60%, 80%, 100%)
  const yTicks = [0, 20, 40, 60, 80, 100];

  const activePoint = hoveredIdx !== null ? points[hoveredIdx] : null;

  if (!points || points.length === 0) {
    return (
      <div className={`p-8 bg-white rounded-xl border border-border-subtle text-center text-xs text-text-muted ${className}`}>
                  <Layers className="w-8 h-8 mx-auto text-text-muted/50 mb-2" />
                  <p className="font-semibold text-text-primary">Data Kurva-S Belum Tersedia</p>
        <p className="text-xs mt-1">Jadwal master atau bobot WBS belum dikonfigurasi untuk proyek ini.</p>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl border border-border-subtle shadow-2xs overflow-hidden ${className}`}>
      {/* Header Controls & KPI Bar */}
      <div className="p-4 sm:p-5 border-b border-border-subtle">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-canvas text-primary">
                              KURVA-S KUMULATIF
                            </span>
                            <span className="text-xs text-text-muted">·</span>
                            <span className="text-xs text-text-muted truncate max-w-[280px]">
                {projectName}
              </span>
            </div>
            <h2 className="text-sm sm:text-base font-bold text-text-primary">
              Monitoring Progres Fisik Kumulatif Proyek
            </h2>
            <p className="text-xs text-text-muted mt-0.5">
              Rencana bobot baseline vs realisasi lapangan terverifikasi & proyeksi target selesai
            </p>
          </div>

          {/* Quick Metrics Bar */}
          <div className="flex flex-wrap items-center gap-3 self-start lg:self-auto text-xs">
            <div className="px-3 py-1.5 rounded-lg border border-border-subtle bg-canvas/60">
                          <span className="text-text-muted text-xs block">Rencana Baseline</span>
                          <span className="font-mono font-bold text-info text-sm tabular-nums">
                {currentPlanned}%
              </span>
            </div>

            <div className="px-3 py-1.5 rounded-lg border border-border-subtle bg-canvas/60">
                          <span className="text-text-muted text-xs block">Realisasi Aktual</span>
                          <span className="font-mono font-bold text-primary text-sm tabular-nums">
                {currentActual}%
              </span>
            </div>

            <div
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex flex-col ${
                              deviation >= 0
                                ? 'border-success/30 bg-success/10 text-success'
                                : deviation >= -5
                                ? 'border-warning/30 bg-warning/10 text-warning-dark'
                                : 'border-danger/30 bg-danger/10 text-danger'
                            }`}
            >
              <span className="text-xs font-normal opacity-90">Deviasi Jadwal</span>
              <span className="font-mono font-bold text-sm tabular-nums">
                {deviation >= 0 ? `+${deviation}%` : `${deviation}%`}
              </span>
            </div>
          </div>
        </div>

        {/* Series Visibility Legend & Filter Bar */}
        <div className="mt-4 pt-3 border-t border-border-subtle/60 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            {/* Planned Toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showPlanned}
                onChange={(e) => setShowPlanned(e.target.checked)}
                className="rounded border-border-subtle text-info focus:ring-info"
              />
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-0.5 bg-info rounded-full inline-block" />
                                <span className="font-medium text-text-primary">Rencana (Baseline)</span>
              </div>
            </label>

            {/* Actual Toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showActual}
                onChange={(e) => setShowActual(e.target.checked)}
                className="rounded border-border-subtle text-primary focus:ring-primary"
              />
              <div className="flex items-center gap-1.5">
                <span className="w-3.5 h-1 bg-primary rounded-full inline-block" />
                                <span className="font-medium text-primary font-semibold">Realisasi Fisik</span>
              </div>
            </label>

            {/* Forecast Toggle */}
            {showForecastToggle && forecastPoints.length > 0 && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showForecast}
                  onChange={(e) => setShowForecast(e.target.checked)}
                  className="rounded border-border-subtle text-warning focus:ring-warning"
                />
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-0.5 bg-warning border-t-2 border-dashed border-warning inline-block" />
                                  <span className="font-medium text-warning-dark">Prakiraan (Forecast)</span>
                </div>
              </label>
            )}
          </div>

          <div className="text-xs text-text-muted flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            <span>Cut-off Opname: {cutoffDate}</span>
          </div>
        </div>
      </div>

      {/* Interactive S-Curve Graphic Area */}
      <div className="p-4 sm:p-5 relative" ref={containerRef}>
        <div className="w-full aspect-[21/9] min-h-[260px] max-h-[380px] relative select-none">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-full overflow-visible font-sans"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(18, 53, 43)" stopOpacity="0.16" />
                                <stop offset="100%" stopColor="rgb(18, 53, 43)" stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {/* Horizontal Gridlines & Y-Axis Labels */}
            {yTicks.map((tick) => {
              const yPos = getY(tick);
              return (
                <g key={tick}>
                  <line
                    x1={paddingLeft}
                    y1={yPos}
                    x2={svgWidth - paddingRight}
                    y2={yPos}
                    stroke="rgb(226, 232, 228)"
                    strokeWidth="1"
                    strokeDasharray={tick === 0 || tick === 100 ? undefined : '3,3'}
                  />
                  <text
                    x={paddingLeft - 8}
                    y={yPos + 4}
                    textAnchor="end"
                    className="text-xs font-mono fill-text-muted select-none"
                  >
                    {tick}%
                  </text>
                </g>
              );
            })}

            {/* Vertical Gridlines & X-Axis Month Labels */}
            {points.map((pt, idx) => {
              const xPos = getX(idx);
              // Show label every 1 or 2 months depending on density
              const showLabel = points.length <= 14 || idx % 2 === 0 || idx === points.length - 1;
              return (
                <g key={idx}>
                  <line
                    x1={xPos}
                    y1={paddingTop}
                    x2={xPos}
                    y2={svgHeight - paddingBottom}
                    stroke="rgb(245, 247, 246)"
                    strokeWidth="1"
                  />
                  {showLabel && (
                    <text
                      x={xPos}
                      y={svgHeight - paddingBottom + 16}
                      textAnchor="middle"
                      className="text-xs font-mono fill-text-muted select-none"
                    >
                      {pt.label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Actual Area Fill */}
            {showActual && actualAreaPath && (
              <path d={actualAreaPath} fill="url(#actualGradient)" />
            )}

            {/* Planned Line */}
            {showPlanned && plannedPath && (
              <path
                d={plannedPath}
                fill="none"
                stroke="rgb(37, 99, 235)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Forecast Line */}
            {showForecast && forecastPath && (
              <path
                d={forecastPath}
                fill="none"
                stroke="rgb(214, 168, 92)"
                strokeWidth="2"
                strokeDasharray="5,5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Actual Line */}
            {showActual && actualPath && (
              <path
                d={actualPath}
                fill="none"
                stroke="rgb(18, 53, 43)"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Actual Data Markers */}
            {showActual &&
              actualPoints.map((pt) => {
                const origIdx = points.findIndex((p) => p.periodIndex === pt.periodIndex);
                const x = getX(origIdx);
                const y = getY(pt.actualCumulative!);
                const isHovered = hoveredIdx === origIdx;

                return (
                  <circle
                    key={pt.periodIndex}
                    cx={x}
                    cy={y}
                    r={isHovered ? 6 : 4}
                    fill="white"
                                        stroke="rgb(18, 53, 43)"
                    strokeWidth={isHovered ? 3 : 2}
                    className="transition-all duration-150 cursor-pointer"
                  />
                );
              })}

            {/* Active Hover Crosshair Line */}
            {hoveredIdx !== null && (
              <line
                x1={getX(hoveredIdx)}
                y1={paddingTop}
                x2={getX(hoveredIdx)}
                y2={svgHeight - paddingBottom}
                stroke="rgb(18, 53, 43)"
                strokeWidth="1.2"
                strokeDasharray="2,2"
              />
            )}

            {/* Interactive Hit Areas */}
            {points.map((pt, idx) => {
              const xPos = getX(idx);
              const sliceWidth = chartWidth / Math.max(1, points.length - 1);
              return (
                <rect
                  key={idx}
                  x={xPos - sliceWidth / 2}
                  y={paddingTop}
                  width={sliceWidth}
                  height={chartHeight}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              );
            })}
          </svg>

          {/* Floating High-Fidelity Tooltip */}
          {activePoint && hoveredIdx !== null && (
            <div
              className="absolute z-20 pointer-events-none transition-all duration-100 -translate-x-1/2 bg-text-primary text-white p-3 rounded-xl shadow-xl text-xs w-52 border border-border-subtle/40"
              style={{
                left: `${(getX(hoveredIdx) / svgWidth) * 100}%`,
                top: `${Math.max(10, (getY(activePoint.actualCumulative ?? activePoint.plannedCumulative) / svgHeight) * 100 - 35)}%`,
              }}
            >
              <div className="font-semibold text-white border-b border-border-subtle/30 pb-1.5 mb-2 flex items-center justify-between">
                <span>{activePoint.label}</span>
                <span className="text-xs text-text-muted/60 font-mono">{activePoint.date}</span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-text-muted/80 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-info" />
                    Rencana:
                  </span>
                  <span className="font-mono font-bold">{activePoint.plannedCumulative}%</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-text-muted/80 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-success" />
                    Realisasi:
                  </span>
                  <span className="font-mono font-bold text-success/90">
                    {activePoint.actualCumulative !== null ? `${activePoint.actualCumulative}%` : '—'}
                  </span>
                </div>

                {activePoint.actualCumulative !== null && (
                  <div className="flex justify-between items-center pt-1 border-t border-border-subtle/30">
                    <span className="text-text-muted/80">Deviasi:</span>
                    <span
                      className={`font-mono font-bold ${
                        (activePoint.variance ?? 0) >= 0 ? 'text-success/90' : 'text-danger/90'
                      }`}
                    >
                      {(activePoint.variance ?? 0) >= 0
                        ? `+${activePoint.variance}%`
                        : `${activePoint.variance}%`}
                    </span>
                  </div>
                )}

                {activePoint.forecastCumulative !== undefined && (
                  <div className="flex justify-between items-center text-warning">
                    <span>Prakiraan:</span>
                    <span className="font-mono font-bold">{activePoint.forecastCumulative}%</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Construction Methodological Note */}
        <div className="mt-4 pt-3 border-t border-border-subtle/60 flex items-center gap-2 text-xs text-text-muted">
          <Info className="w-3.5 h-3.5 text-primary shrink-0" />
          <span>
            Perhitungan S-Curve menggunakan metode Earned Value Management (EVM) berstandar SNI & PMI.
            Bobot progres dihitung kumulatif berdasarkan pengesahan fisik BAST dan opname pekerjaan.
          </span>
        </div>
      </div>
    </div>
  );
};
