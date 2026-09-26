import React from 'react';
import { Activity, Play, Pause, RefreshCw, Cpu, Layers } from 'lucide-react';

interface HeaderProps {
  activeTab: 'overview' | 'detail' | 'alerts' | 'model';
  setActiveTab: (tab: 'overview' | 'detail' | 'alerts' | 'model') => void;
  isConnected: boolean;
  isSimulating: boolean;
  onToggleSimulation: () => void;
  onTriggerTick: () => void;
  onOpenModelModal: () => void;
  criticalCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  isConnected,
  isSimulating,
  onToggleSimulation,
  onTriggerTick,
  onOpenModelModal,
  criticalCount,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40 px-6 py-3.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('overview');
              }}
              className="text-lg font-bold tracking-tight text-white flex items-center gap-2"
            >
              IoTGuard
            </a>
          </div>
          <span className="hidden sm:inline text-xs text-slate-400 font-mono pl-2 border-l border-slate-700">
            Plant Bay Telemetry · LSTM & SHAP
          </span>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'overview'
                ? 'bg-slate-800 text-white font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Fleet Heatmap
          </button>
          <button
            onClick={() => setActiveTab('detail')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'detail'
                ? 'bg-slate-800 text-white font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Sensors & SHAP
          </button>
          <button
            onClick={() => setActiveTab('alerts')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap relative ${
              activeTab === 'alerts'
                ? 'bg-slate-800 text-white font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Alerts
            {criticalCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-400 text-[10px] font-mono font-bold">
                {criticalCount}
              </span>
            )}
          </button>
          <button
            onClick={onOpenModelModal}
            className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap flex items-center gap-1.5"
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>ML Architecture</span>
          </button>
        </nav>

        {/* Zone 3: Primary Actions & Telemetry Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Live WebSocket Indicator */}
          <div className="hidden md:flex items-center gap-1.5 text-[11px] font-mono text-slate-400 px-2.5 py-1 bg-slate-950/80 rounded border border-slate-800">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isConnected ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <span>{isConnected ? 'LIVE WS' : 'RECONNECTING'}</span>
          </div>

          {/* Toggle Simulation */}
          <button
            onClick={onToggleSimulation}
            title={isSimulating ? 'Pause background stream' : 'Resume background stream'}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md border flex items-center gap-1.5 transition-colors ${
              isSimulating
                ? 'border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-700'
                : 'border-amber-700/60 bg-amber-950/30 text-amber-300 hover:bg-amber-900/40'
            }`}
          >
            {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isSimulating ? 'Streaming' : 'Paused'}</span>
          </button>

          {/* Pulse Simulation Tick */}
          <button
            onClick={onTriggerTick}
            title="Force single telemetry packet ingestion"
            className="px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md transition-colors flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Pulse</span>
          </button>
        </div>
      </div>
    </header>
  );
};
