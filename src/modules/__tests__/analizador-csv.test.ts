import { describe, it, expect } from 'vitest';
import { AnalizadorCSV } from '../analizador-csv';
import { MAX_FILE_SIZE, MAX_SAMPLE_ROWS } from '../../constants';

function createFile(content: string, name: string, type = 'text/csv'): File {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(content);
  const blob = new Blob([encoded], { type });
  const file = new File([blob], name, { type });
  // jsdom File doesn't implement arrayBuffer — polyfill it
  if (!file.arrayBuffer) {
    file.arrayBuffer = () =>
      new Promise<ArrayBuffer>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.readAsArrayBuffer(blob);
      });
  }
  return file;
}

function createLargeFile(sizeBytes: number, name: string): File {
  const content = new Uint8Array(sizeBytes);
  const blob = new Blob([content], { type: 'text/csv' });
  const file = new File([blob], name, { type: 'text/csv' });
  if (!file.arrayBuffer) {
    file.arrayBuffer = () =>
      new Promise<ArrayBuffer>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.readAsArrayBuffer(blob);
      });
  }
  return file;
}

describe('AnalizadorCSV', () => {
  const analizador = new AnalizadorCSV();

  describe('validateFile', () => {
    it('acepta un archivo .csv válido', () => {
      const file = createFile('id,name\n1,Alice', 'data.csv');
      const result = analizador.validateFile(file);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('rechaza un archivo con extensión no .csv', () => {
      const file = createFile('data', 'data.txt');
      const result = analizador.validateFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('rechaza un archivo vacío', () => {
      const file = createFile('', 'empty.csv');
      const result = analizador.validateFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('vacío');
    });

    it('rechaza un archivo que excede MAX_FILE_SIZE', () => {
      const file = createLargeFile(MAX_FILE_SIZE + 1, 'huge.csv');
      const result = analizador.validateFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('tamaño máximo');
    });
  });

  describe('parse', () => {
    it('genera CSVSummary con perfilado exacto incluyendo nullCount y emptyCount', async () => {
      // id,status
      // 1,active       → id="1" (string), status="active" (string)
      // 2              → id="2" (string), status=undefined (null/missing → PapaParse error, undefined for field)
      // 3,             → id="3" (string), status="" (empty)
      // 4,inactive     → id="4" (string), status="inactive" (string)
      const csv = 'id,status\n1,active\n2\n3,\n4,inactive';
      const file = createFile(csv, 'profile.csv');
      const summary = await analizador.parse(file);

      // Row "2" has fewer fields → PapaParse reports an error but still produces a row
      // with status=undefined. The row filter keeps it because id="2" is non-empty.
      // All 4 rows pass the filter (each has at least one non-empty value in headers).
      expect(summary.rowCount).toBe(4);
      expect(summary.columnCount).toBe(2);
      expect(summary.columns.map((c) => c.name)).toEqual(['id', 'status']);

      // Column "id": all 4 rows have a non-empty string value
      const idCol = summary.columns.find((c) => c.name === 'id')!;
      expect(idCol.nullCount).toBe(0);
      expect(idCol.emptyCount).toBe(0);
      expect(idCol.uniqueCount).toBe(4);
      expect(idCol.sampleValues).toEqual(['1', '2', '3', '4']);
      expect(idCol.inferredType).toBe('number');

      // Column "status":
      // Row 1: "active" → valid string
      // Row 2: undefined (missing field) → nullCount
      // Row 3: "" → emptyCount
      // Row 4: "inactive" → valid string
      const statusCol = summary.columns.find((c) => c.name === 'status')!;
      expect(statusCol.nullCount).toBe(1);
      expect(statusCol.emptyCount).toBe(1);
      expect(statusCol.uniqueCount).toBe(2);
      expect(statusCol.sampleValues).toEqual(['active', 'inactive']);
      expect(statusCol.inferredType).toBe('string');

      // PapaParse should report at least one error for the row with fewer fields
      expect(summary.parseErrors.length).toBeGreaterThanOrEqual(1);
    });

    it('infiere tipos correctamente', async () => {
      const csv = 'num,date,flag,text\n42,2024-01-15,true,hello\n7,2024-02-20,false,world';
      const file = createFile(csv, 'types.csv');
      const summary = await analizador.parse(file);

      expect(summary.rowCount).toBe(2);
      expect(summary.columnCount).toBe(4);

      const numCol = summary.columns.find((c) => c.name === 'num')!;
      expect(numCol.inferredType).toBe('number');

      const dateCol = summary.columns.find((c) => c.name === 'date')!;
      expect(dateCol.inferredType).toBe('date');

      const flagCol = summary.columns.find((c) => c.name === 'flag')!;
      expect(flagCol.inferredType).toBe('boolean');

      const textCol = summary.columns.find((c) => c.name === 'text')!;
      expect(textCol.inferredType).toBe('string');
    });

    it('conserva como máximo MAX_SAMPLE_ROWS valores de muestra sin duplicados', async () => {
      const rows = Array.from({ length: 20 }, (_, i) => `${i},value_${i}`);
      const csv = `id,data\n${rows.join('\n')}`;
      const file = createFile(csv, 'many.csv');
      const summary = await analizador.parse(file);

      const dataCol = summary.columns.find((c) => c.name === 'data')!;
      expect(dataCol.sampleValues.length).toBe(MAX_SAMPLE_ROWS);
      // No duplicates
      const unique = new Set(dataCol.sampleValues);
      expect(unique.size).toBe(dataCol.sampleValues.length);
    });

    it('maneja CSV con errores parciales sin bloquear el análisis', async () => {
      // Row with extra field triggers a PapaParse error
      const csv = 'id,name\n1,Alice\n2,Bob,extra_field\n3,Carol';
      const file = createFile(csv, 'partial-errors.csv');
      const summary = await analizador.parse(file);

      // Analysis completes
      expect(summary.rowCount).toBe(3);
      expect(summary.columnCount).toBe(2);
      expect(summary.columns.map((c) => c.name)).toEqual(['id', 'name']);
      // parseErrors contains at least one error
      expect(summary.parseErrors.length).toBeGreaterThanOrEqual(1);
    });

    it('rechaza un archivo sin datos (solo encabezados)', async () => {
      const csv = 'id,name,age\n';
      const file = createFile(csv, 'headers-only.csv');
      await expect(analizador.parse(file)).rejects.toThrow();
    });

    it('rechaza un archivo con extensión incorrecta vía parse', async () => {
      const file = createFile('id,name\n1,Alice', 'data.xlsx');
      await expect(analizador.parse(file)).rejects.toThrow('Formato no soportado');
    });
  });
});
