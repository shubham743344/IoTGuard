/**
 * IoTGuard Simulation Data Generator
 * Generates initial time-series data for 50 CNC machines:
 * - ~2,000 readings each (~1 month span)
 * - 10% failure rate (5 machines in degraded/failing state with exponential spikes and pressure drops)
 * - ~5% random sensor blackout gaps
 * - Sinusoidal daily-cycle patterns for nominal machines
 */

import { SensorReading, Alert } from '../../src/types/index.ts';
import { PartitionedTimeSeriesStore } from '../storage/partitionStore.ts';
import { generateDeviceForecast, NORMAL_BASELINES } from '../../src/ml/lstmPipeline.ts';

const BAYS = [
  { bay: 'Bay A - Milling', count: 10, type: '5-Axis Vertical Mill', rpm: 12000 },
  { bay: 'Bay B - Lathe', count: 10, type: 'Dual-Spindle Precision Lathe', rpm: 6000 },
  { bay: 'Bay C - 5-Axis Multi-Task', count: 10, type: 'Simultaneous 5-Axis Machining Center', rpm: 15000 },
  { bay: 'Bay D - High-Speed Cutting', count: 10, type: 'High-Torque Horizontal Mill', rpm: 10000 },
  { bay: 'Bay E - Precision Grinding', count: 10, type: 'Hydrostatic CNC Cylindrical Grinder', rpm: 8000 },
];

// 5 Failing/Degrading machines (10% of 50)
const FAILING_DEVICES = new Set(['CNC-007', 'CNC-019', 'CNC-028', 'CNC-035', 'CNC-044']);

export function initializeFleetData(store: PartitionedTimeSeriesStore): void {
  console.log('[IoTGuard] Initializing 50 CNC Machines and ~2,000 readings each...');
  const now = Date.now();
  const ONE_MONTH_MS = 30 * 24 * 3600 * 1000;
  const startTime = now - ONE_MONTH_MS;
  const numReadings = 2000;
  const stepMs = Math.floor(ONE_MONTH_MS / numReadings); // ~21.6 minutes per reading

  let deviceIndex = 1;

  for (const group of BAYS) {
    for (let i = 0; i < group.count; i++) {
      const deviceId = `CNC-${String(deviceIndex).padStart(3, '0')}`;
      const isFailing = FAILING_DEVICES.has(deviceId);

      // Register device partition
      const partition = store.registerDevice(deviceId, {
        name: `${group.type.split(' ')[0]} #${deviceIndex}`,
        bay: group.bay,
        type: group.type,
        installDate: new Date(now - (365 + deviceIndex * 15) * 24 * 3600 * 1000).toISOString().split('T')[0],
        rpm: group.rpm,
        lastMaintenance: new Date(now - (20 + (deviceIndex % 40)) * 24 * 3600 * 1000).toISOString().split('T')[0],
      });

      // Failure mode configuration for degraded machines
      let failureMode: 'bearing_vibration' | 'hydraulic_pressure' | 'thermal_runaway' = 'bearing_vibration';
      if (deviceId === 'CNC-019' || deviceId === 'CNC-044') failureMode = 'hydraulic_pressure';
      else if (deviceId === 'CNC-028') failureMode = 'thermal_runaway';

      const deviceReadings: SensorReading[] = [];

      for (let r = 0; r < numReadings; r++) {
        const timestampMs = startTime + r * stepMs;
        const timestamp = new Date(timestampMs).toISOString();

        // 5% random sensor blackout probability
        const isBlackout = Math.random() < 0.05;

        // Daily cycle (24-hour sinusoidal wave)
        const hourOfDay = (timestampMs / (3600 * 1000)) % 24;
        const dailyCycle = Math.sin((hourOfDay / 24) * 2 * Math.PI);
        const shiftHeat = hourOfDay >= 8 && hourOfDay <= 20 ? 3.5 : -2.0;

        let vib = 2.4 + 0.5 * dailyCycle + (Math.random() * 0.4 - 0.2);
        let temp = 53.0 + shiftHeat + 3.0 * dailyCycle + (Math.random() * 1.5 - 0.75);
        let press = 96.0 + 1.8 * Math.cos((hourOfDay / 24) * 2 * Math.PI) + (Math.random() * 1.5 - 0.75);
        let status: SensorReading['status'] = 'normal';

        // Anomaly progression in the final 15% of readings for failing machines
        if (isFailing && r > numReadings * 0.82) {
          const progress = (r - numReadings * 0.82) / (numReadings * 0.18); // 0 to 1
          const expFactor = Math.pow(progress, 2.2);

          if (failureMode === 'bearing_vibration') {
            // Spindle bearing failure: exponential vibration spike, elevated temperature
            vib += 5.8 * expFactor + (Math.random() * 0.8 - 0.4);
            temp += 28.0 * expFactor + (Math.random() * 2.0 - 1.0);
            press -= 12.0 * expFactor + (Math.random() * 2.0 - 1.0);
          } else if (failureMode === 'hydraulic_pressure') {
            // Coolant / Hydraulic pump failure: catastrophic pressure drop, moderate friction heat & vibration
            press -= 45.0 * expFactor + (Math.random() * 3.0 - 1.5);
            temp += 22.0 * expFactor + (Math.random() * 1.5 - 0.75);
            vib += 2.8 * expFactor + (Math.random() * 0.5 - 0.25);
          } else if (failureMode === 'thermal_runaway') {
            // Motor stator thermal runaway: extreme temperature spike, vibration harmonics
            temp += 42.0 * expFactor + (Math.random() * 2.5 - 1.25);
            vib += 4.2 * expFactor + (Math.random() * 0.7 - 0.35);
            press -= 18.0 * expFactor + (Math.random() * 2.0 - 1.0);
          }

          if (progress > 0.7) {
            status = 'fail';
          } else {
            status = 'degraded';
          }
        }

        // Clamp to physical ranges
        vib = Math.max(0.1, Number(vib.toFixed(2)));
        temp = Math.max(20.0, Number(temp.toFixed(1)));
        press = Math.max(10.0, Number(press.toFixed(1)));

        deviceReadings.push({
          device_id: deviceId,
          timestamp,
          vibration: vib,
          temperature: temp,
          pressure: press,
          status,
          is_blackout: isBlackout,
          is_imputed: false,
        });
      }

      partition.appendReadingsBatch(deviceReadings);

      // Run initial LSTM + SHAP forecast for this device
      const forecast = generateDeviceForecast(deviceId, partition.getLookbackWindow(24));
      partition.latestForecast = forecast;

      // Seed alerts for degraded/failing devices
      if (forecast.riskLevel === 'critical' || forecast.riskLevel === 'warning') {
        const topDriver = forecast.shap.primaryDriver;
        const alert: Alert = {
          id: `ALT-${deviceId}-${Date.now().toString(36).slice(-4)}`,
          device_id: deviceId,
          bay: group.bay,
          timestamp: new Date(now - Math.random() * 3600000).toISOString(),
          severity: forecast.riskLevel === 'critical' ? 'critical' : 'warning',
          riskScore: forecast.failureProbability,
          triggeredSensor: topDriver,
          message: `${deviceId} (${group.type}): LSTM 24h failure risk reached ${(forecast.failureProbability * 100).toFixed(1)}%. Primary anomaly: ${forecast.shap.attributions[0]?.sensorLabel}.`,
          acknowledged: false,
        };
        store.addAlert(alert);
      }

      deviceIndex++;
    }
  }

  console.log(`[IoTGuard] Fleet initialization complete: 50 devices active. Storage stats:`, store.getShardingStats());
}

/**
 * Generates next live telemetry tick for all or selected devices.
 */
export function generateLiveTick(
  store: PartitionedTimeSeriesStore,
  targetDeviceId?: string
): { readings: SensorReading[]; updatedForecasts: any[]; newAlerts: Alert[] } {
  const deviceIds = targetDeviceId ? [targetDeviceId] : store.getAllDeviceIds();
  const newReadings: SensorReading[] = [];
  const updatedForecasts: any[] = [];
  const newAlerts: Alert[] = [];
  const now = new Date().toISOString();

  for (const deviceId of deviceIds) {
    const partition = store.getPartition(deviceId);
    if (!partition) continue;

    const prev = partition.getLatestReading();
    const isFailing = FAILING_DEVICES.has(deviceId);
    const isBlackout = Math.random() < 0.05;

    let vib = prev.vibration;
    let temp = prev.temperature;
    let press = prev.pressure;
    let status = prev.status;

    if (isFailing) {
      // Continuing anomaly trend with slight variance
      vib += (Math.random() * 0.2 - 0.05);
      temp += (Math.random() * 0.3 - 0.1);
      press -= (Math.random() * 0.25 - 0.05);
      status = vib > 7.0 || press < 60 || temp > 90 ? 'fail' : 'degraded';
    } else {
      // Normal Brownian drift around baseline
      vib = 2.4 + (Math.random() * 0.6 - 0.3);
      temp = 53.0 + (Math.random() * 1.5 - 0.75);
      press = 96.0 + (Math.random() * 1.5 - 0.75);
      status = 'normal';
    }

    vib = Math.max(0.2, Number(vib.toFixed(2)));
    temp = Math.max(20.0, Number(temp.toFixed(1)));
    press = Math.max(15.0, Number(press.toFixed(1)));

    const newReading: SensorReading = {
      device_id: deviceId,
      timestamp: now,
      vibration: vib,
      temperature: temp,
      pressure: press,
      status,
      is_blackout: isBlackout,
    };

    partition.appendReading(newReading);
    newReadings.push(newReading);

    // Recompute forecast
    const forecast = generateDeviceForecast(deviceId, partition.getLookbackWindow(24));
    partition.latestForecast = forecast;
    updatedForecasts.push(forecast);

    // Trigger alert if transitioning to critical and no recent unacknowledged alert
    if (forecast.riskLevel === 'critical') {
      const hasRecentUnack = partition.activeAlerts.some((a) => !a.acknowledged && a.severity === 'critical');
      if (!hasRecentUnack) {
        const topDriver = forecast.shap.primaryDriver;
        const alert: Alert = {
          id: `ALT-${deviceId}-${Date.now().toString(36).slice(-4)}`,
          device_id: deviceId,
          bay: partition.metadata.bay,
          timestamp: now,
          severity: 'critical',
          riskScore: forecast.failureProbability,
          triggeredSensor: topDriver,
          message: `CRITICAL ALERT: ${deviceId} predicted failure risk elevated to ${(forecast.failureProbability * 100).toFixed(1)}% in next 24h. Driver: ${forecast.shap.attributions[0]?.sensorLabel}.`,
          acknowledged: false,
        };
        store.addAlert(alert);
        newAlerts.push(alert);
      }
    }
  }

  return { readings: newReadings, updatedForecasts, newAlerts };
}

/**
 * Interactive injection of an anomaly into any healthy machine
 * Allows the user/evaluator to test real-time LSTM forecasting & SHAP attribution!
 */
export function injectDeviceAnomaly(
  store: PartitionedTimeSeriesStore,
  deviceId: string,
  anomalyType: 'bearing_vibration' | 'hydraulic_pressure' | 'thermal_runaway'
): { success: boolean; forecast: any; alert?: Alert } {
  const partition = store.getPartition(deviceId);
  if (!partition) return { success: false, forecast: null };

  FAILING_DEVICES.add(deviceId);
  const now = new Date();

  // Inject a steep 6-hour anomaly trajectory into the partition's recent history
  const recent = partition.getReadings(12);
  recent.forEach((r, idx) => {
    const factor = (idx + 1) / recent.length;
    if (anomalyType === 'bearing_vibration') {
      r.vibration = Number((2.5 + factor * 6.2 + (Math.random() * 0.4)).toFixed(2));
      r.temperature = Number((54.0 + factor * 26.0).toFixed(1));
      r.pressure = Number((95.0 - factor * 12.0).toFixed(1));
    } else if (anomalyType === 'hydraulic_pressure') {
      r.pressure = Number((95.0 - factor * 48.0).toFixed(1));
      r.temperature = Number((54.0 + factor * 22.0).toFixed(1));
      r.vibration = Number((2.5 + factor * 3.5).toFixed(2));
    } else {
      r.temperature = Number((54.0 + factor * 44.0).toFixed(1));
      r.vibration = Number((2.5 + factor * 4.6).toFixed(2));
      r.pressure = Number((95.0 - factor * 16.0).toFixed(1));
    }
    r.status = factor > 0.6 ? 'fail' : 'degraded';
  });

  const forecast = generateDeviceForecast(deviceId, partition.getLookbackWindow(24));
  partition.latestForecast = forecast;

  const alert: Alert = {
    id: `ALT-${deviceId}-${Date.now().toString(36).slice(-4)}`,
    device_id: deviceId,
    bay: partition.metadata.bay,
    timestamp: now.toISOString(),
    severity: 'critical',
    riskScore: forecast.failureProbability,
    triggeredSensor: forecast.shap.primaryDriver,
    message: `ANOMALY INJECTED: ${deviceId} 24h failure risk spiked to ${(forecast.failureProbability * 100).toFixed(1)}%. SHAP driver: ${forecast.shap.attributions[0]?.sensorLabel}.`,
    acknowledged: false,
  };
  store.addAlert(alert);

  return { success: true, forecast, alert };
}

/**
 * Resets a device to nominal operating condition
 */
export function resetDeviceToNominal(
  store: PartitionedTimeSeriesStore,
  deviceId: string
): { success: boolean; forecast: any } {
  const partition = store.getPartition(deviceId);
  if (!partition) return { success: false, forecast: null };

  FAILING_DEVICES.delete(deviceId);

  // Restore recent readings to nominal baseline
  const recent = partition.getReadings(48);
  recent.forEach((r) => {
    r.vibration = Number((2.4 + (Math.random() * 0.6 - 0.3)).toFixed(2));
    r.temperature = Number((53.0 + (Math.random() * 2.0 - 1.0)).toFixed(1));
    r.pressure = Number((96.0 + (Math.random() * 2.0 - 1.0)).toFixed(1));
    r.status = 'normal';
    r.is_blackout = false;
  });

  const forecast = generateDeviceForecast(deviceId, partition.getLookbackWindow(24));
  partition.latestForecast = forecast;

  return { success: true, forecast };
}
