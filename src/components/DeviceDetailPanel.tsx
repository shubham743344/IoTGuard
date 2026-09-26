import React, { useState } from 'react';
import { DeviceSummary, ForecastResult, SensorReading } from '../types/index.ts';
import {
  Activity,
  Thermometer,
  Gauge,
  AlertTriangle,
  Flame,
  ShieldCheck,
  RotateCcw,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Info,
  Wrench,
  TrendingUp,
  Brain,
  Layers,
} from 'lucide-react';

interface DeviceDetailPanelProps {
  device: DeviceSummary | undefined;
  devices: DeviceSummary[];
  forecast: ForecastResult | null;
  readings: SensorReading[];
  resampledHourly: any[];
  onSelectDevice: (deviceId: string) => void;
  onInjectAnomaly: (deviceId: string, type: 'bearing_vibration' | 'hydraulic_pressure' | 'thermal_runaway') => void;
  onResetDevice: (deviceId: string) => void;
  onOpenModelModal: () => void;
}

export const DeviceDetailPanel: React.FC<DeviceDetailPanelProps> = ({
  device,
  devices,
  forecast,
  readings,
  resampledHourly,
  onSelectDevice,
  onInjectAnomaly,
  onResetDevice,
  onOpenModelModal,
}) => {
  const [selectedSensorTab, setSelectedSensorTab] = useState<'all' | 'vibration' | 'temperature' | 'pressure'>('all');
  const [isInjecting, setIsInjecting] = useState<boolean>(false);

  if (!device) {
    return (
      <div className="p-12 text-center text-slate-400 bg-slate-900/60 rounded-lg border border-slate-800">
        <Info className="w-8 h-8 mx-auto mb-2 text-slate-500" />
        <p>Select a CNC machine from the grid to inspect sensor telemetry, LSTM forecasts, and SHAP explainability.</p>
      </div>
    );
  }

  // Device navigation
  const currentIndex = devices.findIndex((d) => d.id === device.id);
  const prevDevice = currentIndex > 0 ? devices[currentIndex - 1] : devices[devices.length - 1];
  const nextDevice = currentIndex < devices.length - 1 ? devices[currentIndex + 1] : devices[0];

  const riskPct = Math.round(device.currentRisk * 100);
  const ciLowerPct = Math.round(device.confidenceInterval[0] * 100);
  const ciUpperPct = Math.round(device.confidenceInterval[1] * 100);
  const ciMargin = Math.round((ciUpperPct - ciLowerPct) / 2);

  // Status Badge
  let statusBadge = (
    <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
      <ShieldCheck className="w-4 h-4 text-emerald-400" /> Nominal
    </span>
  );
  if (device.riskLevel === 'warning') {
    statusBadge = (
      <span className="flex items-center gap-1.5 text-xs text-amber-400 font-medium">
        <AlertTriangle className="w-4 h-4 text-amber-400" /> Degraded Warning
      </span>
    );
  } else if (device.riskLevel === 'critical') {
    statusBadge = (
      <span className="flex items-center gap-1.5 text-xs text-rose-400 font-semibold animate-pulse">
        <Flame className="w-4 h-4 text-rose-400" /> Critical Risk
      </span>
    );
  }

  // Render SVG time-series charts
  const chartData = readings.length > 0 ? readings.slice(-48) : [];
  const svgWidth = 600;
  const svgHeight = 140;
  const padding = { top: 15, right: 20, bottom: 25, left: 45 };
  const plotWidth = svgWidth - padding.left - padding.right;
  const plotHeight = svgHeight - padding.top - padding.bottom;

  const renderSensorChart = (
    sensorKey: 'vibration' | 'temperature' | 'pressure',
    title: string,
    unit: string,
    baselineMin: number,
    baselineMax: number,
    warningThreshold: number,
    criticalThreshold: number,
    strokeColor: string,
    icon: React.ReactNode
  ) => {
    if (chartData.length < 2) {
      return (
        <div className="h-32 flex items-center justify-center text-xs text-slate-500 font-mono">
          Buffering live telemetry window...
        </div>
      );
    }

    const values = chartData.map((d) => d[sensorKey]);
    const minVal = Math.min(...values, baselineMin * 0.8);
    const maxVal = Math.max(...values, criticalThreshold * 1.15, baselineMax * 1.2);
    const valRange = maxVal - minVal || 1;

    const getY = (val: number) => {
      return padding.top + plotHeight - ((val - minVal) / valRange) * plotHeight;
    };

    const getX = (idx: number) => {
      return padding.left + (idx / (chartData.length - 1)) * plotWidth;
    };

    // Build polyline points
    const points = chartData.map((d, i) => `${getX(i).toFixed(1)},${getY(d[sensorKey]).toFixed(1)}`).join(' ');

    // Baseline band coordinates
    const baselineTopY = getY(baselineMax);
    const baselineBottomY = getY(baselineMin);
    const warningY = getY(warningThreshold);
    const criticalY = getY(criticalThreshold);

    const latestVal = chartData[chartData.length - 1][sensorKey];
    const isAboveWarning = sensorKey === 'pressure' ? latestVal < warningThreshold : latestVal > warningThreshold;

    return (
      <div className="bg-slate-950/70 rounded-lg p-3.5 border border-slate-800">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-300">
              {icon}
            </span>
            <div>
              <div className="text-xs font-semibold text-slate-200">{title}</div>
              <div className="text-[10px] text-slate-500 font-mono">
                Baseline: {baselineMin} - {baselineMax} {unit} · Warning: {warningThreshold} {unit}
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className={`text-base font-bold font-mono tabular-nums ${isAboveWarning ? 'text-rose-400' : 'text-slate-100'}`}>
              {latestVal} <span className="text-xs font-normal text-slate-400">{unit}</span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              {sensorKey === 'pressure'
                ? latestVal < baselineMin ? 'Below Pressure' : 'Nominal'
                : latestVal > baselineMax ? 'Over Baseline' : 'Nominal'}
            </div>
          </div>
        </div>

        {/* SVG Chart */}
        <div className="w-full overflow-hidden">
          <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-32 overflow-visible select-none">
            {/* Grid horizontal lines */}
            <line x1={padding.left} y1={padding.top} x2={svgWidth - padding.right} y2={padding.top} stroke="#1e293b" strokeDasharray="2 2" />
            <line x1={padding.left} y1={padding.top + plotHeight / 2} x2={svgWidth - padding.right} y2={padding.top + plotHeight / 2} stroke="#1e293b" strokeDasharray="2 2" />
            <line x1={padding.left} y1={padding.top + plotHeight} x2={svgWidth - padding.right} y2={padding.top + plotHeight} stroke="#1e293b" />

            {/* Nominal baseline envelope band */}
            <rect
              x={padding.left}
              y={Math.min(baselineTopY, baselineBottomY)}
              width={plotWidth}
              height={Math.abs(baselineBottomY - baselineTopY)}
              fill="#065f46"
              fillOpacity="0.12"
              stroke="#059669"
              strokeOpacity="0.25"
              strokeDasharray="2 2"
            />

            {/* Warning threshold line */}
            <line
              x1={padding.left}
              y1={warningY}
              x2={svgWidth - padding.right}
              y2={warningY}
              stroke="#d97706"
              strokeDasharray="3 3"
              strokeWidth="1"
            />

            {/* Critical threshold line */}
            <line
              x1={padding.left}
              y1={criticalY}
              x2={svgWidth - padding.right}
              y2={criticalY}
              stroke="#e11d48"
              strokeDasharray="4 2"
              strokeWidth="1.2"
            />

            {/* Trend line */}
            <polyline fill="none" stroke={strokeColor} strokeWidth="2" points={points} strokeLinecap="round" strokeLinejoin="round" />

            {/* Blackout / Imputation gap markers */}
            {chartData.map((d, i) => {
              if (d.is_blackout || d.is_imputed) {
                return (
                  <circle
                    key={`blackout-${i}`}
                    cx={getX(i)}
                    cy={getY(d[sensorKey])}
                    r="3.5"
                    fill="#3b82f6"
                    stroke="#ffffff"
                    strokeWidth="1"
                  >
                    <title>{`Sensor Gap: Reconstructed via forward-fill + interpolation at ${new Date(d.timestamp).toLocaleTimeString()}`}</title>
                  </circle>
                );
              }
              return null;
            })}

            {/* Latest point pulse */}
            <circle
              cx={getX(chartData.length - 1)}
              cy={getY(latestVal)}
              r="4"
              fill={strokeColor}
              className="animate-pulse"
            />

            {/* Y Axis Labels */}
            <text x={padding.left - 6} y={padding.top + 4} fill="#64748b" fontSize="9" textAnchor="end" fontFamily="JetBrains Mono">
              {maxVal.toFixed(0)}
            </text>
            <text x={padding.left - 6} y={padding.top + plotHeight} fill="#64748b" fontSize="9" textAnchor="end" fontFamily="JetBrains Mono">
              {minVal.toFixed(0)}
            </text>

            {/* Threshold Tag on Right */}
            <text x={svgWidth - padding.right + 4} y={criticalY + 3} fill="#f43f5e" fontSize="8" fontFamily="JetBrains Mono">
              CRIT
            </text>
            <text x={svgWidth - padding.right + 4} y={warningY + 3} fill="#fbbf24" fontSize="8" fontFamily="JetBrains Mono">
              WARN
            </text>
          </svg>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card: Navigation & Device Metadata */}
      <div className="bg-slate-900/90 rounded-lg border border-slate-800 p-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Quick Prev/Next buttons */}
            <div className="flex items-center bg-slate-950 rounded border border-slate-800">
              <button
                onClick={() => onSelectDevice(prevDevice.id)}
                title={`Previous: ${prevDevice.id}`}
                className="p-1.5 text-slate-400 hover:text-white transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => onSelectDevice(nextDevice.id)}
                title={`Next: ${nextDevice.id}`}
                className="p-1.5 text-slate-400 hover:text-white transition-colors border-l border-slate-800"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold font-mono text-white tracking-tight">{device.id}</h2>
                <span className="text-sm text-slate-300 font-medium">· {device.name}</span>
                <span className="px-2 py-0.5 text-[11px] rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono">
                  {device.bay}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 font-mono">
                <span>{device.type}</span>
                <span>·</span>
                <span>Max {device.rpm.toLocaleString()} RPM</span>
                <span>·</span>
                <span>Last Service: {device.lastMaintenance}</span>
              </div>
            </div>
          </div>

          {/* Status & Maintenance Action Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="px-3 py-1 rounded bg-slate-950 border border-slate-800">
              {statusBadge}
            </div>

            {/* Reset / Service Button */}
            <button
              onClick={() => onResetDevice(device.id)}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800 text-emerald-300 transition-colors flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Service / Reset Nominal</span>
            </button>

            {/* Anomaly Injection Toggle Button */}
            <div className="relative">
              <button
                onClick={() => setIsInjecting(!isInjecting)}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-rose-950/60 hover:bg-rose-900/60 border border-rose-800 text-rose-300 transition-colors flex items-center gap-1.5"
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>Inject Fault Demo</span>
              </button>

              {isInjecting && (
                <div className="absolute right-0 mt-2 w-64 p-3 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-30 space-y-2">
                  <div className="text-xs font-semibold text-slate-200 border-b border-slate-800 pb-1.5">
                    Inject Sensor Failure Signature:
                  </div>
                  <button
                    onClick={() => {
                      onInjectAnomaly(device.id, 'bearing_vibration');
                      setIsInjecting(false);
                    }}
                    className="w-full text-left p-2 rounded bg-slate-950 hover:bg-slate-800 text-xs text-rose-300 border border-slate-800 flex items-center justify-between"
                  >
                    <span>Spindle Bearing Wear</span>
                    <span className="text-[10px] text-slate-500 font-mono">+Vibration Spike</span>
                  </button>
                  <button
                    onClick={() => {
                      onInjectAnomaly(device.id, 'hydraulic_pressure');
                      setIsInjecting(false);
                    }}
                    className="w-full text-left p-2 rounded bg-slate-950 hover:bg-slate-800 text-xs text-amber-300 border border-slate-800 flex items-center justify-between"
                  >
                    <span>Hydraulic Seal Bleed</span>
                    <span className="text-[10px] text-slate-500 font-mono">-Pressure Drop</span>
                  </button>
                  <button
                    onClick={() => {
                      onInjectAnomaly(device.id, 'thermal_runaway');
                      setIsInjecting(false);
                    }}
                    className="w-full text-left p-2 rounded bg-slate-950 hover:bg-slate-800 text-xs text-rose-300 border border-slate-800 flex items-center justify-between"
                  >
                    <span>Thermal Coil Runaway</span>
                    <span className="text-[10px] text-slate-500 font-mono">+Heat Spike</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Grid: Left Forecast & MC Uncertainty / Right SHAP Explainability */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: 24-Hour Failure Probability + MC Dropout Confidence Interval */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900/90 rounded-lg border border-slate-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <Brain className="w-4 h-4 text-indigo-400" />
                <span>24-Hour Failure Probability</span>
              </div>
              <button
                onClick={onOpenModelModal}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 underline font-mono"
              >
                LSTM Details
              </button>
            </div>

            {/* Main Risk Display */}
            <div className="bg-slate-950/80 p-4 rounded-lg border border-slate-800 mb-4">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-4xl font-extrabold font-mono tracking-tight tabular-nums text-white flex items-baseline gap-1">
                    <span
                      className={
                        riskPct >= 65 ? 'text-rose-400' : riskPct >= 20 ? 'text-amber-400' : 'text-emerald-400'
                      }
                    >
                      {riskPct}%
                    </span>
                    <span className="text-sm font-normal text-slate-400 font-mono">
                      (±{ciMargin}%)
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    95% Confidence Interval:{' '}
                    <span className="font-mono text-slate-300">
                      [{ciLowerPct}%, {ciUpperPct}%]
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span
                    className={`px-2.5 py-1 rounded text-xs font-semibold font-mono uppercase tracking-wider ${
                      device.riskLevel === 'critical'
                        ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                        : device.riskLevel === 'warning'
                        ? 'bg-amber-950/80 text-amber-300 border border-amber-800'
                        : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                    }`}
                  >
                    {device.riskLevel}
                  </span>
                  <div className="text-[10px] text-slate-500 font-mono mt-1">
                    Horizon: 24h
                  </div>
                </div>
              </div>

              {/* Progress bar visual */}
              <div className="mt-3 w-full bg-slate-900 h-2.5 rounded-full overflow-hidden relative">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    riskPct >= 65
                      ? 'bg-gradient-to-r from-amber-500 to-rose-500'
                      : riskPct >= 20
                      ? 'bg-gradient-to-r from-emerald-500 to-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(4, riskPct))}%` }}
                />
                {/* 95% CI shadow band */}
                <div
                  className="absolute top-0 bottom-0 bg-white/20 border-x border-white/40"
                  style={{
                    left: `${ciLowerPct}%`,
                    width: `${Math.max(2, ciUpperPct - ciLowerPct)}%`,
                  }}
                  title={`95% CI: ${ciLowerPct}% - ${ciUpperPct}%`}
                />
              </div>
            </div>

            {/* Monte Carlo Dropout 20-Sample Stochastic Distribution */}
            {forecast?.mcDistribution && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>MC Dropout Distribution (N=20 passes)</span>
                  <span className="text-slate-500">
                    σ = ±{(forecast.mcDistribution.std * 100).toFixed(1)}%
                  </span>
                </div>

                {/* Strip plot representation of 20 samples */}
                <div className="p-2.5 bg-slate-950/60 rounded border border-slate-800/80">
                  <div className="relative h-6 bg-slate-900/60 rounded w-full flex items-center">
                    {/* Tick markings for 0, 50, 100 */}
                    <div className="absolute left-0 text-[9px] text-slate-600 font-mono -bottom-4">0%</div>
                    <div className="absolute left-1/2 -translate-x-1/2 text-[9px] text-slate-600 font-mono -bottom-4">50%</div>
                    <div className="absolute right-0 text-[9px] text-slate-600 font-mono -bottom-4">100%</div>

                    {/* CI band */}
                    <div
                      className="absolute top-1 bottom-1 bg-indigo-500/20 rounded"
                      style={{
                        left: `${ciLowerPct}%`,
                        width: `${Math.max(2, ciUpperPct - ciLowerPct)}%`,
                      }}
                    />

                    {/* Individual stochastic pass dots */}
                    {forecast.mcDistribution.samples.map((s, idx) => (
                      <div
                        key={idx}
                        className="absolute w-1.5 h-3 rounded-full bg-indigo-400/70 hover:bg-white hover:scale-125 transition-transform"
                        style={{ left: `${Math.min(99, Math.max(1, s * 100))}%` }}
                        title={`Pass #${idx + 1}: ${(s * 100).toFixed(1)}% failure probability`}
                      />
                    ))}

                    {/* Mean line indicator */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-amber-400 shadow-sm shadow-amber-500"
                      style={{ left: `${riskPct}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-5 text-center">
                    Active dropout (p=0.20) isolates epistemic model variance from sensor noise.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Preprocessing & Imputation Verification */}
          <div className="bg-slate-900/70 rounded-lg border border-slate-800 p-3.5 text-xs space-y-2">
            <div className="font-semibold text-slate-300 flex items-center justify-between">
              <span>Preprocessing & Telemetry Health</span>
              <span className="font-mono text-[11px] text-slate-400">1h Resampled</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="p-2 rounded bg-slate-950 border border-slate-800/80">
                <span className="text-slate-400 block text-[10px]">Sensor Gaps Imputed</span>
                <span className="text-white font-semibold">
                  {forecast?.preprocessedSummary.imputedGapsCount || 0} / 24 hrs
                </span>
                <span className="text-[9px] text-emerald-400 block">Forward-fill + Spline</span>
              </div>
              <div className="p-2 rounded bg-slate-950 border border-slate-800/80">
                <span className="text-slate-400 block text-[10px]">RNN Input Shape</span>
                <span className="text-white font-semibold">[24, 3] Multivariate</span>
                <span className="text-[9px] text-indigo-400 block">Z-Score Scaled</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: SHAP Feature Explainability & Diagnostics */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-slate-900/90 rounded-lg border border-slate-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span>SHAP Feature Attribution (Why is this device at risk?)</span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Base Risk E[f(x)] = 8.2%
              </span>
            </div>

            {/* Diagnostic Box: Direct Answer */}
            <div
              className={`p-3.5 rounded-lg border mb-4 ${
                riskPct >= 65
                  ? 'bg-rose-950/30 border-rose-800/70 text-rose-200'
                  : riskPct >= 20
                  ? 'bg-amber-950/30 border-amber-800/70 text-amber-200'
                  : 'bg-emerald-950/30 border-emerald-800/70 text-emerald-200'
              }`}
            >
              <div className="text-xs font-semibold uppercase tracking-wider mb-1 flex items-center gap-1 font-mono">
                {riskPct >= 65 ? <Flame className="w-3.5 h-3.5 text-rose-400" /> : <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />}
                <span>Engineering Diagnosis</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-200">
                {forecast?.shap.driverSummary ||
                  'Equipment operating nominal. Sensor parameters are within calibrated ISO 10816 limits.'}
              </p>
            </div>

            {/* SHAP Bar Chart */}
            {forecast?.shap?.attributions && (
              <div className="space-y-3">
                <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between border-b border-slate-800 pb-1">
                  <span>Sensor Feature</span>
                  <span>SHAP Value Delta (vs Baseline)</span>
                </div>

                {forecast.shap.attributions.map((attr) => {
                  const isPrimary = attr.sensor === forecast.shap.primaryDriver;
                  const deltaPct = (attr.shapValue * 100).toFixed(1);
                  const isPositive = attr.shapValue > 0;

                  return (
                    <div
                      key={attr.sensor}
                      className={`p-3 rounded-lg border transition-all ${
                        isPrimary && riskPct >= 20
                          ? 'bg-slate-950 border-amber-800/60 shadow-md'
                          : 'bg-slate-950/60 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-200">{attr.sensorLabel}</span>
                          {isPrimary && riskPct >= 20 && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 text-[10px] font-mono font-bold">
                              PRIMARY DRIVER
                            </span>
                          )}
                        </div>

                        <div className="font-mono tabular-nums text-xs">
                          <span className={`font-bold ${isPositive ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {isPositive ? `+${deltaPct}%` : `${deltaPct}%`}
                          </span>
                          <span className="text-slate-500 text-[11px] ml-1.5">
                            ({attr.relativePercentage}% share)
                          </span>
                        </div>
                      </div>

                      {/* Bar Visualization */}
                      <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden mb-2">
                        <div
                          className={`h-full rounded-full ${
                            attr.sensor === 'vibration'
                              ? 'bg-rose-500'
                              : attr.sensor === 'pressure'
                              ? 'bg-blue-500'
                              : 'bg-amber-500'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(3, attr.relativePercentage))}%` }}
                        />
                      </div>

                      {/* Engineering Context & Values */}
                      <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                        <span>
                          Current: <strong className="text-slate-200">{attr.currentValue} {attr.unit}</strong> (Normal: {attr.normalBaseline})
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-300 italic">
                        "{attr.explanationText}"
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sensor Trend Charts Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-400" />
              <span>Multi-Sensor Time-Series Trends (48-Reading History)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Live factory telemetry, ISO-10816 normal bands (green envelope), warning/critical lines, and blackout gap repairs (blue dots).
            </p>
          </div>

          {/* Sensor Tabs */}
          <div className="flex items-center bg-slate-900 p-0.5 rounded border border-slate-800">
            <button
              onClick={() => setSelectedSensorTab('all')}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                selectedSensorTab === 'all' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Sensors
            </button>
            <button
              onClick={() => setSelectedSensorTab('vibration')}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                selectedSensorTab === 'vibration' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Vibration
            </button>
            <button
              onClick={() => setSelectedSensorTab('temperature')}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                selectedSensorTab === 'temperature' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Temperature
            </button>
            <button
              onClick={() => setSelectedSensorTab('pressure')}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                selectedSensorTab === 'pressure' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Pressure
            </button>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(selectedSensorTab === 'all' || selectedSensorTab === 'vibration') && (
            <div className={selectedSensorTab !== 'all' ? 'col-span-3' : ''}>
              {renderSensorChart(
                'vibration',
                'Spindle Vibration',
                'mm/s',
                1.5,
                3.5,
                4.5,
                7.0,
                '#f43f5e',
                <Activity className="w-3.5 h-3.5 text-rose-400" />
              )}
            </div>
          )}

          {(selectedSensorTab === 'all' || selectedSensorTab === 'temperature') && (
            <div className={selectedSensorTab !== 'all' ? 'col-span-3' : ''}>
              {renderSensorChart(
                'temperature',
                'Motor Core Temperature',
                '°C',
                45.0,
                65.0,
                75.0,
                90.0,
                '#f59e0b',
                <Thermometer className="w-3.5 h-3.5 text-amber-400" />
              )}
            </div>
          )}

          {(selectedSensorTab === 'all' || selectedSensorTab === 'pressure') && (
            <div className={selectedSensorTab !== 'all' ? 'col-span-3' : ''}>
              {renderSensorChart(
                'pressure',
                'Hydraulic Line Pressure',
                'PSI',
                85.0,
                105.0,
                75.0,
                60.0,
                '#3b82f6',
                <Gauge className="w-3.5 h-3.5 text-blue-400" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
