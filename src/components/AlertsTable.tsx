import React, { useState, useMemo } from 'react';
import { Alert } from '../types/index.ts';
import { AlertTriangle, Flame, CheckCircle2, ShieldAlert, Filter, Search, ArrowRight } from 'lucide-react';

interface AlertsTableProps {
  alerts: Alert[];
  onAcknowledge: (alertId: string, operator?: string) => void;
  onSelectDevice: (deviceId: string) => void;
}

export const AlertsTable: React.FC<AlertsTableProps> = ({
  alerts,
  onAcknowledge,
  onSelectDevice,
}) => {
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unack' | 'ack'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredAlerts = useMemo(() => {
    return alerts.filter((a) => {
      if (severityFilter !== 'all' && a.severity !== severityFilter) return false;
      if (statusFilter === 'unack' && a.acknowledged) return false;
      if (statusFilter === 'ack' && !a.acknowledged) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          a.device_id.toLowerCase().includes(q) ||
          a.bay.toLowerCase().includes(q) ||
          a.message.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [alerts, severityFilter, statusFilter, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Control / Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-slate-900/80 rounded-lg border border-slate-800">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <div className="flex items-center bg-slate-950 p-0.5 rounded border border-slate-800">
            <button
              onClick={() => setSeverityFilter('all')}
              className={`px-3 py-1.5 text-xs rounded transition-colors whitespace-nowrap ${
                severityFilter === 'all' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Severities
            </button>
            <button
              onClick={() => setSeverityFilter('critical')}
              className={`px-3 py-1.5 text-xs rounded transition-colors whitespace-nowrap ${
                severityFilter === 'critical' ? 'bg-rose-950 text-rose-300 font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Critical Only
            </button>
            <button
              onClick={() => setSeverityFilter('warning')}
              className={`px-3 py-1.5 text-xs rounded transition-colors whitespace-nowrap ${
                severityFilter === 'warning' ? 'bg-amber-950 text-amber-300 font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Warnings
            </button>
          </div>

          <div className="flex items-center bg-slate-950 p-0.5 rounded border border-slate-800">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1.5 text-xs rounded transition-colors whitespace-nowrap ${
                statusFilter === 'all' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('unack')}
              className={`px-2.5 py-1.5 text-xs rounded transition-colors whitespace-nowrap ${
                statusFilter === 'unack' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Active Open
            </button>
            <button
              onClick={() => setStatusFilter('ack')}
              className={`px-2.5 py-1.5 text-xs rounded transition-colors whitespace-nowrap ${
                statusFilter === 'ack' ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Acknowledged
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search by device or bay..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-600"
          />
        </div>
      </div>

      {/* Alerts Table */}
      <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/60">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px]">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Severity</th>
                <th className="py-2.5 px-4 font-semibold">Device</th>
                <th className="py-2.5 px-4 font-semibold">Plant Bay</th>
                <th className="py-2.5 px-4 font-semibold">24h Risk</th>
                <th className="py-2.5 px-4 font-semibold">Trigger Sensor</th>
                <th className="py-2.5 px-4 font-semibold">Diagnostic Message</th>
                <th className="py-2.5 px-4 font-semibold">Timestamp</th>
                <th className="py-2.5 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredAlerts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500 font-mono">
                    No active alerts matching current filters.
                  </td>
                </tr>
              ) : (
                filteredAlerts.map((alert) => {
                  const isCritical = alert.severity === 'critical';
                  const riskPct = Math.round(alert.riskScore * 100);

                  return (
                    <tr
                      key={alert.id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        !alert.acknowledged && isCritical ? 'bg-rose-950/15' : ''
                      }`}
                    >
                      {/* Severity */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 text-[11px] font-mono font-semibold uppercase ${
                            isCritical ? 'text-rose-400' : 'text-amber-400'
                          }`}
                        >
                          {isCritical ? (
                            <Flame className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                          )}
                          {alert.severity}
                        </span>
                      </td>

                      {/* Device ID */}
                      <td className="py-3 px-4 font-mono font-bold text-white whitespace-nowrap">
                        <button
                          onClick={() => onSelectDevice(alert.device_id)}
                          className="hover:text-indigo-400 transition-colors flex items-center gap-1 group"
                        >
                          <span>{alert.device_id}</span>
                          <ArrowRight className="w-3 h-3 text-slate-500 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                      </td>

                      {/* Bay */}
                      <td className="py-3 px-4 text-slate-300 font-mono text-[11px] whitespace-nowrap">
                        {alert.bay}
                      </td>

                      {/* Risk Score */}
                      <td className="py-3 px-4 font-mono font-semibold tabular-nums whitespace-nowrap">
                        <span
                          className={
                            riskPct >= 65
                              ? 'text-rose-400'
                              : riskPct >= 20
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }
                        >
                          {riskPct}%
                        </span>
                      </td>

                      {/* Trigger Sensor */}
                      <td className="py-3 px-4 capitalize font-mono text-slate-300 whitespace-nowrap">
                        {alert.triggeredSensor}
                      </td>

                      {/* Diagnostic Message */}
                      <td className="py-3 px-4 text-slate-200 max-w-md truncate" title={alert.message}>
                        {alert.message}
                      </td>

                      {/* Timestamp */}
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                        {new Date(alert.timestamp).toLocaleTimeString()}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {alert.acknowledged ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400/80 font-mono">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            Ack ({alert.acknowledgedBy || 'Tech'})
                          </span>
                        ) : (
                          <button
                            onClick={() => onAcknowledge(alert.id, 'Duty Engineer')}
                            className="px-2.5 py-1 text-[11px] font-medium rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                          >
                            Acknowledge
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
