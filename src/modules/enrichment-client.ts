import type { EnrichRequest, EnrichResponse } from '../types/enrichment';
import type { CSVSummary } from '../types/csv';
import type { Finding } from '../types/findings';
import type { ColumnCandidate } from '../types/candidates';
import type { RiskScore } from '../types/risk';

const ENRICH_TIMEOUT_MS = 30_000; // 30 seconds

/**
 * Result of an enrichment attempt.
 * Either succeeds with an EnrichResponse or fails gracefully.
 */
export type EnrichmentResult =
  | { success: true; response: EnrichResponse }
  | { success: false; error: string };

/**
 * Builds an EnrichRequest from local analysis results.
 * Only sends summary, findings, candidates, and riskScore — never full CSV rows.
 */
export function buildEnrichRequest(
  summary: CSVSummary,
  findings: Finding[],
  candidates: ColumnCandidate[],
  riskScore: RiskScore,
): EnrichRequest {
  return {
    structureSummary: {
      rowCount: summary.rowCount,
      columnCount: summary.columnCount,
      columns: summary.columns.map((col) => ({
        name: col.name,
        inferredType: col.inferredType,
      })),
    },
    findings: findings.map((f) => ({
      id: f.id,
      category: f.category,
      severity: f.severity,
      description: f.description,
      count: f.count,
      percentage: f.percentage,
    })),
    candidates: candidates.map((c) => ({
      columnName: c.columnName,
      candidateType: c.candidateType,
      confidence: c.confidence,
    })),
    riskScore: riskScore.total,
  };
}

/**
 * Resolves the enrichment endpoint URL.
 *
 * - If VITE_API_URL is configured: uses VITE_API_URL + /audit/enrich
 * - If VITE_API_URL is NOT configured AND in DEV mode: uses relative path /audit/enrich
 *   (compatible with MSW local mock intercepting fetch requests)
 * - If VITE_API_URL is NOT configured AND in production: returns null (cannot proceed)
 */
function resolveEnrichUrl(): string | null {
  const baseUrl = import.meta.env.VITE_API_URL;

  if (baseUrl && typeof baseUrl === 'string' && baseUrl.trim() !== '') {
    return `${baseUrl.replace(/\/$/, '')}/audit/enrich`;
  }

  // In development without VITE_API_URL, use relative path for MSW interception
  if (import.meta.env.DEV) {
    return '/audit/enrich';
  }

  // Production without VITE_API_URL — cannot proceed
  return null;
}

/**
 * Calls the enrichment endpoint POST /audit/enrich.
 * Falls back gracefully on any error — never throws.
 *
 * - Does NOT send full CSV rows.
 * - Uses AbortController for timeout.
 * - Compatible with the local MSW mock.
 * - Does NOT expose raw error bodies to the frontend.
 */
export async function enrichFindings(request: EnrichRequest): Promise<EnrichmentResult> {
  const url = resolveEnrichUrl();

  if (!url) {
    return {
      success: false,
      error: 'La URL del servicio de enriquecimiento no está configurada (VITE_API_URL).',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ENRICH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        success: false,
        error: `El servicio de IA respondió con error HTTP ${response.status}.`,
      };
    }

    const data = await response.json() as EnrichResponse;

    // Basic validation of the response
    if (!data || !Array.isArray(data.explanations) || data.source !== 'ai') {
      return {
        success: false,
        error: 'La respuesta del servicio de IA no tiene el formato esperado.',
      };
    }

    return { success: true, response: data };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        success: false,
        error: 'El servicio de IA no respondió en el tiempo esperado (timeout).',
      };
    }

    const message = err instanceof Error ? err.message : 'Error desconocido';
    return {
      success: false,
      error: `No se pudo conectar con el servicio de IA: ${message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
