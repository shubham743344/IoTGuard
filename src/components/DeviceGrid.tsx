import React, { useState, useMemo } from 'react';
import { DeviceSummary } from '../types/index.ts';
import { Search, Filter, AlertCircle, ArrowUpRight, Zap, Gauge, Thermometer, Activity } from 'lucide-react';

interface DeviceGridProps {
  devices: DeviceSummary[];
  selectedDeviceId: string;
  onSelectDevice: (deviceId: string) => void;
  riskFilter: string;
  setRiskFilter: (filter: string) => void;
  onInjectQuickAnomaly?: (deviceId: string) => void;
}

export const DeviceGrid: React.FC<DeviceGridProps> = ({
  devices,
  selectedDeviceId,
  onSelectDevice,
  riskFilter,
  setRiskFilter,
  onInjectQuickAnomaly,
}) => {
  const [bayFilter, setBayFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'cards' | 'heatmap'>('cards');

  const bays = [
    { id: 'all', label: 'All Bays' },
    { id: 'Bay A - Milling', label: 'Bay A (Mill)' },
    { id: 'Bay B - Lathe', label: 'Bay B (Lathe)' },
    { id: 'Bay C - 5-Axis Multi-Task', label: 'Bay C (5-Axis)' },
    { id: 'Bay D - High-Speed Cutting', label: 'Bay D (High-Speed)' },
    { id: 'Bay E - Precision Grinding', label: 'Bay E (Grinding)' },
  ];

  const filteredDevices = useMemo(() => {
    return devices.filter((dev) => {
      if (bayFilter !== 'all' && dev.bay !== bayFilter) return false;
      if (riskFilter !== 'all' && dev.riskLevel !== riskFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          dev.id.toLowerCase().includes(q) ||
          dev.name.toLowerCase().includes(q) ||
          dev.type.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [devices, bayFilter, riskFilter, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Control bar: Bay selector, Search, View switch */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 bg-slate-900/80 rounded-lg border border-slate-800">
        {/* Bay Filter Segmented Controls */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {bays.map((b) => (
            <button
              key={b.id}
              onClick={() => setBayFilter(b.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                bayFilter === b.id
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>

        {/* Search & View Toggle */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-48">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search CNC-001..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-600"
            />
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded border border-slate-800">
            <button
              onClick={() => setViewMode('cards')}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                viewMode === 'cards' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode('heatmap')}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                viewMode === 'heatmap' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Compact
            </button>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filteredDevices.length === 0 && (
        <div className="text-center py-12 border border-dashed border-slate-800 rounded-lg">
          <AlertCircle className="w-8 h-8 text-slate-500 mx-auto mb-2" />
          <p className="text-sm text-slate-300">No CNC machines match current filters.</p>
          <button
            onClick={() => {
              setBayFilter('all');
              setRiskFilter('all');
              setSearchQuery('');
            }}
            className="mt-3 px-3 py-1.5 text-xs text-indigo-400 hover:text-indigo-300 underline"
          >
            Reset all filters
          </button>
        </div>
      )}

      {/* Heatmap Matrix View */}
      {viewMode === 'heatmap' && filteredDevices.length > 0 && (
        <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 p-4 bg-slate-900/60 border border-slate-800 rounded-lg">
          {filteredDevices.map((dev) => {
            const riskPct = Math.round(dev.currentRisk * 100);
            const isSelected = dev.id === selectedDeviceId;

            // Semantic Color Classes
            let bgClass = 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300 hover:border-emerald-500';
            if (dev.riskLevel === 'warning') {
              bgClass = 'bg-amber-950/40 border-amber-800/80 text-amber-300 hover:border-amber-500 animate-pulse';
            } else if (dev.riskLevel === 'critical') {
              bgClass = 'bg-rose-950/60 border-rose-600 text-rose-300 hover:border-rose-400 animate-pulse';
            }

            return (
              <button
                key={dev.id}
                onClick={() => onSelectDevice(dev.id)}
                className={`relative flex flex-col items-center justify-center p-2 rounded-md border text-center transition-all ${bgClass} ${
                  isSelected ? 'ring-2 ring-indigo-400 scale-105 z-10' : ''
                }`}
                title={`${dev.id} (${dev.type}) - 24h Risk: ${riskPct}% (Driver: ${dev.primaryDriver})`}
              >
                <span className="text-[11px] font-mono font-semibold tracking-tight">{dev.id.replace('CNC-', '')}</span>
                <span className="text-xs font-mono font-bold tabular-nums mt-0.5">{riskPct}%</span>
                <span className="text-[9px] text-slate-400 uppercase tracking-tighter mt-0.5">
                  {dev.primaryDriver === 'vibration' ? 'VIB' : dev.primaryDriver === 'temperature' ? 'TMP' : 'PRS'}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Grid Cards View */}
      {viewMode === 'cards' && filteredDevices.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {filteredDevices.map((dev) => {
            const isSelected = dev.id === selectedDeviceId;
            const riskPct = Math.round(dev.currentRisk * 100);
            const ciSpan = Math.round(((dev.confidenceInterval[1] - dev.confidenceInterval[0]) / 2) * 100);

            // Risk Styling
            let borderClass = 'border-slate-800 hover:border-slate-700 bg-slate-900/60';
            let riskBadgeClass = 'text-emerald-400 bg-emerald-950/50 border-emerald-800/40';
            let indicatorColor = 'bg-emerald-500';

            if (dev.riskLevel === 'warning') {
              borderClass = 'border-amber-800/70 hover:border-amber-600 bg-amber-950/20';
              riskBadgeClass = 'text-amber-400 bg-amber-950/60 border-amber-800/60';
              indicatorColor = 'bg-amber-500';
            } else if (dev.riskLevel === 'critical') {
              borderClass = 'border-rose-700 hover:border-rose-500 bg-rose-950/30';
              riskBadgeClass = 'text-rose-400 bg-rose-950/80 border-rose-700';
              indicatorColor = 'bg-rose-500';
            }

            return (
              <div
                key={dev.id}
                onClick={() => onSelectDevice(dev.id)}
                className={`group cursor-pointer rounded-lg border p-3 transition-all flex flex-col justify-between ${borderClass} ${
                  isSelected ? 'ring-2 ring-indigo-500 border-indigo-500 shadow-lg shadow-indigo-950/50' : ''
                }`}
              >
                {/* Card Top: Machine ID & 24h Risk Score */}
                <div>
                  <div className="flex items-start justify-between gap-1 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${indicatorColor}`} />
                      <span className="text-sm font-bold font-mono text-white">{dev.id}</span>
                    </div>

                    <div className={`px-2 py-0.5 rounded border text-xs font-mono font-bold tabular-nums ${riskBadgeClass}`}>
                      {riskPct}% <span className="text-[10px] opacity-75 font-normal">±{ciSpan}%</span>
                    </div>
                  </div>

                  {/* Machine type & Bay */}
                  <div className="text-[11px] text-slate-400 truncate mb-2">
                    {dev.type}
                  </div>

                  {/* Live Sensor Mini Readings */}
                  <div className="grid grid-cols-3 gap-1 bg-slate-950/70 p-2 rounded border border-slate-800/80 text-[11px] font-mono tabular-nums mb-2">
                    {/* Vibration */}
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                        <Activity className="w-2.5 h-2.5" /> Vib
                      </span>
                      <span className={`font-semibold ${dev.latestReading.vibration > 4.5 ? 'text-rose-400' : 'text-slate-200'}`}>
                        {dev.latestReading.vibration}
                        <span className="text-[9px] text-slate-400 ml-0.5">mm/s</span>
                      </span>
                    </div>

                    {/* Temperature */}
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                        <Thermometer className="w-2.5 h-2.5" /> Tmp
                      </span>
                      <span className={`font-semibold ${dev.latestReading.temperature > 75 ? 'text-amber-400' : 'text-slate-200'}`}>
                        {dev.latestReading.temperature}
                        <span className="text-[9px] text-slate-400 ml-0.5">°C</span>
                      </span>
                    </div>

                    {/* Pressure */}
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                        <Gauge className="w-2.5 h-2.5" /> Prs
                      </span>
                      <span className={`font-semibold ${dev.latestReading.pressure < 75 ? 'text-rose-400' : 'text-slate-200'}`}>
                        {dev.latestReading.pressure}
                        <span className="text-[9px] text-slate-400 ml-0.5">PSI</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Footer: Primary Driver & Detail Affordance */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1 text-slate-400 truncate max-w-[130px]">
                    <span className="text-slate-400">Driver:</span>
                    <span className={`font-medium capitalize ${
                      dev.riskLevel === 'critical' ? 'text-rose-300 font-semibold' : 'text-slate-300'
                    }`}>
                      {dev.primaryDriver}
                    </span>
                  </div>

                  <span className="text-xs text-indigo-400 group-hover:text-indigo-300 flex items-center gap-0.5 font-medium">
                    Drilldown <ArrowUpRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
