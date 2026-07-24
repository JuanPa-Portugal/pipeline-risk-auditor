import type { Finding, Severity } from '../types/findings';

export interface ReportViewProps {
  findings: Finding[];
}

// --- Exhaustive helpers ---

function assertNever(value: never): never {
  throw new Error(`Valor no soportado: ${String(value)}`);
}

interface SeverityStyle {
  label: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
}

function getSeverityStyle(severity: Severity): SeverityStyle {
  switch (severity) {
    case 'alto':
      return { label: 'Alto', textClass: 'text-red-700', bgClass: 'bg-red-100', borderClass: 'border-red-300' };
    case 'medio':
      return { label: 'Medio', textClass: 'text-amber-700', bgClass: 'bg-amber-100', borderClass: 'border-amber-300' };
    case 'bajo':
      return { label: 'Bajo', textClass: 'text-green-700', bgClass: 'bg-green-100', borderClass: 'border-green-300' };
    default:
      return assertNever(severity);
  }
}

type FindingCategory = Finding['category'];

function translateCategory(category: FindingCategory): string {
  switch (category) {
    case 'nulls': return 'Valores nulos';
    case 'empties': return 'Valores vacíos';
    case 'duplicates': return 'Filas duplicadas';
    case 'invalid_dates': return 'Fechas inválidas';
    case 'late_arriving': return 'Datos tardíos';
    case 'mutations': return 'Actualizaciones/eliminaciones';
    default: return assertNever(category);
  }
}

/**
 * ReportView — Presentational component that displays a list of findings
 * with severity, category, description, count, percentage, affected columns,
 * rule-based explanation, and recommended action.
 */
export function ReportView({ findings }: ReportViewProps) {
  if (findings.length === 0) {
    return (
      <section className="w-full">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Hallazgos detectados</h2>
        <p className="text-sm text-gray-500 italic">
          No se detectaron riesgos en los datos analizados.
        </p>
      </section>
    );
  }

  return (
    <section className="w-full">
      <h2 className="text-lg font-semibold text-gray-800 mb-1">Hallazgos detectados</h2>
      <p className="text-sm text-gray-600 mb-4">
        {findings.length} {findings.length === 1 ? 'hallazgo encontrado' : 'hallazgos encontrados'}
      </p>

      <ul className="space-y-4">
        {findings.map((finding) => {
          const style = getSeverityStyle(finding.severity);

          return (
            <li
              key={finding.id}
              className={`rounded-lg border ${style.borderClass} bg-white p-4`}
            >
              {/* Header: severity + category + count */}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${style.bgClass} ${style.textClass}`}>
                  {style.label}
                </span>
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                  {translateCategory(finding.category)}
                </span>
                <span className="text-xs text-gray-500 ml-auto">
                  {finding.count} {finding.count === 1 ? 'ocurrencia' : 'ocurrencias'}
                  {finding.percentage !== undefined && (
                    <> · {finding.percentage.toFixed(1)}%</>
                  )}
                </span>
              </div>

              {/* Description */}
              <p className="text-sm text-gray-900 font-medium mb-2">{finding.description}</p>

              {/* Affected columns */}
              {finding.affectedColumns && finding.affectedColumns.length > 0 && (
                <div className="mb-2">
                  <span className="text-xs font-medium text-gray-500 mr-1">Columnas afectadas:</span>
                  <span className="inline-flex flex-wrap gap-1">
                    {finding.affectedColumns.map((col) => (
                      <span
                        key={col}
                        className="text-xs font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-800 max-w-[200px] truncate inline-block"
                        title={col}
                      >
                        {col}
                      </span>
                    ))}
                  </span>
                </div>
              )}

              {/* Rule-based explanation */}
              <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-md">
                <h4 className="text-xs font-semibold text-blue-700 mb-1">Explicación basada en reglas</h4>
                <p className="text-sm text-blue-900">{finding.ruleBasedExplanation}</p>
              </div>

              {/* Recommended action */}
              <div className="mt-2 p-3 bg-emerald-50 border border-emerald-100 rounded-md">
                <h4 className="text-xs font-semibold text-emerald-700 mb-1">Acción recomendada</h4>
                <p className="text-sm text-emerald-900">{finding.recommendedAction}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
