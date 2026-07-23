export type Severity = 'alto' | 'medio' | 'bajo';

export interface Finding {
  id: string;
  category: 'nulls' | 'empties' | 'duplicates' | 'invalid_dates' | 'late_arriving' | 'mutations';
  severity: Severity;
  description: string;
  affectedColumns?: string[];
  count: number;
  percentage?: number;
  ruleBasedExplanation: string;
  recommendedAction: string;
}

export interface DetectionResult {
  findings: Finding[];
  metadata: {
    rulesExecuted: number;
    executionTimeMs: number;
  };
}
