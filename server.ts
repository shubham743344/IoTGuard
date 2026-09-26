/**
 * IoTGuard Full-Stack Server
 * - Express REST API for devices, time-series ingestion, LSTM forecasts, SHAP attributions, alerts
 * - WebSocket Server on port 3000 for real-time telemetry streaming and live forecast pushes
 * - Vite middleware mounted in dev mode
 * - Scalable partitioned time-series storage
 */

import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { globalPartitionStore } from './server/storage/partitionStore.ts';
import {
  initializeFleetData,
  generateLiveTick,
  injectDeviceAnomaly,
  resetDeviceToNominal,
} from './server/simulation/dataGenerator.ts';
import {
  generateDeviceForecast,
  preprocess24HourSequence,
  MODEL_VALIDATION_METRICS,
} from './src/ml/lstmPipeline.ts';
import { SensorReading, Alert } from './src/types/index.ts';

const app = express();
app.use(express.json());

// Initialize fleet data with 50 CNC machines and ~2,000 readings each
initializeFleetData(globalPartitionStore);

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

wss.on('error', (err) => {
  console.warn('[IoTGuard WS] WebSocket Server error:', err.message);
});

server.on('upgrade', (request, socket, head) => {
  try {
    const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/api/ws' || url.pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  } catch (err) {
    socket.destroy();
  }
});

// Track connected WebSocket clients
const clients = new Set<WebSocket>();

wss.on('connection', (ws: WebSocket) => {
  clients.add(ws);

  ws.on('error', (err) => {
    console.warn('[IoTGuard WS] Client socket error:', err.message);
  });

  // Send initial snapshot to newly connected client
  const initialPayload = {
    type: 'init',
    payload: {
      devices: globalPartitionStore.getAllDevices(),
      alerts: globalPartitionStore.getAlerts({ unacknowledgedOnly: false }),
      storageStats: globalPartitionStore.getShardingStats(),
      serverTime: new Date().toISOString(),
      isSimulationActive,
    },
  };
  try {
    ws.send(JSON.stringify(initialPayload));
  } catch {
    // ignore initial send error
  }

  ws.on('message', (message: string) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'subscribe_device') {
        // Can be used for targeted device subscription if needed
      } else if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch {
      // Ignore malformed messages
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
  });
});

// Broadcast helper
function broadcast(type: string, payload: any) {
  const message = JSON.stringify({ type, payload });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// Background simulation ticker (streams real-time updates every 3 seconds)
let isSimulationActive = true;
let simulationInterval: NodeJS.Timeout | null = null;

function startSimulationLoop() {
  if (simulationInterval) clearInterval(simulationInterval);
  simulationInterval = setInterval(() => {
    if (!isSimulationActive) return;

    // Pick 5-8 random machines to receive incoming sensor packets per tick
    const allIds = globalPartitionStore.getAllDeviceIds();
    const batchSize = Math.floor(Math.random() * 4) + 4;
    const shuffled = [...allIds].sort(() => 0.5 - Math.random());
    const selectedIds = shuffled.slice(0, batchSize);

    const tickReadings: SensorReading[] = [];
    const tickForecasts: any[] = [];
    const tickAlerts: Alert[] = [];

    for (const devId of selectedIds) {
      const { readings, updatedForecasts, newAlerts } = generateLiveTick(globalPartitionStore, devId);
      tickReadings.push(...readings);
      tickForecasts.push(...updatedForecasts);
      tickAlerts.push(...newAlerts);
    }

    if (tickReadings.length > 0) {
      broadcast('reading_batch', {
        readings: tickReadings,
        updatedForecasts: tickForecasts,
        devices: globalPartitionStore.getAllDevices(),
      });
    }

    for (const alert of tickAlerts) {
      broadcast('alert_triggered', alert);
    }
  }, 3000);
}

startSimulationLoop();

// ==========================================
// REST API ROUTES
// ==========================================

// 1. List all 50 devices with risk scores, CI, and primary drivers
app.get('/api/devices', (req, res) => {
  const bay = req.query.bay as string | undefined;
  const risk = req.query.risk as string | undefined;
  let devices = globalPartitionStore.getAllDevices();

  if (bay && bay !== 'all') {
    devices = devices.filter((d) => d.bay === bay);
  }
  if (risk && risk !== 'all') {
    devices = devices.filter((d) => d.riskLevel === risk);
  }

  res.json({
    total: devices.length,
    devices,
    stats: {
      nominal: devices.filter((d) => d.riskLevel === 'nominal').length,
      warning: devices.filter((d) => d.riskLevel === 'warning').length,
      critical: devices.filter((d) => d.riskLevel === 'critical').length,
    },
  });
});

// 2. Get specific device details
app.get('/api/devices/:id', (req, res) => {
  const deviceId = req.params.id;
  const partition = globalPartitionStore.getPartition(deviceId);
  if (!partition) {
    return res.status(404).json({ error: `Device ${deviceId} not found` });
  }

  const summary = partition.getDeviceSummary();
  const latestForecast = partition.latestForecast;
  res.json({
    device: summary,
    forecast: latestForecast,
    shardId: partition.shardId,
    activeAlerts: partition.activeAlerts,
  });
});

// 3. Fetch device's 24h failure probability forecast + SHAP feature importance
app.get('/api/devices/:id/forecast', (req, res) => {
  const deviceId = req.params.id;
  const partition = globalPartitionStore.getPartition(deviceId);
  if (!partition) {
    return res.status(404).json({ error: `Device ${deviceId} not found` });
  }

  const lookback = partition.getLookbackWindow(24);
  const forecast = generateDeviceForecast(deviceId, lookback);
  partition.latestForecast = forecast;

  res.json(forecast);
});

// 4. Fetch device historical readings
app.get('/api/devices/:id/readings', (req, res) => {
  const deviceId = req.params.id;
  const partition = globalPartitionStore.getPartition(deviceId);
  if (!partition) {
    return res.status(404).json({ error: `Device ${deviceId} not found` });
  }

  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
  const resampled = req.query.resampled === 'true';

  if (resampled) {
    const lookback = partition.getLookbackWindow(24);
    const { rawHourly, imputedCount } = preprocess24HourSequence(lookback);
    return res.json({
      device_id: deviceId,
      resampledHourly: rawHourly,
      imputedGapsCount: imputedCount,
      cadence: '1-hour intervals',
    });
  }

  const readings = partition.getReadings(limit);
  res.json({
    device_id: deviceId,
    count: readings.length,
    readings,
  });
});

// 5. Ingest new sensor readings (batch or streaming)
app.post('/api/readings', (req, res) => {
  const body = req.body;
  const readings: SensorReading[] = Array.isArray(body) ? body : [body];

  if (readings.length === 0 || !readings[0].device_id) {
    return res.status(400).json({ error: 'Invalid readings format. Expected device_id, vibration, temperature, pressure.' });
  }

  const updatedForecasts: any[] = [];
  const generatedAlerts: Alert[] = [];

  for (const r of readings) {
    const reading: SensorReading = {
      device_id: r.device_id,
      timestamp: r.timestamp || new Date().toISOString(),
      vibration: Number(r.vibration),
      temperature: Number(r.temperature),
      pressure: Number(r.pressure),
      status: r.status || (r.vibration > 7.0 || r.pressure < 60 ? 'fail' : r.vibration > 4.5 || r.pressure < 75 ? 'degraded' : 'normal'),
      is_blackout: Boolean(r.is_blackout),
    };

    const partition = globalPartitionStore.ingestReading(reading);
    if (partition) {
      const forecast = generateDeviceForecast(reading.device_id, partition.getLookbackWindow(24));
      partition.latestForecast = forecast;
      updatedForecasts.push(forecast);

      if (forecast.riskLevel === 'critical') {
        const alert: Alert = {
          id: `ALT-${reading.device_id}-${Date.now().toString(36).slice(-4)}`,
          device_id: reading.device_id,
          bay: partition.metadata.bay,
          timestamp: reading.timestamp,
          severity: 'critical',
          riskScore: forecast.failureProbability,
          triggeredSensor: forecast.shap.primaryDriver,
          message: `Ingested reading triggered CRITICAL risk (${(forecast.failureProbability * 100).toFixed(1)}%). Driver: ${forecast.shap.attributions[0]?.sensorLabel}.`,
          acknowledged: false,
        };
        globalPartitionStore.addAlert(alert);
        generatedAlerts.push(alert);
      }
    }
  }

  // Push updates via WebSocket
  broadcast('reading_batch', {
    readings,
    updatedForecasts,
    devices: globalPartitionStore.getAllDevices(),
  });

  for (const a of generatedAlerts) {
    broadcast('alert_triggered', a);
  }

  res.status(201).json({
    success: true,
    ingestedCount: readings.length,
    updatedForecastsCount: updatedForecasts.length,
    alertsGenerated: generatedAlerts.length,
  });
});

// 6. List current alerts
app.get('/api/alerts', (req, res) => {
  const severity = req.query.severity as string | undefined;
  const bay = req.query.bay as string | undefined;
  const unack = req.query.unack === 'true';

  const alerts = globalPartitionStore.getAlerts({
    severity,
    bay,
    unacknowledgedOnly: unack,
  });

  res.json({
    total: alerts.length,
    unacknowledged: alerts.filter((a) => !a.acknowledged).length,
    critical: alerts.filter((a) => a.severity === 'critical').length,
    warning: alerts.filter((a) => a.severity === 'warning').length,
    alerts,
  });
});

// 7. Acknowledge alert
app.post('/api/alerts/:id/acknowledge', (req, res) => {
  const alertId = req.params.id;
  const operator = req.body.operator || 'Station Engineer';
  const updated = globalPartitionStore.acknowledgeAlert(alertId, operator);

  if (!updated) {
    return res.status(404).json({ error: `Alert ${alertId} not found` });
  }

  broadcast('alert_acknowledged', updated);
  res.json({ success: true, alert: updated });
});

// 8. Inject anomaly into a machine (interactive evaluation tool!)
app.post('/api/devices/:id/inject-anomaly', (req, res) => {
  const deviceId = req.params.id;
  const anomalyType = req.body.type || 'bearing_vibration';
  const result = injectDeviceAnomaly(globalPartitionStore, deviceId, anomalyType);

  if (!result.success) {
    return res.status(404).json({ error: `Device ${deviceId} not found` });
  }

  broadcast('device_status_changed', {
    deviceId,
    forecast: result.forecast,
    alert: result.alert,
    devices: globalPartitionStore.getAllDevices(),
  });

  if (result.alert) {
    broadcast('alert_triggered', result.alert);
  }

  res.json({
    success: true,
    message: `Injected ${anomalyType} anomaly into ${deviceId}`,
    forecast: result.forecast,
  });
});

// 9. Reset machine to nominal operating condition
app.post('/api/devices/:id/reset', (req, res) => {
  const deviceId = req.params.id;
  const result = resetDeviceToNominal(globalPartitionStore, deviceId);

  if (!result.success) {
    return res.status(404).json({ error: `Device ${deviceId} not found` });
  }

  broadcast('device_status_changed', {
    deviceId,
    forecast: result.forecast,
    devices: globalPartitionStore.getAllDevices(),
  });

  res.json({
    success: true,
    message: `Reset ${deviceId} to nominal baseline`,
    forecast: result.forecast,
  });
});

// 10. Model validation metrics, LSTM architecture & preprocessing specs
app.get('/api/model/metrics', (req, res) => {
  res.json({
    metrics: MODEL_VALIDATION_METRICS,
    sharding: globalPartitionStore.getShardingStats(),
  });
});

// 11. Toggle or manual pulse simulation
app.post('/api/simulation/toggle', (req, res) => {
  isSimulationActive = !isSimulationActive;
  res.json({ isSimulationActive });
});

app.post('/api/simulation/tick', (req, res) => {
  const { readings, updatedForecasts, newAlerts } = generateLiveTick(globalPartitionStore);
  broadcast('reading_batch', {
    readings,
    updatedForecasts,
    devices: globalPartitionStore.getAllDevices(),
  });
  for (const alert of newAlerts) {
    broadcast('alert_triggered', alert);
  }
  res.json({
    readingsCount: readings.length,
    alertsCount: newAlerts.length,
  });
});

// Dev vs Prod Vite Mounting
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const PORT = Number(process.env.PORT) || 3000;

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve('dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve('dist/index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[IoTGuard] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[IoTGuard] Failed to start server:', err);
  process.exit(1);
});
