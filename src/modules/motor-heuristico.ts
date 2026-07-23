import type { CSVSummary, ColumnProfile } from '../types/csv';
import type { ColumnCandidate, HeuristicResult } from '../types/candidates';

// --- Pattern definitions ---

const PRIMARY_KEY_PATTERNS = [
  /^id$/i,
  /^.+_id$/i,
  /^id_.+$/i,
  /^uuid$/i,
  /^guid$/i,
  /^pk$/i,
  /^key$/i,
];

const BUSINESS_KEY_PATTERNS = [
  /code/i,
  /codigo/i,
  /código/i,
  /cod/i,
  /number/i,
  /numero/i,
  /número/i,
  /nro/i,
  /reference/i,
  /referencia/i,
  /ref/i,
];

const INCREMENTAL_STRONG_PATTERNS = [
  'updated_at',
  'modified_at',
  'last_modified',
  'last_update',
  'update_date',
  'modification_date',
  'fecha_modificacion',
  'fecha_actualizacion',
  'timestamp',
];

const INCREMENTAL_SECONDARY_PATTERNS = [
  'created_at',
  'creation_date',
  'fecha_creacion',
  'event_date',
  'ingestion_date',
  'load_date',
];

// --- Helper functions ---

/**
 * Calculates uniqueness percentage from non-null, non-empty values.
 * Returns 0 if there are no usable values (avoids division by zero).
 */
function getUniquenessPercent(col: ColumnProfile, rowCount: number): number {
  const usableValues = rowCount - col.nullCount - col.emptyCount;
  if (usableValues <= 0) return 0;
  return (col.uniqueCount / usableValues) * 100;
}

/**
 * Calculates missing percentage (nulls + empties) relative to total rows.
 * Returns 0 if rowCount is 0.
 */
function getMissingPercent(col: ColumnProfile, rowCount: number): number {
  if (rowCount <= 0) return 0;
  return ((col.nullCount + col.emptyCount) / rowCount) * 100;
}

/**
 * Checks if a column name matches any pattern in a regex array.
 */
function matchesPatterns(name: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(name));
}

/**
 * Checks if a column name matches any of the incremental strong patterns (exact or contained).
 */
function matchesIncrementalStrong(name: string): boolean {
  const lower = name.toLowerCase();
  return INCREMENTAL_STRONG_PATTERNS.some((p) => lower === p || lower.includes(p));
}

/**
 * Checks if a column name matches any of the incremental secondary patterns (exact or contained).
 */
function matchesIncrementalSecondary(name: string): boolean {
  const lower = name.toLowerCase();
  return INCREMENTAL_SECONDARY_PATTERNS.some((p) => lower === p || lower.includes(p));
}

/** Confidence order for sorting (higher priority first) */
const CONFIDENCE_ORDER: Record<ColumnCandidate['confidence'], number> = {
  alta: 0,
  media: 1,
  baja: 2,
};

/**
 * Motor_Heuristico — Aplica heurísticas para identificar columnas candidatas
 * a clave primaria, clave de negocio o marcador de carga incremental.
 */
export class MotorHeuristico {
  /**
   * Evaluates columns in the CSV summary and suggests candidates.
   * Uses only information available in CSVSummary/ColumnProfile (no raw rows needed).
   */
  evaluate(summary: CSVSummary): HeuristicResult {
    const { rowCount, columns } = summary;
    const assignedColumns = new Set<string>();
    const candidates: ColumnCandidate[] = [];

    // --- Pass 1: Incremental markers (highest priority) ---
    for (const col of columns) {
      const uniqueness = getUniquenessPercent(col, rowCount);
      const missing = getMissingPercent(col, rowCount);
      const isStrong = matchesIncrementalStrong(col.name);
      const isSecondary = matchesIncrementalSecondary(col.name);

      if (!isStrong && !isSecondary) continue;

      // Must be date type or have a clear temporal name pattern
      const isTemporalType = col.inferredType === 'date';
      if (!isTemporalType && !isStrong && !isSecondary) continue;

      // Missing must be <= 20%
      if (missing > 20) continue;

      let confidence: ColumnCandidate['confidence'];
      if (isStrong) {
        confidence = missing === 0 ? 'alta' : 'media';
      } else {
        // Secondary
        confidence = missing === 0 ? 'media' : 'baja';
      }

      candidates.push({
        columnName: col.name,
        candidateType: 'incremental_marker',
        confidence,
        reasoning: `La columna "${col.name}" coincide con un patrón de marcador incremental${isStrong ? ' fuerte' : ' secundario'}. Tipo inferido: ${col.inferredType}. Unicidad: ${uniqueness.toFixed(1)}%. Valores faltantes: ${missing.toFixed(1)}%.`,
        confirmedByUser: false,
      });
      assignedColumns.add(col.name);
    }

    // --- Pass 2: Primary keys ---
    for (const col of columns) {
      if (assignedColumns.has(col.name)) continue;

      if (!matchesPatterns(col.name, PRIMARY_KEY_PATTERNS)) continue;

      // Must be string or number
      if (col.inferredType !== 'string' && col.inferredType !== 'number') continue;

      // Must have no nulls and no empties
      if (col.nullCount > 0 || col.emptyCount > 0) continue;

      const uniqueness = getUniquenessPercent(col, rowCount);
      const missing = getMissingPercent(col, rowCount);

      // Must have uniqueness >= 98%
      if (uniqueness < 98) continue;

      const confidence: ColumnCandidate['confidence'] = uniqueness === 100 ? 'alta' : 'media';

      candidates.push({
        columnName: col.name,
        candidateType: 'primary_key',
        confidence,
        reasoning: `La columna "${col.name}" coincide con un patrón de clave primaria. Tipo: ${col.inferredType}. Unicidad: ${uniqueness.toFixed(1)}%. Valores faltantes: ${missing.toFixed(1)}%.`,
        confirmedByUser: false,
      });
      assignedColumns.add(col.name);
    }

    // --- Pass 3: Business keys ---
    for (const col of columns) {
      if (assignedColumns.has(col.name)) continue;

      if (!matchesPatterns(col.name, BUSINESS_KEY_PATTERNS)) continue;

      // Must be string or number
      if (col.inferredType !== 'string' && col.inferredType !== 'number') continue;

      const uniqueness = getUniquenessPercent(col, rowCount);
      const missing = getMissingPercent(col, rowCount);

      // Uniqueness must be >= 90%
      if (uniqueness < 90) continue;

      // Missing must be <= 5%
      if (missing > 5) continue;

      let confidence: ColumnCandidate['confidence'];
      if (uniqueness === 100 && missing === 0) {
        confidence = 'alta';
      } else if (uniqueness >= 98) {
        confidence = 'media';
      } else {
        confidence = 'baja';
      }

      candidates.push({
        columnName: col.name,
        candidateType: 'business_key',
        confidence,
        reasoning: `La columna "${col.name}" coincide con un patrón de clave de negocio. Tipo: ${col.inferredType}. Unicidad: ${uniqueness.toFixed(1)}%. Valores faltantes: ${missing.toFixed(1)}%.`,
        confirmedByUser: false,
      });
      assignedColumns.add(col.name);
    }

    // --- Sort: confidence (alta > media > baja), then alphabetically by columnName ---
    candidates.sort((a, b) => {
      const confDiff = CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence];
      if (confDiff !== 0) return confDiff;
      return a.columnName.localeCompare(b.columnName);
    });

    // --- Build result ---
    if (candidates.length === 0) {
      return {
        candidates: [],
        insufficientEvidence: true,
        message: 'No se encontraron columnas candidatas con suficiente confianza. Los nombres de columnas, tipos de datos, niveles de unicidad y porcentajes de nulidad no coinciden con los patrones esperados para claves primarias, claves de negocio o marcadores de carga incremental.',
      };
    }

    return {
      candidates,
      insufficientEvidence: false,
    };
  }
}
