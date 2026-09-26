import React, { useState } from 'react';
import { useIoTData } from './hooks/useIoTData.ts';
import { Header } from './components/Header.tsx';
import { QuickMetricsBanner } from './components/QuickMetricsBanner.tsx';
import { DeviceGrid } from './components/DeviceGrid.tsx';
import { DeviceDetailPanel } from './components/DeviceDetailPanel.tsx';
import { AlertsTable } from './components/AlertsTable.tsx';
import { ModelPipelineModal } from './components/ModelPipelineModal.tsx';
import { CustomIngestionModal } from './components/CustomIngestionModal.tsx';
import { PlusCircle, Cpu, ShieldCheck, Activity, Terminal } from 'lucide-react';

export default function App() {
  const {
    devices,
    alerts,
    selectedDeviceId,
    setSelectedDeviceId,
    selectedDeviceForecast,
    selectedDeviceReadings,
    resampledHourly,
    isConnected,
    isSimulating,
    lastTickTime,
    loading,
    acknowledgeAlert,
    injectAnomaly,
    resetDevice,
    toggleSimulation,
    triggerManualTick,
    refreshFleet,
    refreshSelected,
  } = useIoTData();

  const [activeTab, setActiveTab] = useState<'overview' | 'detail' | 'alerts' | 'model'>('overview');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [isModelModalOpen, setIsModelModalOpen] = useState<boolean>(false);
  const [isIngestModalOpen, setIsIngestModalOpen] = useState<boolean>(false);

  const selectedDevice = devices.find((d) => d.id === selectedDeviceId);
  const criticalCount = alerts.filter((a) => !a.acknowledged && a.severity === 'critical').length;

  const handleSelectDevice = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    setActiveTab('detail');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30">
      {/* 1. Global Navigation Bar */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isConnected={isConnected}
        isSimulating={isSimulating}
        onToggleSimulation={toggleSimulation}
        onTriggerTick={triggerManualTick}
        onOpenModelModal={() => setIsModelModalOpen(true)}
        criticalCount={criticalCount}
      />

      {/* 2. Main Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Banner with contextual action controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-slate-800/80">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <span>Predictive Maintenance Operations Center</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">
              CNC Machine Plant Telemetry · 50 Connected Nodes · Recurrent 24h LSTM Forecast · Exact SHAP
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsIngestModalOpen(true)}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-1.5"
            >
              <PlusCircle className="w-3.5 h-3.5 text-indigo-400" />
              <span>Ingest Test Data</span>
            </button>
            <button
              onClick={() => setIsModelModalOpen(true)}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-800 transition-colors flex items-center gap-1.5"
            >
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              <span>Model Specs (MAE 3.8%)</span>
            </button>
          </div>
        </div>

        {/* Fleet KPI Banner */}
        <QuickMetricsBanner
          devices={devices}
          onFilterRisk={setRiskFilter}
          selectedRiskFilter={riskFilter}
          onOpenModelModal={() => setIsModelModalOpen(true)}
        />

        {/* View Routing */}
        {loading ? (
          <div className="py-24 text-center">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-mono text-slate-400">Loading IoTGuard fleet and running initial LSTM forecasts...</p>
          </div>
        ) : (
          <>
            {/* View 1: Fleet Grid & Heatmap */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <DeviceGrid
                  devices={devices}
                  selectedDeviceId={selectedDeviceId}
                  onSelectDevice={handleSelectDevice}
                  riskFilter={riskFilter}
                  setRiskFilter={setRiskFilter}
                />
              </div>
            )}

            {/* View 2: Detailed Machine Sensors & SHAP Attribution */}
            {activeTab === 'detail' && (
              <div className="space-y-6">
                <DeviceDetailPanel
                  device={selectedDevice}
                  devices={devices}
                  forecast={selectedDeviceForecast}
                  readings={selectedDeviceReadings}
                  resampledHourly={resampledHourly}
                  onSelectDevice={setSelectedDeviceId}
                  onInjectAnomaly={injectAnomaly}
                  onResetDevice={resetDevice}
                  onOpenModelModal={() => setIsModelModalOpen(true)}
                />
              </div>
            )}

            {/* View 3: Alerts Dispatch Table */}
            {activeTab === 'alerts' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-white mb-1">Fleet Degradation & Anomaly Alerts</h2>
                  <p className="text-xs text-slate-400 font-mono">
                    Prioritized events where LSTM 24h failure probability crossed warning (&gt;20%) or critical (&ge;65%) threshold.
                  </p>
                </div>
                <AlertsTable
                  alerts={alerts}
                  onAcknowledge={acknowledgeAlert}
                  onSelectDevice={handleSelectDevice}
                />
              </div>
            )}
          </>
        )}
      </main>

      {/* 3. Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 px-6 text-xs text-slate-400 font-mono">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span>IoTGuard v1.4</span>
            <span>·</span>
            <span>50 CNC Edge Partitions</span>
            <span>·</span>
            <span>LSTM Recurrent Forecaster (N=20 MC Dropout)</span>
          </div>
          <div className="flex items-center gap-3 text-slate-400">
            <span>Last Stream Tick: {lastTickTime || 'Syncing'}</span>
            <span>·</span>
            <span>ISO 10816-3 Compliant</span>
          </div>
        </div>
      </footer>

      {/* 4. Modals */}
      <ModelPipelineModal
        isOpen={isModelModalOpen}
        onClose={() => setIsModelModalOpen(false)}
      />

      <CustomIngestionModal
        isOpen={isIngestModalOpen}
        onClose={() => setIsIngestModalOpen(false)}
        defaultDeviceId={selectedDeviceId}
        onIngestSuccess={() => {
          refreshFleet();
          refreshSelected();
        }}
      />
    </div>
  );
}
