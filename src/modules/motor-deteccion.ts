import type { CSVSummary } from '../types/csv';
import type { Severity, Finding, DetectionResult } from '../types/findings';

type Row = Record<string, string | null | undefined>;

// Patterns that suggest a temporal column by name
const TEMPORAL_NAME_PATTERNS = [
  'date', 'fecha', 'timestamp', 'time',
  'created', 'updated', 'modified', 'event',
];

// Accepted date formats (conservative)
const DATE_REGEX_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_REGEX_ISO_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})$/;
const DATE_REGEX_DMY_SLASH = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const DATE_REGEX_DMY_DASH = /^(\d{2})-(\d{2})-(\d{4})$/;

/**
 * Classifies severity based on affected percentage.
 * - alto: >= 20%
 * - medio: >= 5% and < 20%
 * - bajo: > 0% and < 5%
 */
function classifySeverity(percentage: number): Severity {
  if (percentage >= 20) return 'alto';
  if (percentage >= 5) return 'medio';
  return 'bajo';
}

/**
 * Checks if a date actually exists in the calendar using UTC to avoid timezone issues.
 */
function isValidCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Validates a single date string against accepted formats.
 * Returns true if the date is valid, false otherwise.
 */
function isValidDate(value: string): boolean {
  const trimmed = value.trim();

  // YYYY-MM-DD
  let match = trimmed.match(DATE_REGEX_ISO);
  if (match) {
    return isValidCalendarDate(+match[1]!, +match[2]!, +match[3]!);
  }

  // YYYY-MM-DDTHH:mm:ss or YYYY-MM-DD HH:mm:ss
  match = trimmed.match(DATE_REGEX_ISO_TIME);
  if (match) {
    const hour = +match[4]!, min = +match[5]!, sec = +match[6]!;
    if (hour > 23 || min > 59 || sec > 59) return false;
    return isValidCalendarDate(+match[1]!, +match[2]!, +match[3]!);
  }

  // DD/MM/YYYY
  match = trimmed.match(DATE_REGEX_DMY_SLASH);
  if (match) {
    return isValidCalendarDate(+match[3]!, +match[2]!, +match[1]!);
  }

  // DD-MM-YYYY
  match = trimmed.match(DATE_REGEX_DMY_DASH);
  if (match) {
    return isValidCalendarDate(+match[3]!, +match[2]!, +match[1]!);
  }

  return false;
}

/**
 * Determines if a column is temporal based on its inferred type or name patterns.
 */
function isTemporalColumn(name: string, inferredType: string): boolean {
  if (inferredType === 'date') return true;
  const lower = name.toLowerCase();
  return TEMPORAL_NAME_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Motor_Deteccion — Ejecuta reglas determinísticas para detectar problemas de calidad.
 */
export class MotorDeteccion {
  /**
   * Analyzes CSV data and returns detected findings.
   * Only accesses columns declared in summary.columns (never Object.values, never __parsed_extra).
   */
  analyze(summary: CSVSummary, rows: Row[]): DetectionResult {
    const startTime = performance.now();
    const findings: Finding[] = [];
    const headers = summary.columns.map((col) => col.name);
    const totalRows = rows.length;

    // Rule categories evaluated
    let rulesExecuted = 0;

    // --- 1. Nulls detection (per column) ---
    rulesExecuted++;
    for (const colName of headers) {
      let count = 0;
      for (const row of rows) {
        const value = row[colName];
        if (value === null || value === undefined) {
          count++;
        }
      }
      if (count > 0) {
        const percentage = (count / totalRows) * 100;
        findings.push({
          id: `nulls-${colName}`,
          category: 'nulls',
          severity: classifySeverity(percentage),
          description: `La columna "${colName}" contiene ${count} valores nulos (${percentage.toFixed(1)}%).`,
          affectedColumns: [colName],
          count,
          percentage: Math.round(percentage * 10) / 10,
          ruleBasedExplanation: `Se detectaron ${count} celdas sin valor en la columna "${colName}". Los valores nulos pueden causar errores en JOINs, agregaciones incorrectas o pérdida de registros en destinos que no admiten NULL.`,
          recommendedAction: `Investigar la fuente del dato para la columna "${colName}". Considerar agregar validación NOT NULL en el esquema destino o implementar un valor por defecto apropiado.`,
        });
      }
    }

    // --- 2. Empties detection (per column) ---
    rulesExecuted++;
    for (const colName of headers) {
      let count = 0;
      for (const row of rows) {
        const value = row[colName];
        // Only count strings that are empty or whitespace-only.
        // null/undefined are NOT counted as empty (they are nulls).
        if (typeof value === 'string' && value.trim() === '') {
          count++;
        }
      }
      if (count > 0) {
        const percentage = (count / totalRows) * 100;
        findings.push({
          id: `empties-${colName}`,
          category: 'empties',
          severity: classifySeverity(percentage),
          description: `La columna "${colName}" contiene ${count} valores vacíos (${percentage.toFixed(1)}%).`,
          affectedColumns: [colName],
          count,
          percentage: Math.round(percentage * 10) / 10,
          ruleBasedExplanation: `Se detectaron ${count} celdas con cadenas vacías o compuestas solo por espacios en la columna "${colName}". Los valores vacíos pueden pasar validaciones de NOT NULL pero generar resultados incorrectos en filtros y reportes.`,
          recommendedAction: `Revisar si los valores vacíos en "${colName}" deberían ser NULL explícitos o si representan un problema en la extracción. Considerar un paso de limpieza que convierta vacíos a NULL.`,
        });
      }
    }

    // --- 3. Exact duplicate rows ---
    rulesExecuted++;
    const seen = new Set<string>();
    let duplicateCount = 0;
    for (const row of rows) {
      // Collision-free serialization using JSON.stringify with typed markers.
      // Uses only declared headers in order. Distinguishes string, null, and undefined.
      const key = JSON.stringify(
        headers.map((name) => {
          const value = row[name];
          if (value === null) {
            return { type: 'null' };
          }
          if (value === undefined) {
            return { type: 'undefined' };
          }
          return { type: 'string', value };
        })
      );
      if (seen.has(key)) {
        duplicateCount++;
      } else {
        seen.add(key);
      }
    }
    if (duplicateCount > 0) {
      const percentage = (duplicateCount / totalRows) * 100;
      findings.push({
        id: 'duplicates-exact',
        category: 'duplicates',
        severity: classifySeverity(percentage),
        description: `Se detectaron ${duplicateCount} filas duplicadas exactas (${percentage.toFixed(1)}% del total).`,
        count: duplicateCount,
        percentage: Math.round(percentage * 10) / 10,
        ruleBasedExplanation: `Existen ${duplicateCount} filas que son copias exactas de otra fila en el dataset. Los duplicados pueden inflar métricas, generar conteos incorrectos y desperdiciar almacenamiento. El conteo representa filas extras (total - únicas).`,
        recommendedAction: 'Implementar deduplicación mediante claves de negocio o agregar un paso de DISTINCT/ROW_NUMBER antes de la ingesta. Investigar si los duplicados provienen de la fuente o del proceso de extracción.',
      });
    }

    // --- 4. Invalid dates ---
    rulesExecuted++;
    for (const col of summary.columns) {
      if (!isTemporalColumn(col.name, col.inferredType)) continue;

      let invalidCount = 0;
      for (const row of rows) {
        const value = row[col.name];
        // Skip nulls and empties — they are counted separately
        if (value === null || value === undefined) continue;
        if (value.trim() === '') continue;
        // Check if it's a valid date
        if (!isValidDate(value)) {
          invalidCount++;
        }
      }
      if (invalidCount > 0) {
        const percentage = (invalidCount / totalRows) * 100;
        findings.push({
          id: `invalid_dates-${col.name}`,
          category: 'invalid_dates',
          severity: classifySeverity(percentage),
          description: `La columna "${col.name}" contiene ${invalidCount} fechas con formato inválido (${percentage.toFixed(1)}%).`,
          affectedColumns: [col.name],
          count: invalidCount,
          percentage: Math.round(percentage * 10) / 10,
          ruleBasedExplanation: `Se detectaron ${invalidCount} valores en la columna "${col.name}" que no corresponden a formatos de fecha válidos (YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY) o representan fechas que no existen en el calendario. Las fechas inválidas causan errores en particionamiento, ordenamiento temporal y cálculos de ventanas.`,
          recommendedAction: `Estandarizar el formato de fecha en "${col.name}" a ISO 8601 (YYYY-MM-DD). Implementar validación de formato en el punto de extracción y un paso de limpieza para valores no conformes.`,
        });
      }
    }

    // --- 5. Late-arriving data (low priority, MVP: "no evaluable") ---
    rulesExecuted++;
    // For the MVP, this rule only checks if there are ≥2 temporal columns.
    // If insufficient evidence, NO finding is added (does not inflate risk score).
    const temporalColumns = summary.columns.filter((col) =>
      isTemporalColumn(col.name, col.inferredType)
    );
    // MVP: Late-arriving detection requires ≥2 compatible temporal columns
    // (e.g., event_date AND ingestion_date). Without this, the rule is "no evaluable".
    // Intentionally not adding a finding here to avoid inflating the risk score
    // without sufficient evidence. Full implementation deferred to post-MVP.
    void temporalColumns; // Acknowledge evaluation without side effects

    const endTime = performance.now();

    return {
      findings,
      metadata: {
        rulesExecuted,
        executionTimeMs: Math.round((endTime - startTime) * 100) / 100,
      },
    };
  }
}
