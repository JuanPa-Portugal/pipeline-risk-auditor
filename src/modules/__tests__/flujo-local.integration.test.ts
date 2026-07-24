import { describe, it, expect } from 'vitest';
import { Orchestrator } from '../orchestrator';
import { generateMarkdownReport } from '../generador-reporte';
import { SEVERITY_WEIGHTS, MAX_SAMPLE_ROWS } from '../../constants';
import type { ColumnCandidate } from '../../types/candidates';

/**
 * CSV de prueba diseñado para activar múltiples reglas de detección:
 * - id: valores numéricos, con un duplicado (fila 1 y 4 son idénticas)
 * - nombre: tiene un valor vacío en fila 3
 * - updated_at: columna temporal con:
 *   - fechas válidas en la mayoría
 *   - 1 fecha inválida (mes 13)
 *   - 1 texto no reconocible como fecha
 *   - 1 valor vacío
 *
 * 10 filas totales, al menos 1 duplicado exacto.
 */
const TEST_CSV = [
  'id,nombre,updated_at',
  '1,Alice,2024-01-15',
  '2,Bob,2024-02-20',
  '3,,2024-13-01',        // nombre vacío, fecha inválida (mes 13)
  '1,Alice,2024-01-15',   // fila duplicada exacta de fila 1
  '4,Diana,',             // updated_at vacío
  '5,Eva,not-a-date',     // updated_at formato no reconocible
  '6,Frank,2024-03-10',
  '7,Grace,2024-04-05',
  '8,Henry,2024-05-12',
  '9,Irene,2024-06-18',
].join('\n');

function createTestFile(): File {
  const file = new File([TEST_CSV], 'clientes-integracion.csv', {
    type: 'text/csv;charset=utf-8',
  });
  // jsdom's File does not implement arrayBuffer natively
  if (!file.arrayBuffer) {
    const blob = new Blob([TEST_CSV], { type: 'text/csv;charset=utf-8' });
    file.arrayBuffer = () =>
      new Promise<ArrayBuffer>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.readAsArrayBuffer(blob);
      });
  }
  return file;
}

describe('Flujo local completo — test de integración', () => {
  const orchestrator = new Orchestrator();

  it('ejecuta el flujo CSV → análisis → heurísticas → puntaje → reporte', async () => {
    const file = createTestFile();
    const result = await orchestrator.analyze(file);

    // --- 1. Resumen estructural ---
    expect(result.summary.rowCount).toBe(10);
    expect(result.summary.columnCount).toBe(3);
    expect(result.summary.columns.map((c) => c.name)).toEqual(['id', 'nombre', 'updated_at']);
    expect(result.sampleRows.length).toBeLessThanOrEqual(MAX_SAMPLE_ROWS);
    // El resultado no expone las filas completas
    expect(result).not.toHaveProperty('rows');

    // --- 2. Hallazgos ---
    expect(result.findings.length).toBeGreaterThan(0);

    // Debe existir un hallazgo de duplicados
    const dupFinding = result.findings.find((f) => f.category === 'duplicates');
    expect(dupFinding).toBeDefined();
    expect(dupFinding!.count).toBeGreaterThan(0);

    // Debe existir al menos un hallazgo de vacíos (nombre o updated_at tienen vacíos)
    const emptyFindings = result.findings.filter((f) => f.category === 'empties');
    expect(emptyFindings.length).toBeGreaterThan(0);

    // Debe existir un hallazgo de fechas inválidas en updated_at
    const dateFindings = result.findings.filter((f) => f.category === 'invalid_dates');
    expect(dateFindings.length).toBeGreaterThan(0);
    const updatedAtDateFinding = dateFindings.find(
      (f) => f.affectedColumns?.includes('updated_at')
    );
    expect(updatedAtDateFinding).toBeDefined();

    // --- 3. Candidatas ---
    expect(result.candidates.length).toBeGreaterThan(0);

    // updated_at debe ser identificada como candidata a incremental_marker
    const incrementalCandidate = result.candidates.find(
      (c) => c.columnName === 'updated_at' && c.candidateType === 'incremental_marker'
    );
    expect(incrementalCandidate).toBeDefined();

    // Todas las candidatas inicialmente sin confirmar
    for (const candidate of result.candidates) {
      expect(candidate.confirmedByUser).toBe(false);
    }

    // --- 4. Puntaje correcto (cálculo independiente) ---
    const expectedRawTotal = result.findings.reduce(
      (sum, f) => sum + SEVERITY_WEIGHTS[f.severity],
      0
    );
    const expectedTotal = Math.min(100, expectedRawTotal);

    expect(result.riskScore.rawTotal).toBe(expectedRawTotal);
    expect(result.riskScore.total).toBe(expectedTotal);
    expect(result.riskScore.breakdown.length).toBe(result.findings.length);

    // --- 5. Confirmación simulada e inmutabilidad ---
    const candidateToConfirm = result.candidates[0]!;

    // Crear nuevo arreglo con una sola candidata confirmada (sin mutar el original)
    const confirmedCandidates: ColumnCandidate[] = result.candidates.map((c) =>
      c.columnName === candidateToConfirm.columnName
        ? { ...c, confirmedByUser: true }
        : c
    );

    // Verificar que el arreglo original NO fue mutado
    for (const original of result.candidates) {
      expect(original.confirmedByUser).toBe(false);
    }

    // Verificar que exactamente una candidata del nuevo arreglo está confirmada
    const confirmedOnes = confirmedCandidates.filter((c) => c.confirmedByUser);
    expect(confirmedOnes.length).toBe(1);
    expect(confirmedOnes[0]!.columnName).toBe(candidateToConfirm.columnName);

    // Las restantes permanecen sin confirmar
    const unconfirmedOnes = confirmedCandidates.filter((c) => !c.confirmedByUser);
    expect(unconfirmedOnes.length).toBe(result.candidates.length - 1);

    // --- 6. Reporte Markdown ---
    const markdown = generateMarkdownReport({
      fileName: file.name,
      summary: result.summary,
      findings: result.findings,
      candidates: confirmedCandidates,
      riskScore: result.riskScore,
    });

    // Encabezados esperados
    expect(markdown).toContain('# Pipeline Risk Auditor');
    expect(markdown).toContain('clientes-integracion.csv');
    expect(markdown).toContain('rules_only');
    expect(markdown).toContain('## Resumen de estructura');
    expect(markdown).toContain('## Puntaje de riesgo');
    expect(markdown).toContain('## Hallazgos detectados');
    expect(markdown).toContain('## Columnas candidatas confirmadas');

    // Contiene el puntaje calculado
    expect(markdown).toContain(`${result.riskScore.total}`);

    // Contiene el nombre de la candidata confirmada
    expect(markdown).toContain(candidateToConfirm.columnName);

    // Contiene la descripción real del primer hallazgo
    const findingDescription = result.findings[0]!.description;
    expect(markdown).toContain(findingDescription);

    // Indica modo local sin AWS (texto público real de generador-reporte.ts)
    expect(markdown).toContain('reglas determinísticas locales');
    expect(markdown).toContain('sin depender de servicios de inteligencia artificial ni de AWS');
  });
});
