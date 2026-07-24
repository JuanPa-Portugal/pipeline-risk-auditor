import type { CSVSummary } from '../types/csv';
import type { Finding } from '../types/findings';
import type { ColumnCandidate } from '../types/candidates';
import type { RiskScore } from '../types/risk';
import { MAX_SAMPLE_ROWS } from '../constants';
import { AnalizadorCSV } from './analizador-csv';
import { MotorDeteccion } from './motor-deteccion';
import { MotorHeuristico } from './motor-heuristico';
import { CalculadorRiesgo } from './calculador-riesgo';

/**
 * Result of a local analysis run.
 * Does NOT include the full parsed rows — only a limited sample for preview.
 */
export interface LocalAnalysisResult {
  summary: CSVSummary;
  sampleRows: Record<string, string>[];
  findings: Finding[];
  candidates: ColumnCandidate[];
  riskScore: RiskScore;
}

/**
 * Orchestrator — Coordinates the complete local analysis pipeline:
 * parseWithRows → detection → heuristics → risk calculation
 *
 * Full rows exist only temporarily during execution and are never
 * stored as class state, returned in the result, or sent externally.
 */
export class Orchestrator {
  private readonly analizador = new AnalizadorCSV();
  private readonly motorDeteccion = new MotorDeteccion();
  private readonly motorHeuristico = new MotorHeuristico();
  private readonly calculadorRiesgo = new CalculadorRiesgo();

  /**
   * Runs the complete local analysis pipeline on a CSV file.
   * Errors from any module propagate directly to the caller.
   */
  async analyze(file: File): Promise<LocalAnalysisResult> {
    // 1. Parse — single call, get summary + rows
    const { summary, rows } = await this.analizador.parseWithRows(file);

    // 2. Detection — uses full rows temporarily
    const detectionResult = this.motorDeteccion.analyze(summary, rows);

    // 3. Heuristics — uses only summary
    const heuristicResult = this.motorHeuristico.evaluate(summary);

    // 4. Risk calculation — uses findings from detection
    const riskScore = this.calculadorRiesgo.calculate(detectionResult.findings);

    // 5. Build sampleRows (max MAX_SAMPLE_ROWS) — convert undefined → ""
    //    Only include columns declared in summary.columns
    const columnNames = summary.columns.map((col) => col.name);
    const sampleRows: Record<string, string>[] = rows
      .slice(0, MAX_SAMPLE_ROWS)
      .map((row) => {
        const clean: Record<string, string> = {};
        for (const name of columnNames) {
          const value = row[name];
          clean[name] = value !== undefined ? value : '';
        }
        return clean;
      });

    // Full rows are not stored, returned, or referenced beyond this point
    return {
      summary,
      sampleRows,
      findings: detectionResult.findings,
      candidates: heuristicResult.candidates,
      riskScore,
    };
  }
}
