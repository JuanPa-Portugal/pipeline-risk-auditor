import type { ColumnCandidate, CandidateType } from '../types/candidates';

export interface CandidateConfirmationProps {
  candidates: ColumnCandidate[];
  onConfirm: (columnName: string) => void;
  onReject: (columnName: string) => void;
  disabled?: boolean;
}

// --- Exhaustive helpers ---

function assertNever(value: never): never {
  throw new Error(`Valor no soportado: ${String(value)}`);
}

function translateCandidateType(type: CandidateType): string {
  switch (type) {
    case 'primary_key': return 'Clave primaria';
    case 'business_key': return 'Clave de negocio';
    case 'incremental_marker': return 'Marcador incremental';
    default: return assertNever(type);
  }
}

interface ConfidenceStyle {
  label: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
}

function getConfidenceStyle(confidence: ColumnCandidate['confidence']): ConfidenceStyle {
  switch (confidence) {
    case 'alta':
      return { label: 'Alta', textClass: 'text-green-700', bgClass: 'bg-green-100', borderClass: 'border-green-300' };
    case 'media':
      return { label: 'Media', textClass: 'text-amber-700', bgClass: 'bg-amber-100', borderClass: 'border-amber-300' };
    case 'baja':
      return { label: 'Baja', textClass: 'text-orange-700', bgClass: 'bg-orange-100', borderClass: 'border-orange-300' };
    default:
      return assertNever(confidence);
  }
}

/**
 * CandidateConfirmation — Presentational component that displays candidate columns
 * identified by heuristics, allowing the user to confirm or reject each one.
 */
export function CandidateConfirmation({
  candidates,
  onConfirm,
  onReject,
  disabled = false,
}: CandidateConfirmationProps) {
  if (candidates.length === 0) {
    return (
      <section className="w-full">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Columnas candidatas</h2>
        <p className="text-sm text-gray-500 italic">
          No se identificaron columnas candidatas con evidencia suficiente.
        </p>
      </section>
    );
  }

  return (
    <section className="w-full">
      <h2 className="text-lg font-semibold text-gray-800 mb-1">Columnas candidatas</h2>
      <p className="text-sm text-gray-600 mb-4">
        {candidates.length} {candidates.length === 1 ? 'candidata identificada' : 'candidatas identificadas'}
      </p>

      <ul className="space-y-3">
        {candidates.map((candidate) => {
          const confStyle = getConfidenceStyle(candidate.confidence);

          return (
            <li
              key={candidate.columnName}
              className="rounded-lg border border-gray-200 bg-white p-4"
            >
              {/* Header: column name + type + confidence + confirmed status */}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span
                  className="font-mono text-sm font-semibold text-gray-900 max-w-[250px] truncate"
                  title={candidate.columnName}
                >
                  {candidate.columnName}
                </span>
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">
                  {translateCandidateType(candidate.candidateType)}
                </span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded border ${confStyle.bgClass} ${confStyle.textClass} ${confStyle.borderClass}`}>
                  Confianza: {confStyle.label}
                </span>
                {candidate.confirmedByUser && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">
                    Confirmada
                  </span>
                )}
              </div>

              {/* Reasoning */}
              <p className="text-sm text-gray-700 mb-3">{candidate.reasoning}</p>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onConfirm(candidate.columnName)}
                  disabled={disabled || candidate.confirmedByUser}
                  className={`
                    text-sm font-medium px-3 py-1.5 rounded-md border transition-colors
                    focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400
                    ${disabled || candidate.confirmedByUser
                      ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                      : 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100'
                    }
                  `}
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => onReject(candidate.columnName)}
                  disabled={disabled}
                  aria-disabled={disabled}
                  className={`
                    text-sm font-medium px-3 py-1.5 rounded-md border transition-colors
                    focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-red-400
                    ${disabled
                      ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                      : 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100'
                    }
                  `}
                >
                  Rechazar
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
