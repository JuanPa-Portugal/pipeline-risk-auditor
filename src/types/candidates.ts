export type CandidateType = 'primary_key' | 'business_key' | 'incremental_marker';

export interface ColumnCandidate {
  columnName: string;
  candidateType: CandidateType;
  confidence: 'alta' | 'media' | 'baja';
  reasoning: string;
  confirmedByUser: boolean;
}

export interface HeuristicResult {
  candidates: ColumnCandidate[];
  insufficientEvidence: boolean;
  message?: string;
}
