import React, { useState } from 'react';
import { X, Send, Database, CheckCircle2 } from 'lucide-react';

interface CustomIngestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDeviceId?: string;
  onIngestSuccess: () => void;
}

export const CustomIngestionModal: React.FC<CustomIngestionModalProps> = ({
  isOpen,
  onClose,
  defaultDeviceId = 'CNC-001',
  onIngestSuccess,
}) => {
  const [deviceId, setDeviceId] = useState<string>(defaultDeviceId);
  const [vibration, setVibration] = useState<string>('7.6');
  const [temperature, setTemperature] = useState<string>('88.5');
  const [pressure, setPressure] = useState<string>('58.0');
  const [isBlackout, setIsBlackout] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [responseMsg, setResponseMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResponseMsg(null);

    try {
      const payload = {
        device_id: deviceId,
        timestamp: new Date().toISOString(),
        vibration: parseFloat(vibration) || 2.5,
        temperature: parseFloat(temperature) || 55.0,
        pressure: parseFloat(pressure) || 95.0,
        is_blackout: isBlackout,
      };

      const res = await fetch('/api/readings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setResponseMsg(`Successfully ingested reading for ${deviceId}! Updated LSTM forecast broadcasted.`);
        onIngestSuccess();
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setResponseMsg('Failed to ingest reading. Check parameter ranges.');
      }
    } catch {
      setResponseMsg('Error submitting reading to server.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="bg-slate-900 border-b border-slate-800 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-bold text-white">Manual Telemetry Ingestion (API Test)</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3 text-xs">
          <div>
            <label className="block text-slate-300 font-mono mb-1">Target CNC Device ID</label>
            <input
              type="text"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono focus:border-slate-600 outline-none"
              placeholder="e.g. CNC-007"
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-slate-400 font-mono mb-1">Vibration (mm/s)</label>
              <input
                type="number"
                step="0.1"
                value={vibration}
                onChange={(e) => setVibration(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono focus:border-slate-600 outline-none"
                required
              />
              <span className="text-[10px] text-slate-500 font-mono">Norm: 1.5 - 3.5</span>
            </div>

            <div>
              <label className="block text-slate-400 font-mono mb-1">Temp (°C)</label>
              <input
                type="number"
                step="0.5"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono focus:border-slate-600 outline-none"
                required
              />
              <span className="text-[10px] text-slate-500 font-mono">Norm: 45 - 65</span>
            </div>

            <div>
              <label className="block text-slate-400 font-mono mb-1">Pressure (PSI)</label>
              <input
                type="number"
                step="0.5"
                value={pressure}
                onChange={(e) => setPressure(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-100 font-mono focus:border-slate-600 outline-none"
                required
              />
              <span className="text-[10px] text-slate-500 font-mono">Norm: 85 - 105</span>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="blackout"
              checked={isBlackout}
              onChange={(e) => setIsBlackout(e.target.checked)}
              className="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0"
            />
            <label htmlFor="blackout" className="text-slate-300">
              Simulate sensor blackout / dropout gap (~5% blackout test)
            </label>
          </div>

          {responseMsg && (
            <div className="p-2.5 rounded bg-slate-950 border border-indigo-900 text-indigo-300 text-xs flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>{responseMsg}</span>
            </div>
          )}

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center gap-1.5 disabled:opacity-50"
            >
              <Send className="w-3 h-3" />
              <span>{submitting ? 'Ingesting...' : 'Ingest to API'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
