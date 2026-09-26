/**
 * Partitioned Time-Series Storage for IoTGuard
 * Conceptually partitioned and sharded by device_id to support 1,000+ IoT edge nodes.
 *
 * Each partition shard holds:
 * - Ring-buffer time-series store per device
 * - Fast chronological slice queries for RNN lookback sequences
 * - Anomaly & Alert index
 */

import {
  SensorReading,
  DeviceSummary,
  Alert,
  ForecastResult,
} from '../../src/types/index.ts';

export class DevicePartition {
  public readonly deviceId: string;
  public readonly shardId: number;
  private readings: SensorReading[] = [];
  private maxCapacity: number = 3000;
  public latestForecast: ForecastResult | null = null;
  public activeAlerts: Alert[] = [];
  public metadata: {
    name: string;
    bay: string;
    type: string;
    installDate: string;
    rpm: number;
    lastMaintenance: string;
  };

  constructor(deviceId: string, shardId: number, metadata: DevicePartition['metadata']) {
    this.deviceId = deviceId;
    this.shardId = shardId;
    this.metadata = metadata;
  }

  public appendReading(reading: SensorReading): void {
    this.readings.push(reading);
    if (this.readings.length > this.maxCapacity) {
      this.readings.splice(0, this.readings.length - this.maxCapacity);
    }
  }

  public appendReadingsBatch(batch: SensorReading[]): void {
    this.readings.push(...batch);
    if (this.readings.length > this.maxCapacity) {
      this.readings.splice(0, this.readings.length - this.maxCapacity);
    }
  }

  public getReadings(limit?: number): SensorReading[] {
    if (!limit || limit >= this.readings.length) {
      return [...this.readings];
    }
    return this.readings.slice(this.readings.length - limit);
  }

  public getLatestReading(): SensorReading {
    if (this.readings.length === 0) {
      return {
        device_id: this.deviceId,
        timestamp: new Date().toISOString(),
        vibration: 2.2,
        temperature: 52.0,
        pressure: 96.0,
        status: 'normal',
      };
    }
    return this.readings[this.readings.length - 1];
  }

  public getLookbackWindow(hours: number = 24): SensorReading[] {
    const now = Date.now();
    const cutoff = now - hours * 3600 * 1000;
    const window = this.readings.filter((r) => new Date(r.timestamp).getTime() >= cutoff);
    if (window.length < 24) {
      // If window sparse or timestamp skewed in mock, return last 200 readings
      return this.readings.slice(-Math.min(this.readings.length, 250));
    }
    return window;
  }

  public getDeviceSummary(): DeviceSummary {
    const latest = this.getLatestReading();
    const forecast = this.latestForecast;
    const risk = forecast ? forecast.failureProbability : latest.status === 'fail' ? 0.88 : latest.status === 'degraded' ? 0.45 : 0.06;
    const riskLevel = risk >= 0.65 ? 'critical' : risk >= 0.20 ? 'warning' : 'nominal';
    const ci = forecast ? forecast.confidenceInterval : [Math.max(0, risk - 0.04), Math.min(1, risk + 0.04)] as [number, number];
    const primaryDriver = forecast ? forecast.shap.primaryDriver : 'vibration';

    return {
      id: this.deviceId,
      name: this.metadata.name,
      bay: this.metadata.bay,
      type: this.metadata.type,
      installDate: this.metadata.installDate,
      status: latest.status,
      currentRisk: Number(risk.toFixed(3)),
      riskLevel,
      confidenceInterval: ci,
      primaryDriver,
      latestReading: latest,
      activeAlertCount: this.activeAlerts.filter((a) => !a.acknowledged).length,
      lastMaintenance: this.metadata.lastMaintenance,
      rpm: this.metadata.rpm,
    };
  }
}

export class PartitionedTimeSeriesStore {
  private readonly numShards: number = 8;
  private shards: Map<string, DevicePartition> = new Map();
  private alertsList: Alert[] = [];

  private hashKey(key: string): number {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = (hash << 5) - hash + key.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % this.numShards;
  }

  public registerDevice(
    deviceId: string,
    metadata: DevicePartition['metadata']
  ): DevicePartition {
    if (!this.shards.has(deviceId)) {
      const shardId = this.hashKey(deviceId);
      const partition = new DevicePartition(deviceId, shardId, metadata);
      this.shards.set(deviceId, partition);
    }
    return this.shards.get(deviceId)!;
  }

  public getPartition(deviceId: string): DevicePartition | undefined {
    return this.shards.get(deviceId);
  }

  public getAllDevices(): DeviceSummary[] {
    return Array.from(this.shards.values()).map((p) => p.getDeviceSummary());
  }

  public getAllDeviceIds(): string[] {
    return Array.from(this.shards.keys());
  }

  public ingestReading(reading: SensorReading): DevicePartition | undefined {
    const partition = this.shards.get(reading.device_id);
    if (partition) {
      partition.appendReading(reading);
    }
    return partition;
  }

  public ingestBatch(readings: SensorReading[]): void {
    for (const r of readings) {
      this.ingestReading(r);
    }
  }

  public addAlert(alert: Alert): void {
    this.alertsList.unshift(alert);
    if (this.alertsList.length > 500) {
      this.alertsList.pop();
    }
    const partition = this.shards.get(alert.device_id);
    if (partition) {
      partition.activeAlerts.unshift(alert);
    }
  }

  public getAlerts(filter?: {
    severity?: string;
    bay?: string;
    device_id?: string;
    unacknowledgedOnly?: boolean;
  }): Alert[] {
    let list = this.alertsList;
    if (filter?.severity && filter.severity !== 'all') {
      list = list.filter((a) => a.severity === filter.severity);
    }
    if (filter?.bay && filter.bay !== 'all') {
      list = list.filter((a) => a.bay === filter.bay);
    }
    if (filter?.device_id && filter.device_id !== 'all') {
      list = list.filter((a) => a.device_id === filter.device_id);
    }
    if (filter?.unacknowledgedOnly) {
      list = list.filter((a) => !a.acknowledged);
    }
    return list;
  }

  public acknowledgeAlert(alertId: string, acknowledgedBy: string = 'Operator on Duty'): Alert | null {
    const alert = this.alertsList.find((a) => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedBy = acknowledgedBy;
      alert.acknowledgedAt = new Date().toISOString();
      return alert;
    }
    return null;
  }

  public getShardingStats(): { totalDevices: number; totalReadings: number; shards: { shardId: number; count: number }[] } {
    const shardCounts = new Map<number, number>();
    for (let i = 0; i < this.numShards; i++) shardCounts.set(i, 0);

    let totalReadings = 0;
    for (const p of this.shards.values()) {
      shardCounts.set(p.shardId, (shardCounts.get(p.shardId) || 0) + 1);
      totalReadings += p.getReadings().length;
    }

    return {
      totalDevices: this.shards.size,
      totalReadings,
      shards: Array.from(shardCounts.entries()).map(([shardId, count]) => ({ shardId, count })),
    };
  }
}

export const globalPartitionStore = new PartitionedTimeSeriesStore();
