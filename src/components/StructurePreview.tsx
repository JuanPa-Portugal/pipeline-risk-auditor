import type { CSVSummary, ColumnProfile } from '../types/csv';
import { MAX_SAMPLE_ROWS } from '../constants';

export interface StructurePreviewProps {
  summary: CSVSummary;
  sampleRows: Record<string, string>[];
}

/**
 * Ensures exhaustive handling at compile time.
 * If a new type is added to ColumnProfile['inferredType'] and not handled
 * in translateType, TypeScript will produce a compile error here.
 */
function assertNever(value: never): never {
  throw new Error(`Tipo de columna no soportado: ${String(value)}`);
}

/**
 * Maps inferredType to a human-readable Spanish label.
 * Exhaustive at compile time via assertNever in the default branch.
 */
function translateType(type: ColumnProfile['inferredType']): string {
  switch (type) {
    case 'string': return 'Texto';
    case 'number': return 'Número';
    case 'boolean': return 'Booleano';
    case 'date': return 'Fecha';
    case 'mixed': return 'Mixto';
    default: return assertNever(type);
  }
}

/**
 * StructurePreview — Presentational component that displays:
 * - General CSV structure (row/column counts)
 * - Column profiles (type, nulls, empties, unique, samples)
 * - A preview table of sample rows
 * - Parse error warnings
 */
export function StructurePreview({ summary, sampleRows }: StructurePreviewProps) {
  const columns = summary.columns;
  const displayedRows = sampleRows.slice(0, MAX_SAMPLE_ROWS);
  const maxParseErrorsShown = 5;

  return (
    <div className="w-full space-y-6">
      {/* General info */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Resumen de Estructura</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm text-gray-500">Filas totales</p>
            <p className="text-xl font-bold text-gray-900">{summary.rowCount}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm text-gray-500">Columnas</p>
            <p className="text-xl font-bold text-gray-900">{summary.columnCount}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm text-gray-500">Filas en vista previa</p>
            <p className="text-xl font-bold text-gray-900">
              {displayedRows.length}
              <span className="text-sm font-normal text-gray-500 ml-1">
                (máx. {MAX_SAMPLE_ROWS})
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* Parse errors warning */}
      {summary.parseErrors.length > 0 && (
        <section>
          <h3 className="text-base font-semibold text-amber-700 mb-2">
            Advertencias de parseo ({summary.parseErrors.length} {summary.parseErrors.length === 1 ? 'error' : 'errores'})
          </h3>
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
            <ul className="list-disc list-inside space-y-1 text-sm text-amber-800">
              {summary.parseErrors.slice(0, maxParseErrorsShown).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
            {summary.parseErrors.length > maxParseErrorsShown && (
              <p className="text-sm text-amber-600 mt-2">
                …y {summary.parseErrors.length - maxParseErrorsShown} {summary.parseErrors.length - maxParseErrorsShown === 1 ? 'error' : 'errores'} más no mostrados.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Column profiles */}
      {columns.length > 0 ? (
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Perfil de Columnas</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border border-gray-200 rounded-lg" aria-label="Perfil de columnas del archivo CSV">
              <thead className="bg-gray-100">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-gray-700">Nombre</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-gray-700">Tipo</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium text-gray-700">Nulos</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium text-gray-700">Vacíos</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium text-gray-700">Únicos</th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-gray-700">Valores de muestra</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {columns.map((col) => (
                  <tr key={col.name}>
                    <td className="px-3 py-2 font-mono text-gray-900" title={col.name}>
                      <span className="block max-w-[200px] truncate">{col.name}</span>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{translateType(col.inferredType)}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{col.nullCount}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{col.emptyCount}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{col.uniqueCount}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {col.sampleValues.length > 0 ? (
                        <span className="block max-w-[300px] truncate" title={col.sampleValues.join(', ')}>
                          {col.sampleValues.slice(0, 3).join(', ')}
                          {col.sampleValues.length > 3 && '…'}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">Sin valores</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section>
          <p className="text-sm text-gray-500 italic">No se detectaron columnas en el archivo.</p>
        </section>
      )}

      {/* Sample rows preview */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Vista Previa de Datos</h2>
        {displayedRows.length > 0 && columns.length > 0 ? (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="min-w-full text-sm" aria-label="Vista previa de las primeras filas del archivo CSV">
              <thead className="bg-gray-100">
                <tr>
                  <th scope="col" className="px-3 py-2 text-right font-medium text-gray-500 w-12">#</th>
                  {columns.map((col) => (
                    <th
                      key={col.name}
                      scope="col"
                      className="px-3 py-2 text-left font-medium text-gray-700"
                      title={col.name}
                    >
                      <span className="block max-w-[150px] truncate">{col.name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {displayedRows.map((row, rowIndex) => (
                  <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2 text-right text-gray-400 font-mono text-xs">{rowIndex + 1}</td>
                    {columns.map((col) => {
                      const value = row[col.name];
                      const isEmpty = value === '';
                      return (
                        <td
                          key={col.name}
                          className={`px-3 py-2 ${isEmpty ? 'text-gray-400 italic' : 'text-gray-900'}`}
                          title={value}
                        >
                          <span className="block max-w-[200px] truncate">
                            {isEmpty ? 'Vacío' : value}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic">
            No hay filas de muestra disponibles para mostrar.
          </p>
        )}
      </section>
    </div>
  );
}
