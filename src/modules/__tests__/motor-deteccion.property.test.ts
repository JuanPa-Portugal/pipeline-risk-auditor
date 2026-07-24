import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { MotorDeteccion } from '../motor-deteccion';
import type { CSVSummary, ColumnProfile } from '../../types/csv';

type Row = Record<string, string | null | undefined>;

const motor = new MotorDeteccion();

// --- Property 2: Correctitud del conteo de nulos y vacíos ---

describe('MotorDeteccion — Property 2: Correctitud del conteo de nulos y vacíos', () => {
  const arbitraryValue = fc.oneof(
    fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
    fc.constant(''),
    fc.constant('   '),
    fc.constant(null),
    fc.constant(undefined)
  );

  const arbitraryRows = fc.array(arbitraryValue, { minLength: 1, maxLength: 100 });

  it('el conteo de nulos y vacíos coincide exactamente con los valores reales', () => {
    fc.assert(
      fc.property(arbitraryRows, (values) => {
        const rowCount = values.length;

        // Build rows with a single column "valor"
        const rows: Row[] = values.map((v) => ({ valor: v }));

        // Build CSVSummary
        const column: ColumnProfile = {
          name: 'valor',
          inferredType: 'string',
          nullCount: 0,
          emptyCount: 0,
          uniqueCount: 0,
          sampleValues: [],
        };
        const summary: CSVSummary = {
          rowCount,
          columnCount: 1,
          columns: [column],
          parseErrors: [],
        };

        // Independent oracle: calculate expected counts
        const expectedNullCount = values.filter((v) => v === null || v === undefined).length;
        const expectedEmptyCount = values.filter(
          (v) => typeof v === 'string' && v.trim() === ''
        ).length;

        // Execute
        const result = motor.analyze(summary, rows);

        // Verify nulls
        const nullFinding = result.findings.find(
          (f) => f.category === 'nulls' && f.affectedColumns?.includes('valor')
        );

        if (expectedNullCount === 0) {
          expect(nullFinding).toBeUndefined();
        } else {
          expect(nullFinding).toBeDefined();
          expect(nullFinding!.count).toBe(expectedNullCount);
          const expectedNullPercentage = (expectedNullCount / rowCount) * 100;
          expect(nullFinding!.percentage).toBeCloseTo(
            Math.round(expectedNullPercentage * 10) / 10,
            5
          );
        }

        // Verify empties
        const emptyFinding = result.findings.find(
          (f) => f.category === 'empties' && f.affectedColumns?.includes('valor')
        );

        if (expectedEmptyCount === 0) {
          expect(emptyFinding).toBeUndefined();
        } else {
          expect(emptyFinding).toBeDefined();
          expect(emptyFinding!.count).toBe(expectedEmptyCount);
          const expectedEmptyPercentage = (expectedEmptyCount / rowCount) * 100;
          expect(emptyFinding!.percentage).toBeCloseTo(
            Math.round(expectedEmptyPercentage * 10) / 10,
            5
          );
        }
      }),
      { numRuns: 200 }
    );
  });
});

// --- Property 3: Correctitud del conteo de duplicados ---

describe('MotorDeteccion — Property 3: Correctitud del conteo de duplicados', () => {
  const arbitraryRow = fc.record({
    id: fc.string({ unit: fc.constantFrom('a', 'b', 'c', 'd', 'e'), minLength: 1, maxLength: 3 }),
    nombre: fc.string({ unit: fc.constantFrom('x', 'y', 'z', 'w'), minLength: 1, maxLength: 3 }),
  });

  const arbitraryRows = fc.array(arbitraryRow, { minLength: 0, maxLength: 100 });

  it('el conteo de duplicados coincide con total de filas - combinaciones únicas', () => {
    fc.assert(
      fc.property(arbitraryRows, (generatedRows) => {
        const rowCount = generatedRows.length;

        // Build rows with an extra undeclared property to prove analyze ignores it.
        // Two rows with same id+nombre but different extra must still be duplicates.
        const rows: Row[] = generatedRows.map((r, index) => ({
          id: r.id,
          nombre: r.nombre,
          extra_no_declarado: `extra-${index}`,
        }));

        // CSVSummary declares ONLY id and nombre (not extra_no_declarado)
        const summary: CSVSummary = {
          rowCount,
          columnCount: 2,
          columns: [
            { name: 'id', inferredType: 'string', nullCount: 0, emptyCount: 0, uniqueCount: 0, sampleValues: [] },
            { name: 'nombre', inferredType: 'string', nullCount: 0, emptyCount: 0, uniqueCount: 0, sampleValues: [] },
          ],
          parseErrors: [],
        };

        // Independent oracle: count duplicates using only declared columns
        const uniqueKeys = new Set(
          generatedRows.map((r) => JSON.stringify([r.id, r.nombre]))
        );
        const expectedDuplicates = rowCount - uniqueKeys.size;

        // Snapshot for immutability check
        const rowsSnapshot = JSON.stringify(rows);
        const summarySnapshot = JSON.stringify(summary);

        // Execute
        const result = motor.analyze(summary, rows);

        // Verify duplicates
        const dupFinding = result.findings.find((f) => f.category === 'duplicates');

        if (expectedDuplicates === 0) {
          expect(dupFinding).toBeUndefined();
        } else {
          expect(dupFinding).toBeDefined();
          expect(dupFinding!.count).toBe(expectedDuplicates);
          const expectedPercentage = (expectedDuplicates / rowCount) * 100;
          expect(dupFinding!.percentage).toBeCloseTo(
            Math.round(expectedPercentage * 10) / 10,
            5
          );
        }

        // Verify immutability
        expect(JSON.stringify(rows)).toBe(rowsSnapshot);
        expect(JSON.stringify(summary)).toBe(summarySnapshot);
      }),
      { numRuns: 200 }
    );
  });
});
