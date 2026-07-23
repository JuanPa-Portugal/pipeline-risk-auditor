import type { Severity } from './findings';

export interface RiskBreakdown {
  findingId: string;
  severity: Severity;
  contribution: number;
}

export interface RiskScore {
  total: number; // 0–100 (capped)
  rawTotal: number; // sin cap, para desglose
  breakdown: RiskBreakdown[];
}
