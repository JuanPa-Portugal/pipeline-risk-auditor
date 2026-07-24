import Papa from 'papaparse';
import type { ColumnProfile, CSVSummary } from '../types/csv';
import { MAX_FILE_SIZE, MAX_SAMPLE_ROWS, ALLOWED_EXTENSIONS } from '../constants';

export type ParsedRow = Record<string, string | undefined>;

export interface CSVParseResult {
  summary: CSVSummary;
  rows: ParsedRow[];
}

/**
 * Infers the data type of a non-empty value string.
 */
function inferType(value: string): ColumnProfile['inferredType'] {
  // Boolean check
  const lower = value.toLowerCase();
  if (lower === 'true' || lower === 'false') return 'boolean';

  // Number check
  if (/^-?\d+(\.\d+)?$/.test(value)) return 'number';

  // Date check — common formats
  if (
    /^\d{4}-\d{2}-\d{2}/.test(value) ||
    /^\d{2}\/\d{2}\/\d{4}/.test(value) ||
    /^\d{2}-\d{2}-\d{4}/.test(value)
  ) {
    const parsed = Date.parse(value);
    if (!isNaN(parsed)) return 'date';
  }

  return 'string';
}

/**
 * Conservative type resolution:
 * - No usable values → 'string'
 * - All usable values share one type → that type
 * - Two or more different types → 'mixed'
 */
function resolveType(types: Set<ColumnProfile['inferredType']>): ColumnProfile['inferredType'] {
  if (types.size === 0) return 'string';
  if (types.size === 1) return [...types][0] as ColumnProfile['inferredType'];
  return 'mixed';
}

/**
 * Profiles a single column across all rows.
 */
function profileColumn(name: string, rows: ParsedRow[]): ColumnProfile {
  let nullCount = 0;
  let emptyCount = 0;
  const uniqueValues = new Set<string>();
  const sampleValues: string[] = [];
  const detectedTypes = new Set<ColumnProfile['inferredType']>();

  for (const row of rows) {
    const value = row[name];

    // null/undefined → nullCount
    if (value === undefined || value === null) {
      nullCount++;
      continue;
    }

    // Empty or whitespace-only → emptyCount
    if (value.trim() === '') {
      emptyCount++;
      continue;
    }

    // Valid value
    uniqueValues.add(value);
    detectedTypes.add(inferType(value));

    if (
      sampleValues.length < MAX_SAMPLE_ROWS &&
      !sampleValues.includes(value)
    ) {
      sampleValues.push(value);
    }
  }

  return {
    name,
    inferredType: resolveType(detectedTypes),
    nullCount,
    emptyCount,
    uniqueCount: uniqueValues.size,
    sampleValues,
  };
}

/**
 * Strips non-header properties (like __parsed_extra) from a row,
 * keeping only the declared header columns.
 */
function stripToHeaders(row: ParsedRow, headers: string[]): ParsedRow {
  const clean: ParsedRow = {};
  for (const name of headers) {
    clean[name] = row[name];
  }
  return clean;
}

/**
 * Analizador_CSV — Módulo responsable de cargar, validar y parsear archivos CSV.
 */
export class AnalizadorCSV {
  /**
   * Validates a file before parsing.
   * Checks extension, size, and that the file is not empty.
   */
  validateFile(file: File): { valid: boolean; error?: string } {
    const fileName = file.name.toLowerCase();
    const hasValidExtension = ALLOWED_EXTENSIONS.some((ext) => fileName.endsWith(ext));

    if (!hasValidExtension) {
      return {
        valid: false,
        error: `Formato no soportado. Solo se permiten archivos: ${ALLOWED_EXTENSIONS.join(', ')}`,
      };
    }

    if (file.size === 0) {
      return { valid: false, error: 'El archivo está vacío.' };
    }

    if (file.size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `El archivo excede el tamaño máximo permitido (${MAX_FILE_SIZE / (1024 * 1024)} MB).`,
      };
    }

    return { valid: true };
  }

  /**
   * Parses a CSV file and returns both CSVSummary and the filtered rows.
   * This is the central parsing method — all logic lives here.
   * Reads the file as ArrayBuffer and decodes as UTF-8 (fatal mode).
   * Each row contains ONLY the declared header columns (no __parsed_extra).
   */
  async parseWithRows(file: File): Promise<CSVParseResult> {
    const validation = this.validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Read file and decode as UTF-8 with fatal: true
    const buffer = await file.arrayBuffer();
    let text: string;
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      text = decoder.decode(buffer);
    } catch {
      throw new Error(
        'El archivo no tiene codificación UTF-8 válida. Solo se soportan archivos en formato UTF-8.'
      );
    }

    // Parse the decoded text with PapaParse (single call)
    const parseResult = Papa.parse<ParsedRow>(text, {
      header: true,
      skipEmptyLines: false,
    });

    const headers = parseResult.meta.fields ?? [];

    if (headers.length === 0) {
      throw new Error('El archivo CSV no contiene encabezados válidos.');
    }

    // Collect parse errors
    const parseErrors: string[] = parseResult.errors.map(
      (err) => `Fila ${err.row ?? '?'}: ${err.message}`
    );

    // Filter rows: keep only rows that have at least one non-empty value
    // in declared header columns. Do NOT use Object.values or process __parsed_extra.
    const filteredRows: ParsedRow[] = parseResult.data.filter((row) =>
      headers.some((name) => {
        const value = row[name];
        return typeof value === 'string' && value.trim() !== '';
      })
    );

    if (filteredRows.length === 0) {
      throw new Error('El archivo CSV no contiene datos (solo encabezados o filas vacías).');
    }

    // Strip rows to only declared headers (remove __parsed_extra and any extra properties)
    const rows: ParsedRow[] = filteredRows.map((row) => stripToHeaders(row, headers));

    // Profile each column
    const columns: ColumnProfile[] = headers.map((name) => profileColumn(name, rows));

    const summary: CSVSummary = {
      rowCount: rows.length,
      columnCount: headers.length,
      columns,
      parseErrors,
    };

    return { summary, rows };
  }

  /**
   * Parses a CSV file and returns only the CSVSummary.
   * Delegates to parseWithRows internally — no duplicated logic.
   */
  async parse(file: File): Promise<CSVSummary> {
    const result = await this.parseWithRows(file);
    return result.summary;
  }
}
