import type { Finding } from '../types/findings';
import type { RiskBreakdown, RiskScore } from '../types/risk';
import { SEVERITY_WEIGHTS } from '../constants';

/**
 * Calculador_Riesgo — Calcula el puntaje de riesgo agregado a partir de los hallazgos.
 *
 * Fórmula: min(100, (alto × 20) + (medio × 10) + (bajo × 5))
 * Los pesos se obtienen de SEVERITY_WEIGHTS en constants.ts.
 */
export class CalculadorRiesgo {
  /**
   * Calculates the aggregate risk score from a list of findings.
   * Does not mutate the input array.
   *
   * - Returns total = 0 when findings is empty.
   * - total is always in range [0, 100] (capped at 100).
   * - rawTotal is the uncapped sum of all contributions.
   * - breakdown includes every finding with its individual contribution.
   */
  calculate(findings: readonly Finding[]): RiskScore {
    const breakdown: RiskBreakdown[] = findings.map((finding) => ({
      findingId: finding.id,
      severity: finding.severity,
      contribution: SEVERITY_WEIGHTS[finding.severity],
    }));

    const rawTotal = breakdown.reduce((sum, item) => sum + item.contribution, 0);
    const total = Math.min(100, Math.max(0, rawTotal));

    return {
      total,
      rawTotal,
      breakdown,
    };
  }
}
