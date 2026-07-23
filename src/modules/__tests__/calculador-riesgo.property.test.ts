import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { CalculadorRiesgo } from '../calculador-riesgo';
import { SEVERITY_WEIGHTS } from '../../constants';
import type { Finding, Severity } from '../../types/findings';

const SEVERITIES: Severity[] = ['alto', 'medio', 'bajo'];

/**
 * Generates a valid Finding with a given index and severity.
 */
function buildFinding(index: number, severity: Severity): Finding {
  return {
    id: `finding-${index}`,
    category: 'nulls',
    severity,
    description: `Test finding ${index}`,
    count: 1,
    percentage: 10,
    ruleBasedExplanation: `Explanation for finding ${index}`,
    recommendedAction: `Action for finding ${index}`,
  };
}

/**
 * Arbitrary that generates an array of 0–50 Finding objects with random severities.
 */
const arbitraryFindings = fc.array(
  fc.record({
    index: fc.nat({ max: 999 }),
    severity: fc.constantFrom(...SEVERITIES),
  }),
  { minLength: 0, maxLength: 50 }
).map((items) =>
  items.map((item, i) => buildFinding(i, item.severity))
);

describe('CalculadorRiesgo — Property-Based Tests', () => {
  const calculador = new CalculadorRiesgo();

  it('Property 1: el puntaje cumple la fórmula min(100, alto×20 + medio×10 + bajo×5)', () => {
    fc.assert(
      fc.property(arbitraryFindings, (findings) => {
        const result = calculador.calculate(findings);

        // Count severities
        const countAlto = findings.filter((f) => f.severity === 'alto').length;
        const countMedio = findings.filter((f) => f.severity === 'medio').length;
        const countBajo = findings.filter((f) => f.severity === 'bajo').length;

        // Expected values
        const expectedRawTotal =
          countAlto * SEVERITY_WEIGHTS.alto +
          countMedio * SEVERITY_WEIGHTS.medio +
          countBajo * SEVERITY_WEIGHTS.bajo;
        const expectedTotal = Math.min(100, expectedRawTotal);

        // Verify main formula
        expect(result.total).toBe(expectedTotal);
        expect(result.rawTotal).toBe(expectedRawTotal);

        // Verify range [0, 100]
        expect(result.total).toBeGreaterThanOrEqual(0);
        expect(result.total).toBeLessThanOrEqual(100);

        // Verify breakdown length matches findings length
        expect(result.breakdown).toHaveLength(findings.length);
      }),
      { numRuns: 200 }
    );
  });

  it('Property 1b: cada elemento del breakdown conserva findingId, severity y contribution correcta', () => {
    fc.assert(
      fc.property(arbitraryFindings, (findings) => {
        const result = calculador.calculate(findings);

        for (let i = 0; i < findings.length; i++) {
          const finding = findings[i]!;
          const breakdown = result.breakdown[i]!;

          expect(breakdown.findingId).toBe(finding.id);
          expect(breakdown.severity).toBe(finding.severity);
          expect(breakdown.contribution).toBe(SEVERITY_WEIGHTS[finding.severity]);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('Property 1c: calculate no modifica el arreglo original ni sus hallazgos', () => {
    fc.assert(
      fc.property(arbitraryFindings, (findings) => {
        // Create a deep snapshot before calling calculate
        const snapshot = JSON.stringify(findings);

        calculador.calculate(findings);

        // Verify the array and its contents are unchanged
        expect(JSON.stringify(findings)).toBe(snapshot);
      }),
      { numRuns: 200 }
    );
  });
});
