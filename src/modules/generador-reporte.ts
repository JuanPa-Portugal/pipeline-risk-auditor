import type { CSVSummary, ColumnProfile } from '../types/csv';
import type { Finding, Severity } from '../types/findings';
import type { ColumnCandidate, CandidateType } from '../types/candidates';
import type { RiskScore } from '../types/risk';

export interface GenerateReportInput {
  fileName: string;
  summary: CSVSummary;
  findings: Finding[];
  candidates: ColumnCandidate[];
  riskScore: RiskScore;
}

// --- Exhaustive translation helpers ---

function assertNever(value: never): never {
  throw new Error(`Valor no soportado: ${String(value)}`);
}

function translateSeverity(severity: Severity): string {
  switch (severity) {
    case 'alto': return 'Alto';
    case 'medio': return 'Medio';
    case 'bajo': return 'Bajo';
    default: return assertNever(severity);
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

function translateInferredType(type: ColumnProfile['inferredType']): string {
  switch (type) {
    case 'string': return 'Texto';
    case 'number': return 'Número';
    case 'date': return 'Fecha';
    case 'boolean': return 'Booleano';
    case 'mixed': return 'Mixto';
    default: return assertNever(type);
  }
}

function translateCandidateType(type: CandidateType): string {
  switch (type) {
    case 'primary_key': return 'Clave primaria';
    case 'business_key': return 'Clave de negocio';
    case 'incremental_marker': return 'Marcador incremental';
    default: return assertNever(type);
  }
}

function translateConfidence(confidence: ColumnCandidate['confidence']): string {
  switch (confidence) {
    case 'alta': return 'Alta';
    case 'media': return 'Media';
    case 'baja': return 'Baja';
    default: return assertNever(confidence);
  }
}

// --- Markdown safety helpers ---

/**
 * Escapes content for use ONLY inside Markdown table cells.
 * Replaces pipe characters and newlines to prevent table breakage.
 */
function escapeTableCell(value: string): string {
  if (value === '') return '—';
  return value
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '');
}

/**
 * Escapes dynamic text for use in Markdown titles, lists, paragraphs,
 * explanations, actions, and reasoning (NOT inside tables).
 *
 * - Converts empty strings to "—"
 * - Normalizes CRLF and CR to LF (preserves line breaks as valid Markdown)
 * - Escapes characters that could alter Markdown structure:
 *   backslash, backtick, asterisk, underscore, brackets, hash at line start
 * - Does NOT remove original content
 */
function escapeMarkdownText(value: string): string {
  if (value === '') return '—';
  return value
    // Normalize line endings to LF
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Escape backslashes first (before other escapes add more)
    .replace(/\\/g, '\\\\')
    // Escape backticks
    .replace(/`/g, '\\`')
    // Escape asterisks
    .replace(/\*/g, '\\*')
    // Escape underscores
    .replace(/_/g, '\\_')
    // Escape square brackets
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    // Escape hash at the beginning of lines (would create headers)
    .replace(/^(#+)/gm, '\\$1');
}

/**
 * Formats a percentage value with one decimal place and % symbol.
 */
function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

// --- Main report generator ---

/**
 * Generates a complete Markdown report from analysis results.
 * Pure, deterministic, no side effects, no mutations.
 */
export function generateMarkdownReport(input: GenerateReportInput): string {
  const { fileName, summary, findings, candidates, riskScore } = input;
  const lines: string[] = [];

  // 1. Title
  lines.push('# Pipeline Risk Auditor');
  lines.push('');

  // 2. Analysis info
  lines.push('## Información del análisis');
  lines.push('');
  lines.push(`- **Archivo analizado:** ${escapeMarkdownText(fileName)}`);
  lines.push('- **Modo de análisis:** `rules_only`');
  lines.push('- Este reporte fue generado mediante reglas determinísticas locales, sin depender de servicios de inteligencia artificial ni de AWS.');
  lines.push('');

  // 3. Structure summary
  lines.push('## Resumen de estructura');
  lines.push('');
  lines.push(`- **Filas:** ${summary.rowCount}`);
  lines.push(`- **Columnas:** ${summary.columnCount}`);
  if (summary.parseErrors.length > 0) {
    lines.push(`- **Errores de parseo:** ${summary.parseErrors.length}`);
    for (const err of summary.parseErrors) {
      lines.push(`  - ${escapeMarkdownText(err)}`);
    }
  }
  lines.push('');

  // 4. Column profiles
  lines.push('## Perfil de columnas');
  lines.push('');
  if (summary.columns.length > 0) {
    lines.push('| Nombre | Tipo | Nulos | Vacíos | Únicos | Valores de muestra |');
    lines.push('|--------|------|-------|--------|--------|-------------------|');
    for (const col of summary.columns) {
      const samples = col.sampleValues.length > 0
        ? col.sampleValues.map((v) => escapeTableCell(v)).join(', ')
        : '—';
      lines.push(
        `| ${escapeTableCell(col.name)} | ${translateInferredType(col.inferredType)} | ${col.nullCount} | ${col.emptyCount} | ${col.uniqueCount} | ${samples} |`
      );
    }
  } else {
    lines.push('No se detectaron columnas en el archivo.');
  }
  lines.push('');

  // 5. Risk score
  lines.push('## Puntaje de riesgo');
  lines.push('');
  lines.push(`- **Puntaje total:** ${riskScore.total} / 100`);
  lines.push(`- **Puntaje bruto (sin límite):** ${riskScore.rawTotal}`);
  lines.push('');
  if (riskScore.breakdown.length > 0) {
    lines.push('### Desglose');
    lines.push('');
    lines.push('| Hallazgo | Severidad | Aporte |');
    lines.push('|----------|-----------|--------|');
    for (const item of riskScore.breakdown) {
      lines.push(
        `| ${escapeTableCell(item.findingId)} | ${translateSeverity(item.severity)} | +${item.contribution} puntos |`
      );
    }
  }
  lines.push('');

  // 6. Findings
  lines.push('## Hallazgos detectados');
  lines.push('');
  if (findings.length === 0) {
    lines.push('No se detectaron riesgos en los datos analizados.');
  } else {
    lines.push(`Se detectaron **${findings.length}** hallazgos:`);
    lines.push('');
    for (const finding of findings) {
      lines.push(`### ${escapeMarkdownText(finding.description)}`);
      lines.push('');
      lines.push(`- **Severidad:** ${translateSeverity(finding.severity)}`);
      lines.push(`- **Categoría:** ${translateCategory(finding.category)}`);
      lines.push(`- **Cantidad:** ${finding.count}`);
      if (finding.percentage !== undefined) {
        lines.push(`- **Porcentaje:** ${formatPercentage(finding.percentage)}`);
      }
      if (finding.affectedColumns && finding.affectedColumns.length > 0) {
        lines.push(`- **Columnas afectadas:** ${finding.affectedColumns.map(escapeMarkdownText).join(', ')}`);
      }
      lines.push('');
      lines.push(`**Explicación basada en reglas:**`);
      lines.push('');
      lines.push(escapeMarkdownText(finding.ruleBasedExplanation));
      lines.push('');
      lines.push(`**Acción recomendada:**`);
      lines.push('');
      lines.push(escapeMarkdownText(finding.recommendedAction));
      lines.push('');
    }
  }
  lines.push('');

  // 7. Confirmed candidates
  lines.push('## Columnas candidatas confirmadas');
  lines.push('');
  const confirmed = candidates.filter((c) => c.confirmedByUser);
  if (confirmed.length === 0) {
    lines.push('No se confirmaron columnas candidatas.');
  } else {
    for (const cand of confirmed) {
      lines.push(`### ${escapeMarkdownText(cand.columnName)}`);
      lines.push('');
      lines.push(`- **Tipo:** ${translateCandidateType(cand.candidateType)}`);
      lines.push(`- **Confianza:** ${translateConfidence(cand.confidence)}`);
      lines.push(`- **Razonamiento:** ${escapeMarkdownText(cand.reasoning)}`);
      lines.push('');
    }
  }
  lines.push('');

  // 8. Closing note
  lines.push('---');
  lines.push('');
  lines.push('> **Nota:** El archivo CSV completo no se incorporó a este reporte. El análisis fue ejecutado en modo local (`rules_only`) utilizando reglas determinísticas sin conexión a servicios externos.');
  lines.push('');

  return lines.join('\n');
}
