import type { RiskScore } from '../types/risk';
import type { Severity } from '../types/findings';

export interface RiskScoreDisplayProps {
  riskScore: RiskScore;
}

interface RiskLevel {
  label: string;
  textClass: string;
  bgClass: string;
  barClass: string;
}

/**
 * Classifies the total score into a risk level with associated styles.
 * 0–29: bajo, 30–59: medio, 60–100: alto
 */
function getRiskLevel(total: number): RiskLevel {
  if (total >= 60) {
    return {
      label: 'Riesgo alto',
      textClass: 'text-red-700',
      bgClass: 'bg-red-50 border-red-200',
      barClass: 'bg-red-500',
    };
  }
  if (total >= 30) {
    return {
      label: 'Riesgo medio',
      textClass: 'text-amber-700',
      bgClass: 'bg-amber-50 border-amber-200',
      barClass: 'bg-amber-500',
    };
  }
  return {
    label: 'Riesgo bajo',
    textClass: 'text-green-700',
    bgClass: 'bg-green-50 border-green-200',
    barClass: 'bg-green-500',
  };
}

/**
 * Exhaustive severity translation helper.
 */
function assertNever(value: never): never {
  throw new Error(`Severidad no soportada: ${String(value)}`);
}

function translateSeverity(severity: Severity): string {
  switch (severity) {
    case 'alto': return 'Alto';
    case 'medio': return 'Medio';
    case 'bajo': return 'Bajo';
    default: return assertNever(severity);
  }
}

/**
 * RiskScoreDisplay — Shows the aggregate risk score with a visual progress bar,
 * classification label, raw score note (when capped), and a detailed breakdown.
 */
export function RiskScoreDisplay({ riskScore }: RiskScoreDisplayProps) {
  const { total, rawTotal, breakdown } = riskScore;

  // Normalize once — used for display, classification, bar width, and aria
  const normalizedTotal = Math.min(100, Math.max(0, total));
  const level = getRiskLevel(normalizedTotal);

  return (
    <div className={`w-full rounded-lg border p-5 ${level.bgClass}`}>
      {/* Header: score + classification */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Puntaje de Riesgo</h2>
        <div className="flex items-baseline gap-3 mb-2">
          <span className={`text-4xl font-bold ${level.textClass}`}>{normalizedTotal}</span>
          <span className="text-lg text-gray-600">/ 100</span>
          <span className={`text-sm font-medium px-2 py-0.5 rounded ${level.textClass} ${level.bgClass} border`}>
            {level.label}
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={normalizedTotal}
            aria-label={`Puntaje de riesgo: ${normalizedTotal} de 100 — ${level.label}`}
            className={`h-full rounded-full transition-all duration-300 ${level.barClass}`}
            style={{ width: `${normalizedTotal}%` }}
          />
        </div>

        {/* Raw total note when capped */}
        {rawTotal > 100 && (
          <p className="text-sm text-gray-600 mt-2">
            El puntaje bruto fue {rawTotal} y se limitó a 100.
          </p>
        )}
      </section>

      {/* Breakdown */}
      <section className="mt-5">
        <h3 className="text-base font-semibold text-gray-800 mb-2">Desglose por hallazgo</h3>
        {breakdown.length > 0 ? (
          <ul className="space-y-1.5">
            {breakdown.map((item, index) => (
              <li
                key={`${item.findingId}-${index}`}
                className="flex items-center justify-between bg-white rounded-md px-3 py-2 border border-gray-100 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-gray-700 truncate" title={item.findingId}>
                    {item.findingId}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    item.severity === 'alto' ? 'bg-red-100 text-red-700' :
                    item.severity === 'medio' ? 'bg-amber-100 text-amber-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {translateSeverity(item.severity)}
                  </span>
                </div>
                <span className="font-medium text-gray-900 ml-2 whitespace-nowrap">
                  +{item.contribution} puntos
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500 italic">
            No se detectaron hallazgos que sumen riesgo.
          </p>
        )}
      </section>
    </div>
  );
}
