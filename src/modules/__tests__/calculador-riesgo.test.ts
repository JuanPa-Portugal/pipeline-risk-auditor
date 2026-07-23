import { describe, it, expect } from 'vitest';
import { CalculadorRiesgo } from '../calculador-riesgo';
import { SEVERITY_WEIGHTS } from '../../constants';
import type { Finding } from '../../types/findings';

function makeFinding(overrides: Partial<Finding> & { id: string; severity: Finding['severity'] }): Finding {
  return {
    category: 'nulls',
    description: 'Test finding',
    count: 1,
    ruleBasedExplanation: 'Explanation',
    recommendedAction: 'Action',
    ...overrides,
  };
}

describe('CalculadorRiesgo', () => {
  const calculador = new CalculadorRiesgo();

  describe('sin hallazgos', () => {
    it('retorna total = 0, rawTotal = 0 y breakdown vacío', () => {
      const result = calculador.calculate([]);

      expect(result.total).toBe(0);
      expect(result.rawTotal).toBe(0);
      expect(result.breakdown).toHaveLength(0);
    });
  });

  describe('hallazgos mixtos', () => {
    it('calcula correctamente con hallazgos de diferentes severidades', () => {
      const findings: Finding[] = [
        makeFinding({ id: 'f1', severity: 'alto' }),
        makeFinding({ id: 'f2', severity: 'medio' }),
        makeFinding({ id: 'f3', severity: 'bajo' }),
      ];

      const result = calculador.calculate(findings);

      expect(result.rawTotal).toBe(
        SEVERITY_WEIGHTS.alto + SEVERITY_WEIGHTS.medio + SEVERITY_WEIGHTS.bajo
      );
      expect(result.total).toBe(35);
    });

    it('alto aporta 20, medio aporta 10, bajo aporta 5', () => {
      const resultAlto = calculador.calculate([makeFinding({ id: 'a', severity: 'alto' })]);
      expect(resultAlto.total).toBe(SEVERITY_WEIGHTS.alto);

      const resultMedio = calculador.calculate([makeFinding({ id: 'm', severity: 'medio' })]);
      expect(resultMedio.total).toBe(SEVERITY_WEIGHTS.medio);

      const resultBajo = calculador.calculate([makeFinding({ id: 'b', severity: 'bajo' })]);
      expect(resultBajo.total).toBe(SEVERITY_WEIGHTS.bajo);
    });
  });

  describe('cap a 100', () => {
    it('limita el total a 100 cuando rawTotal supera 100', () => {
      const findings: Finding[] = Array.from({ length: 6 }, (_, i) =>
        makeFinding({ id: `f${i}`, severity: 'alto' })
      );

      const result = calculador.calculate(findings);

      expect(result.rawTotal).toBe(120);
      expect(result.total).toBe(100);
    });

    it('conserva todos los hallazgos en el breakdown aunque total sea 100', () => {
      const findings: Finding[] = Array.from({ length: 6 }, (_, i) =>
        makeFinding({ id: `f${i}`, severity: 'alto' })
      );

      const result = calculador.calculate(findings);
      expect(result.breakdown).toHaveLength(6);
    });
  });

  describe('breakdown', () => {
    it('cada elemento contiene findingId, severity y contribution correcta', () => {
      const findings: Finding[] = [
        makeFinding({ id: 'null-email', severity: 'alto' }),
        makeFinding({ id: 'empty-name', severity: 'medio' }),
        makeFinding({ id: 'dup-rows', severity: 'bajo' }),
      ];

      const result = calculador.calculate(findings);

      expect(result.breakdown[0]).toEqual({
        findingId: 'null-email',
        severity: 'alto',
        contribution: SEVERITY_WEIGHTS.alto,
      });
      expect(result.breakdown[1]).toEqual({
        findingId: 'empty-name',
        severity: 'medio',
        contribution: SEVERITY_WEIGHTS.medio,
      });
      expect(result.breakdown[2]).toEqual({
        findingId: 'dup-rows',
        severity: 'bajo',
        contribution: SEVERITY_WEIGHTS.bajo,
      });
    });
  });

  describe('inmutabilidad', () => {
    it('no modifica el arreglo original de hallazgos', () => {
      const findings: Finding[] = [
        makeFinding({ id: 'f1', severity: 'alto' }),
        makeFinding({ id: 'f2', severity: 'medio' }),
      ];
      const originalLength = findings.length;
      const originalFirst = { ...findings[0] };

      calculador.calculate(findings);

      expect(findings).toHaveLength(originalLength);
      expect(findings[0]).toEqual(originalFirst);
    });
  });
});
