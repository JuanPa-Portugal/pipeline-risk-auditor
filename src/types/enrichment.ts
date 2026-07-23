import type { Severity } from './findings';
import type { CandidateType } from './candidates';

export interface EnrichRequest {
  structureSummary: {
    rowCount: number;
    columnCount: number;
    columns: { name: string; inferredType: string }[];
  };
  findings: {
    id: string;
    category: string;
    severity: Severity;
    description: string;
    count: number;
    percentage?: number;
  }[];
  candidates: {
    columnName: string;
    candidateType: CandidateType;
    confidence: string;
  }[];
  riskScore: number;
}

export interface EnrichedExplanation {
  findingId: string;
  technicalImpact: string;
  contextualExplanation: string;
  correctiveAction: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface EnrichResponse {
  explanations: EnrichedExplanation[];
  executiveSummary: string;
  overallRiskAssessment: string;
  source: 'ai';
}
