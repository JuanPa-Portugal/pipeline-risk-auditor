import { describe, it, expect } from 'vitest';
import { AnalizadorCSV } from '../analizador-csv';
import { MAX_FILE_SIZE, MAX_SAMPLE_ROWS } from '../../constants';

function createFile(content: string, name: string, type = 'text/csv'): File {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(content);
  const blob = new Blob([encoded], { type });
  const file = new File([blob], name, { type });
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
      const csv = 'id,status\n1,active\n2\n3,\n4,inactive';
      const file = createFile(csv, 'profile.csv');
      const summary = await analizador.parse(file);

      expect(summary.rowCount).toBe(4);
      expect(summary.columnCount).toBe(2);
      expect(summary.columns.map((c) => c.name)).toEqual(['id', 'status']);

      const idCol = summary.columns.find((c) => c.name === 'id')!;
      expect(idCol.nullCount).toBe(0);
      expect(idCol.emptyCount).toBe(0);
      expect(idCol.uniqueCount).toBe(4);
      expect(idCol.sampleValues).toEqual(['1', '2', '3', '4']);
      expect(idCol.inferredType).toBe('number');

      const statusCol = summary.columns.find((c) => c.name === 'status')!;
      expect(statusCol.nullCount).toBe(1);
      expect(statusCol.emptyCount).toBe(1);
      expect(statusCol.uniqueCount).toBe(2);
      expect(statusCol.sampleValues).toEqual(['active', 'inactive']);
      expect(statusCol.inferredType).toBe('string');

      expect(summary.parseErrors.length).toBeGreaterThanOrEqual(1);
    });

    it('infiere tipos correctamente', async () => {
      const csv = 'num,date,flag,text\n42,2024-01-15,true,hello\n7,2024-02-20,false,world';
      const file = createFile(csv, 'types.csv');
      const summary = await analizador.parse(file);

      expect(summary.rowCount).toBe(2);
      expect(summary.columnCount).toBe(4);

      expect(summary.columns.find((c) => c.name === 'num')!.inferredType).toBe('number');
      expect(summary.columns.find((c) => c.name === 'date')!.inferredType).toBe('date');
      expect(summary.columns.find((c) => c.name === 'flag')!.inferredType).toBe('boolean');
      expect(summary.columns.find((c) => c.name === 'text')!.inferredType).toBe('string');
    });

    it('conserva como máximo MAX_SAMPLE_ROWS valores de muestra sin duplicados', async () => {
      const rows = Array.from({ length: 20 }, (_, i) => `${i},value_${i}`);
      const csv = `id,data\n${rows.join('\n')}`;
      const file = createFile(csv, 'many.csv');
      const summary = await analizador.parse(file);

      const dataCol = summary.columns.find((c) => c.name === 'data')!;
      expect(dataCol.sampleValues.length).toBe(MAX_SAMPLE_ROWS);
      const unique = new Set(dataCol.sampleValues);
      expect(unique.size).toBe(dataCol.sampleValues.length);
    });

    it('maneja CSV con errores parciales sin bloquear el análisis', async () => {
      const csv = 'id,name\n1,Alice\n2,Bob,extra_field\n3,Carol';
      const file = createFile(csv, 'partial-errors.csv');
      const summary = await analizador.parse(file);

      expect(summary.rowCount).toBe(3);
      expect(summary.columnCount).toBe(2);
      expect(summary.columns.map((c) => c.name)).toEqual(['id', 'name']);
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

  describe('parseWithRows', () => {
    it('devuelve summary y rows', async () => {
      const csv = 'id,name\n1,Alice\n2,Bob';
      const file = createFile(csv, 'basic.csv');
      const result = await analizador.parseWithRows(file);

      expect(result.summary).toBeDefined();
      expect(result.rows).toBeDefined();
      expect(Array.isArray(result.rows)).toBe(true);
    });

    it('summary.rowCount coincide con rows.length', async () => {
      const csv = 'id,name\n1,Alice\n2,Bob\n3,Carol';
      const file = createFile(csv, 'count.csv');
      const result = await analizador.parseWithRows(file);

      expect(result.summary.rowCount).toBe(result.rows.length);
      expect(result.rows.length).toBe(3);
    });

    it('las filas conservan los valores esperados', async () => {
      const csv = 'id,status\n1,active\n2\n3,\n4,inactive';
      const file = createFile(csv, 'values.csv');
      const result = await analizador.parseWithRows(file);

      // Row 0: id="1", status="active"
      expect(result.rows[0]!['id']).toBe('1');
      expect(result.rows[0]!['status']).toBe('active');

      // Row 1: id="2", status=undefined (fewer fields)
      expect(result.rows[1]!['id']).toBe('2');
      expect(result.rows[1]!['status']).toBeUndefined();

      // Row 2: id="3", status="" (empty)
      expect(result.rows[2]!['id']).toBe('3');
      expect(result.rows[2]!['status']).toBe('');

      // Row 3: id="4", status="inactive"
      expect(result.rows[3]!['id']).toBe('4');
      expect(result.rows[3]!['status']).toBe('inactive');
    });

    it('las filas no contienen propiedades fuera de los encabezados declarados', async () => {
      // CSV with extra field that PapaParse stores in __parsed_extra
      const csv = 'id,name\n1,Alice,extra_value\n2,Bob';
      const file = createFile(csv, 'extra.csv');
      const result = await analizador.parseWithRows(file);

      for (const row of result.rows) {
        const keys = Object.keys(row);
        expect(keys).toEqual(['id', 'name']);
        expect(row).not.toHaveProperty('__parsed_extra');
      }
    });

    it('los errores parciales siguen presentes en summary.parseErrors', async () => {
      const csv = 'id,name\n1,Alice\n2,Bob,extra\n3,Carol';
      const file = createFile(csv, 'errors.csv');
      const result = await analizador.parseWithRows(file);

      expect(result.summary.parseErrors.length).toBeGreaterThanOrEqual(1);
      expect(result.summary.rowCount).toBe(result.rows.length);
    });

    it('parse() continúa funcionando y devuelve solo CSVSummary', async () => {
      const csv = 'id,name\n1,Alice\n2,Bob';
      const file = createFile(csv, 'compat.csv');
      const summary = await analizador.parse(file);

      // parse returns CSVSummary (no rows property)
      expect(summary.rowCount).toBe(2);
      expect(summary.columnCount).toBe(2);
      expect(summary).not.toHaveProperty('rows');
    });
  });
});
