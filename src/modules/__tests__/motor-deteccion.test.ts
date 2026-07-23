import { describe, it, expect } from 'vitest';
import { MotorDeteccion } from '../motor-deteccion';
import type { CSVSummary, ColumnProfile } from '../../types/csv';

type Row = Record<string, string | null | undefined>;

function makeColumn(overrides: Partial<ColumnProfile> & { name: string }): ColumnProfile {
  return {
    inferredType: 'string',
    nullCount: 0,
    emptyCount: 0,
    uniqueCount: 0,
    sampleValues: [],
    ...overrides,
  };
}

function makeSummary(columns: ColumnProfile[], rowCount: number): CSVSummary {
  return {
    rowCount,
    columnCount: columns.length,
    columns,
    parseErrors: [],
  };
}

describe('MotorDeteccion', () => {
  const motor = new MotorDeteccion();

  describe('detección de nulos', () => {
    it('detecta valores nulos por columna', () => {
      const columns = [makeColumn({ name: 'email' })];
      const summary = makeSummary(columns, 5);
      const rows: Row[] = [
        { email: 'a@test.com' },
        { email: null },
        { email: 'b@test.com' },
        { email: undefined },
        { email: 'c@test.com' },
      ];

      const result = motor.analyze(summary, rows);
      const nullFinding = result.findings.find((f) => f.category === 'nulls' && f.affectedColumns?.includes('email'));

      expect(nullFinding).toBeDefined();
      expect(nullFinding!.count).toBe(2);
      expect(nullFinding!.percentage).toBe(40);
    });
  });

  describe('detección de vacíos', () => {
    it('detecta cadenas vacías y compuestas solo por espacios', () => {
      const columns = [makeColumn({ name: 'status' })];
      const summary = makeSummary(columns, 5);
      const rows: Row[] = [
        { status: 'active' },
        { status: '' },
        { status: '   ' },
        { status: 'inactive' },
        { status: 'active' },
      ];

      const result = motor.analyze(summary, rows);
      const emptyFinding = result.findings.find((f) => f.category === 'empties');

      expect(emptyFinding).toBeDefined();
      expect(emptyFinding!.count).toBe(2);
    });

    it('no cuenta null/undefined como vacíos', () => {
      const columns = [makeColumn({ name: 'value' })];
      const summary = makeSummary(columns, 3);
      const rows: Row[] = [
        { value: null },
        { value: undefined },
        { value: 'data' },
      ];

      const result = motor.analyze(summary, rows);
      const emptyFinding = result.findings.find((f) => f.category === 'empties');
      expect(emptyFinding).toBeUndefined();
    });
  });

  describe('detección de duplicados', () => {
    it('detecta filas duplicadas exactas', () => {
      const columns = [makeColumn({ name: 'id' }), makeColumn({ name: 'name' })];
      const summary = makeSummary(columns, 5);
      const rows: Row[] = [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
        { id: '1', name: 'Alice' },
        { id: '3', name: 'Carol' },
        { id: '2', name: 'Bob' },
      ];

      const result = motor.analyze(summary, rows);
      const dupFinding = result.findings.find((f) => f.category === 'duplicates');

      expect(dupFinding).toBeDefined();
      expect(dupFinding!.count).toBe(2);
    });

    it('no considera duplicadas filas que difieren en al menos un campo', () => {
      const columns = [makeColumn({ name: 'id' }), makeColumn({ name: 'name' })];
      const summary = makeSummary(columns, 3);
      const rows: Row[] = [
        { id: '1', name: 'Alice' },
        { id: '1', name: 'Bob' },
        { id: '2', name: 'Alice' },
      ];

      const result = motor.analyze(summary, rows);
      const dupFinding = result.findings.find((f) => f.category === 'duplicates');
      expect(dupFinding).toBeUndefined();
    });

    it('no depende de propiedades adicionales fuera de las columnas declaradas', () => {
      const columns = [makeColumn({ name: 'id' })];
      const summary = makeSummary(columns, 3);
      const rows: Row[] = [
        { id: '1', __parsed_extra: 'extra1' },
        { id: '2', __parsed_extra: 'extra2' },
        { id: '1', __parsed_extra: 'different' },
      ];

      const result = motor.analyze(summary, rows);
      const dupFinding = result.findings.find((f) => f.category === 'duplicates');

      expect(dupFinding).toBeDefined();
      expect(dupFinding!.count).toBe(1);
    });
  });

  describe('detección de fechas inválidas', () => {
    it('detecta fechas inválidas en una columna temporal', () => {
      const columns = [makeColumn({ name: 'created_date', inferredType: 'date' })];
      const summary = makeSummary(columns, 4);
      const rows: Row[] = [
        { created_date: '2024-01-15' },
        { created_date: '2024-13-01' },
        { created_date: '2024-02-30' },
        { created_date: '15/01/2024' },
      ];

      const result = motor.analyze(summary, rows);
      const dateFinding = result.findings.find((f) => f.category === 'invalid_dates');

      expect(dateFinding).toBeDefined();
      expect(dateFinding!.count).toBe(2);
    });

    it('no genera hallazgo cuando todas las fechas son válidas', () => {
      const columns = [makeColumn({ name: 'event_date', inferredType: 'date' })];
      const summary = makeSummary(columns, 3);
      const rows: Row[] = [
        { event_date: '2024-01-15' },
        { event_date: '2024-06-30' },
        { event_date: '01/12/2024' },
      ];

      const result = motor.analyze(summary, rows);
      const dateFinding = result.findings.find((f) => f.category === 'invalid_dates');
      expect(dateFinding).toBeUndefined();
    });
  });

  describe('clasificación de severidad — límites exactos', () => {
    it('exactamente 20% de afectados produce severidad "alto"', () => {
      const columns = [makeColumn({ name: 'col' })];
      const summary = makeSummary(columns, 5);
      // 1 out of 5 = 20% exactly → alto
      const rows: Row[] = [
        { col: null },
        { col: 'a' },
        { col: 'b' },
        { col: 'c' },
        { col: 'd' },
      ];

      const result = motor.analyze(summary, rows);
      const finding = result.findings.find((f) => f.category === 'nulls');
      expect(finding).toBeDefined();
      expect(finding!.percentage).toBe(20);
      expect(finding!.severity).toBe('alto');
    });

    it('exactamente 5% de afectados produce severidad "medio"', () => {
      const columns = [makeColumn({ name: 'col' })];
      const summary = makeSummary(columns, 20);
      // 1 out of 20 = 5% exactly → medio
      const rows: Row[] = Array.from({ length: 20 }, (_, i) =>
        i === 0 ? { col: null } : { col: `val${i}` }
      );

      const result = motor.analyze(summary, rows);
      const finding = result.findings.find((f) => f.category === 'nulls');
      expect(finding).toBeDefined();
      expect(finding!.percentage).toBe(5);
      expect(finding!.severity).toBe('medio');
    });

    it('porcentaje positivo menor a 5% produce severidad "bajo"', () => {
      const columns = [makeColumn({ name: 'col' })];
      const summary = makeSummary(columns, 100);
      // 1 out of 100 = 1% → bajo
      const rows: Row[] = Array.from({ length: 100 }, (_, i) =>
        i === 0 ? { col: null } : { col: `val${i}` }
      );

      const result = motor.analyze(summary, rows);
      const finding = result.findings.find((f) => f.category === 'nulls');
      expect(finding).toBeDefined();
      expect(finding!.percentage).toBe(1);
      expect(finding!.severity).toBe('bajo');
    });
  });

  describe('datos limpios', () => {
    it('devuelve cero hallazgos para datos completamente limpios', () => {
      const columns = [
        makeColumn({ name: 'id', inferredType: 'number' }),
        makeColumn({ name: 'name', inferredType: 'string' }),
      ];
      const summary = makeSummary(columns, 3);
      const rows: Row[] = [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
        { id: '3', name: 'Carol' },
      ];

      const result = motor.analyze(summary, rows);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('regla late-arriving', () => {
    it('no genera hallazgo de late-arriving en el MVP', () => {
      const columns = [
        makeColumn({ name: 'event_date', inferredType: 'date' }),
        makeColumn({ name: 'ingestion_date', inferredType: 'date' }),
      ];
      const summary = makeSummary(columns, 3);
      const rows: Row[] = [
        { event_date: '2024-01-01', ingestion_date: '2024-01-05' },
        { event_date: '2024-01-02', ingestion_date: '2024-01-03' },
        { event_date: '2024-01-03', ingestion_date: '2024-01-03' },
      ];

      const result = motor.analyze(summary, rows);
      const lateArriving = result.findings.find((f) => f.category === 'late_arriving');
      expect(lateArriving).toBeUndefined();
    });
  });

  describe('metadata', () => {
    it('reporta rulesExecuted y executionTimeMs', () => {
      const columns = [makeColumn({ name: 'col' })];
      const summary = makeSummary(columns, 1);
      const rows: Row[] = [{ col: 'value' }];

      const result = motor.analyze(summary, rows);
      expect(result.metadata.rulesExecuted).toBe(5);
      expect(result.metadata.executionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });
});
