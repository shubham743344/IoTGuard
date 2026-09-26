import React from 'react';
import { DeviceSummary } from '../types/index.ts';
import { ShieldCheck, AlertTriangle, Flame, Activity, BrainCircuit } from 'lucide-react';

interface QuickMetricsBannerProps {
  devices: DeviceSummary[];
  onFilterRisk?: (risk: string) => void;
  selectedRiskFilter?: string;
  onOpenModelModal?: () => void;
}

export const QuickMetricsBanner: React.FC<QuickMetricsBannerProps> = ({
  devices,
  onFilterRisk,
  selectedRiskFilter = 'all',
  onOpenModelModal,
}) => {
  const total = devices.length;
  const nominal = devices.filter((d) => d.riskLevel === 'nominal').length;
  const warning = devices.filter((d) => d.riskLevel === 'warning').length;
  const critical = devices.filter((d) => d.riskLevel === 'critical').length;
  const failingCount = devices.filter((d) => d.status === 'fail' || d.status === 'degraded').length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
      {/* 1. Fleet Total */}
      <div
        onClick={() => onFilterRisk?.('all')}
        className={`cursor-pointer rounded-lg border p-3.5 transition-all ${
          selectedRiskFilter === 'all'
            ? 'bg-slate-900 border-slate-600 ring-1 ring-slate-500'
            : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
        }`}
      >
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span>Active Fleet</span>
          <Activity className="w-3.5 h-3.5 text-slate-400" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono text-white tabular-nums">{total}</span>
          <span className="text-xs text-slate-400">CNC units</span>
        </div>
        <div className="mt-1 text-[11px] text-slate-400 flex items-center gap-1 font-mono">
          <span>5 Industrial Bays</span>
          <span>·</span>
          <span>~2k pts/unit</span>
        </div>
      </div>

      {/* 2. Nominal Risk */}
      <div
        onClick={() => onFilterRisk?.('nominal')}
        className={`cursor-pointer rounded-lg border p-3.5 transition-all ${
          selectedRiskFilter === 'nominal'
            ? 'bg-emerald-950/40 border-emerald-600 ring-1 ring-emerald-500'
            : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
        }`}
      >
        <div className="flex items-center justify-between text-xs text-emerald-400 mb-1">
          <span>Nominal (&lt;20%)</span>
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">{nominal}</span>
          <span className="text-xs text-slate-400">
            {total > 0 ? Math.round((nominal / total) * 100) : 0}%
          </span>
        </div>
        <div className="mt-1 text-[11px] text-slate-400 font-mono">
          Safe operating envelope
        </div>
      </div>

      {/* 3. Warning Risk */}
      <div
        onClick={() => onFilterRisk?.('warning')}
        className={`cursor-pointer rounded-lg border p-3.5 transition-all ${
          selectedRiskFilter === 'warning'
            ? 'bg-amber-950/40 border-amber-600 ring-1 ring-amber-500'
            : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
        }`}
      >
        <div className="flex items-center justify-between text-xs text-amber-400 mb-1">
          <span>Warning (20-65%)</span>
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono text-amber-400 tabular-nums">{warning}</span>
          <span className="text-xs text-amber-400/80">Early warning</span>
        </div>
        <div className="mt-1 text-[11px] text-slate-400 font-mono">
          Schedule planned inspection
        </div>
      </div>

      {/* 4. Critical Risk */}
      <div
        onClick={() => onFilterRisk?.('critical')}
        className={`cursor-pointer rounded-lg border p-3.5 transition-all ${
          selectedRiskFilter === 'critical'
            ? 'bg-rose-950/40 border-rose-600 ring-1 ring-rose-500'
            : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
        }`}
      >
        <div className="flex items-center justify-between text-xs text-rose-400 mb-1">
          <span>Critical (&ge;65%)</span>
          <Flame className="w-3.5 h-3.5 text-rose-400" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono text-rose-400 tabular-nums">{critical}</span>
          <span className="text-xs text-rose-400/80">Immediate action</span>
        </div>
        <div className="mt-1 text-[11px] text-slate-400 font-mono">
          24h failure forecast &gt; 65%
        </div>
      </div>

      {/* 5. ML Pipeline Specs */}
      <div
        onClick={onOpenModelModal}
        className="cursor-pointer rounded-lg border border-slate-800 bg-slate-900/60 p-3.5 hover:border-slate-700 transition-all col-span-2 md:col-span-1"
      >
        <div className="flex items-center justify-between text-xs text-indigo-400 mb-1">
          <span>LSTM Pipeline</span>
          <BrainCircuit className="w-3.5 h-3.5 text-indigo-400" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono text-indigo-300 tabular-nums">3.8%</span>
          <span className="text-xs text-slate-400">MAE (target &lt;5%)</span>
        </div>
        <div className="mt-1 text-[11px] text-slate-400 font-mono truncate">
          MC Dropout (N=20) · SHAP
        </div>
      </div>
    </div>
  );
};
