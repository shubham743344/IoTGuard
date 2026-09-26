export type MachineStatus = 'normal' | 'degraded' | 'fail';
export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface SensorReading {
  device_id: string;
  timestamp: string; // ISO string
  vibration: number; // mm/s (Normal: 1.5 - 3.5, Warning: > 4.5, Critical: > 7.0)
  temperature: number; // °C (Normal: 45 - 65, Warning: > 75, Critical: > 90)
  pressure: number; // PSI (Normal: 85 - 105, Warning: < 75, Critical: < 60)
  status: MachineStatus;
  is_imputed?: boolean; // True if filled by imputation (forward-fill / linear interpolation)
  is_blackout?: boolean; // True if raw sensor dropout occurred
}

export interface ShapAttribution {
  sensor: 'vibration' | 'temperature' | 'pressure';
  sensorLabel: string;
  shapValue: number; // Contribution to log-odds or probability delta
  relativePercentage: number; // e.g. 58%
  currentValue: number;
  normalBaseline: string; // e.g. "1.5 - 3.5 mm/s"
  unit: string;
  direction: 'increase_risk' | 'decrease_risk' | 'neutral';
  explanationText: string;
}

export interface ShapExplanation {
  baseValue: number; // E[f(x)] expected failure risk across population (~0.082)
  predictedRisk: number; // Final model output
  totalShapDelta: number; // Sum of shap values
  attributions: ShapAttribution[];
  primaryDriver: 'vibration' | 'temperature' | 'pressure';
  driverSummary: string;
}

export interface McDropoutDistribution {
  samples: number[]; // 20 stochastic forward passes
  mean: number; // Point prediction
  median: number;
  std: number; // Uncertainty spread
  ci95Lower: number; // 95% Confidence Interval lower bound
  ci95Upper: number; // 95% Confidence Interval upper bound
  uncertaintyScore: number; // Standard error / confidence metric
}

export interface ForecastResult {
  device_id: string;
  timestamp: string;
  horizonHours: number; // 24 hours
  failureProbability: number; // Mean MC prediction (0 to 1)
  riskLevel: 'nominal' | 'warning' | 'critical';
  confidenceInterval: [number, number]; // [lower, upper]
  mcDistribution: McDropoutDistribution;
  shap: ShapExplanation;
  preprocessedSummary: {
    lookbackHours: number;
    imputedGapsCount: number;
    sensorMean: { vibration: number; temperature: number; pressure: number };
  };
}

export interface DeviceSummary {
  id: string; // e.g. "CNC-001"
  name: string; // e.g. "CNC 5-Axis Mill A-1"
  bay: string; // "Bay A - Milling", "Bay B - Lathe", etc.
  type: string; // "5-Axis Vertical Mill", "Dual-Spindle Lathe", "Horizontal Boring Mill", "Precision Grinder"
  installDate: string;
  status: MachineStatus;
  currentRisk: number; // 24h failure probability (0.0 to 1.0)
  riskLevel: 'nominal' | 'warning' | 'critical';
  confidenceInterval: [number, number];
  primaryDriver: 'vibration' | 'temperature' | 'pressure';
  latestReading: SensorReading;
  activeAlertCount: number;
  lastMaintenance: string;
  rpm: number;
}

export interface Alert {
  id: string;
  device_id: string;
  bay: string;
  timestamp: string;
  severity: AlertSeverity;
  riskScore: number;
  triggeredSensor: 'vibration' | 'temperature' | 'pressure' | 'multi_sensor';
  message: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

export interface ModelValidationMetrics {
  modelName: string;
  architecture: string;
  lookbackWindow: string; // "24 hours (1-hour resampled)"
  features: string[];
  hiddenUnits: number;
  dropoutRate: number;
  mcDropoutPasses: number;
  trainSplit: string; // "80% Train (40 devices), 20% Test (10 devices)"
  validationMae: number; // < 5% target (e.g. 0.038 / 3.8%)
  anomalyWindowMae: number; // e.g. 0.041 / 4.1%
  rocAuc: number; // e.g. 0.965
  precision: number; // e.g. 0.942
  recall: number; // e.g. 0.921
  f1Score: number; // e.g. 0.931
  imputationStrategy: string; // "Forward-fill + Linear Interpolation"
  resamplingCadence: string; // "1-hour intervals"
  normalBaselines: {
    vibration: { min: number; max: number; warning: number; critical: number; unit: string };
    temperature: { min: number; max: number; warning: number; critical: number; unit: string };
    pressure: { min: number; max: number; warning: number; critical: number; unit: string };
  };
}

export interface WebSocketMessage {
  type: 'init' | 'reading_batch' | 'reading_new' | 'forecast_updated' | 'alert_triggered' | 'device_status_changed';
  payload: any;
}
