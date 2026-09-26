import { useState, useEffect, useCallback, useRef } from 'react';
import { DeviceSummary, Alert, SensorReading, ForecastResult } from '../types/index.ts';

export function useIoTData() {
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('CNC-007'); // Default to one of the interesting failing ones
  const [selectedDeviceForecast, setSelectedDeviceForecast] = useState<ForecastResult | null>(null);
  const [selectedDeviceReadings, setSelectedDeviceReadings] = useState<SensorReading[]>([]);
  const [resampledHourly, setResampledHourly] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(true);
  const [lastTickTime, setLastTickTime] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initial fetch via REST API
  const fetchFleetData = useCallback(async () => {
    try {
      const [devRes, alertRes] = await Promise.all([
        fetch('/api/devices'),
        fetch('/api/alerts'),
      ]);
      if (devRes.ok) {
        const devData = await devRes.json();
        setDevices(devData.devices);
      }
      if (alertRes.ok) {
        const alertData = await alertRes.json();
        setAlerts(alertData.alerts);
      }
    } catch (err) {
      console.error('Failed to fetch initial fleet data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch detail for selected device
  const fetchSelectedDeviceDetails = useCallback(async (devId: string) => {
    try {
      const [forecastRes, readingsRes, resampledRes] = await Promise.all([
        fetch(`/api/devices/${devId}/forecast`),
        fetch(`/api/devices/${devId}/readings?limit=72`),
        fetch(`/api/devices/${devId}/readings?resampled=true`),
      ]);

      if (forecastRes.ok) {
        const fData = await forecastRes.json();
        setSelectedDeviceForecast(fData);
      }
      if (readingsRes.ok) {
        const rData = await readingsRes.json();
        setSelectedDeviceReadings(rData.readings || []);
      }
      if (resampledRes.ok) {
        const resampData = await resampledRes.json();
        setResampledHourly(resampData.resampledHourly || []);
      }
    } catch (err) {
      console.error(`Failed to fetch details for ${devId}:`, err);
    }
  }, []);

  // Connect WebSocket for real-time live telemetry stream
  const connectWebSocket = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onerror = () => {
        // Suppress noisy console error in reverse-proxy environments
        setIsConnected(false);
      };

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const nowStr = new Date().toLocaleTimeString();
          setLastTickTime(nowStr);

          if (msg.type === 'init') {
            setDevices(msg.payload.devices || []);
            setAlerts(msg.payload.alerts || []);
            setIsSimulating(msg.payload.isSimulationActive);
          } else if (msg.type === 'reading_batch') {
            const { readings, updatedForecasts, devices: updatedDevices } = msg.payload;

            if (updatedDevices) {
              setDevices(updatedDevices);
            }

            // If selected device got updated
            if (selectedDeviceId) {
              const matchingForecast = updatedForecasts?.find((f: any) => f.device_id === selectedDeviceId);
              if (matchingForecast) {
                setSelectedDeviceForecast(matchingForecast);
              }
              const matchingReading = readings?.find((r: any) => r.device_id === selectedDeviceId);
              if (matchingReading) {
                setSelectedDeviceReadings((prev) => [...prev.slice(-71), matchingReading]);
              }
            }
          } else if (msg.type === 'alert_triggered') {
            setAlerts((prev) => [msg.payload, ...prev.filter((a) => a.id !== msg.payload.id)].slice(0, 100));
          } else if (msg.type === 'alert_acknowledged') {
            setAlerts((prev) =>
              prev.map((a) => (a.id === msg.payload.id ? { ...a, acknowledged: true, acknowledgedBy: msg.payload.acknowledgedBy } : a))
            );
          } else if (msg.type === 'device_status_changed') {
            if (msg.payload.devices) {
              setDevices(msg.payload.devices);
            }
            if (msg.payload.deviceId === selectedDeviceId && msg.payload.forecast) {
              setSelectedDeviceForecast(msg.payload.forecast);
            }
          }
        } catch {
          // ignore parsing error
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        // Auto-reconnect after 4 seconds
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 4000);
      };
    } catch {
      setIsConnected(false);
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    fetchFleetData();
    connectWebSocket();

    // Fallback polling interval every 3.5s to ensure reliable live updates even if WebSocket is blocked in sandbox iframe
    const pollingInterval = setInterval(() => {
      fetchFleetData();
      if (selectedDeviceId) {
        fetchSelectedDeviceDetails(selectedDeviceId);
      }
      setLastTickTime(new Date().toLocaleTimeString());
    }, 3500);

    return () => {
      clearInterval(pollingInterval);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
      }
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    };
  }, [fetchFleetData, connectWebSocket, selectedDeviceId, fetchSelectedDeviceDetails]);

  useEffect(() => {
    if (selectedDeviceId) {
      fetchSelectedDeviceDetails(selectedDeviceId);
    }
  }, [selectedDeviceId, fetchSelectedDeviceDetails]);

  // Acknowledge alert handler
  const acknowledgeAlert = async (alertId: string, operator: string = 'Duty Tech') => {
    try {
      const res = await fetch(`/api/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator }),
      });
      if (res.ok) {
        setAlerts((prev) =>
          prev.map((a) => (a.id === alertId ? { ...a, acknowledged: true, acknowledgedBy: operator } : a))
        );
      }
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    }
  };

  // Inject anomaly
  const injectAnomaly = async (
    deviceId: string,
    type: 'bearing_vibration' | 'hydraulic_pressure' | 'thermal_runaway'
  ) => {
    try {
      const res = await fetch(`/api/devices/${deviceId}/inject-anomaly`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.forecast && deviceId === selectedDeviceId) {
          setSelectedDeviceForecast(data.forecast);
        }
        await fetchFleetData();
        await fetchSelectedDeviceDetails(deviceId);
      }
    } catch (err) {
      console.error('Failed to inject anomaly:', err);
    }
  };

  // Reset device to nominal
  const resetDevice = async (deviceId: string) => {
    try {
      const res = await fetch(`/api/devices/${deviceId}/reset`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.forecast && deviceId === selectedDeviceId) {
          setSelectedDeviceForecast(data.forecast);
        }
        await fetchFleetData();
        await fetchSelectedDeviceDetails(deviceId);
      }
    } catch (err) {
      console.error('Failed to reset device:', err);
    }
  };

  // Toggle background simulation
  const toggleSimulation = async () => {
    try {
      const res = await fetch('/api/simulation/toggle', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setIsSimulating(data.isSimulationActive);
      }
    } catch (err) {
      console.error('Failed to toggle simulation:', err);
    }
  };

  // Trigger manual tick
  const triggerManualTick = async () => {
    try {
      await fetch('/api/simulation/tick', { method: 'POST' });
    } catch (err) {
      console.error('Failed to pulse simulation:', err);
    }
  };

  return {
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
    refreshFleet: fetchFleetData,
    refreshSelected: () => selectedDeviceId && fetchSelectedDeviceDetails(selectedDeviceId),
  };
}
