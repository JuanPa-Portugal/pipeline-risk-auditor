import type { CSVSummary } from './csv';
import type { Finding } from './findings';
import type { ColumnCandidate } from './candidates';
import type { RiskScore } from './risk';
import type { EnrichResponse } from './enrichment';

export interface AppState {
  // Estado de carga
  fileInfo: {
    name: string;
    size: number;
    loadedAt: string;
  } | null;

  // Resumen (NO todas las filas)
  summary: CSVSummary | null;

  // Muestra limitada de filas (máximo 10 filas para preview)
  sampleRows: Record<string, string>[] | null; // máx 10 filas

  // Resultados del análisis
  findings: Finding[];
  candidates: ColumnCandidate[];
  riskScore: RiskScore | null;

  // Enriquecimiento IA
  enrichment: EnrichResponse | null;
  aiStatus: 'idle' | 'loading' | 'success' | 'error';

  // Estado de la UI
  analysisPhase: 'idle' | 'parsing' | 'analyzing' | 'enriching' | 'complete';
  error: string | null;
}

export type AppAction =
  | { type: 'SET_FILE'; payload: { name: string; size: number; loadedAt: string } }
  | { type: 'SET_SUMMARY'; payload: CSVSummary }
  | { type: 'SET_SAMPLE_ROWS'; payload: Record<string, string>[] }
  | { type: 'SET_FINDINGS'; payload: Finding[] }
  | { type: 'SET_CANDIDATES'; payload: ColumnCandidate[] }
  | { type: 'SET_RISK_SCORE'; payload: RiskScore }
  | { type: 'SET_ENRICHMENT'; payload: EnrichResponse }
  | { type: 'SET_AI_STATUS'; payload: AppState['aiStatus'] }
  | { type: 'SET_PHASE'; payload: AppState['analysisPhase'] }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'RESET' };
