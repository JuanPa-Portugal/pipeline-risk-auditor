// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { Orchestrator } from '../orchestrator';
import { buildEnrichRequest, enrichFindings } from '../enrichment-client';
import type { EnrichRequest, EnrichedExplanation, EnrichResponse } from '../../types/enrichment';

// --- MSW server setup for Node/Vitest ---

let lastRequestBody: unknown = null;

const successHandler = http.post('http://localhost/audit/enrich', async ({ request }) => {
  const body = await request.json() as EnrichRequest;
  lastRequestBody = body;

  const explanations: EnrichedExplanation[] = body.findings.map((f) => ({
    findingId: f.id,
    technicalImpact: `Impacto técnico mock para ${f.id}`,
    contextualExplanation: `Contexto mock para ${f.id}`,
    correctiveAction: `Acción correctiva mock para ${f.id}`,
    priority: f.severity === 'alto' ? 'high' : f.severity === 'medio' ? 'medium' : 'low',
  }));

  const response: EnrichResponse = {
    explanations,
    executiveSummary: `Mock: puntaje ${body.riskScore}/100 con ${body.findings.length} hallazgos.`,
    overallRiskAssessment: 'Mock: evaluación general del riesgo.',
    source: 'ai',
  };

  return HttpResponse.json(response);
});

const errorHandler = http.post('http://localhost/audit/enrich', () => {
  return HttpResponse.json(
    { error: 'BEDROCK_ERROR', message: 'Error simulado' },
    { status: 500 }
  );
});

const server = setupServer(successHandler);

// --- Test CSV ---

const TEST_CSV = [
  'id,nombre,updated_at',
  '1,Alice,2024-01-15',
  '2,Bob,2024-02-20',
  '3,,2024-13-01',
  '1,Alice,2024-01-15',
  '4,Diana,',
  '5,Eva,not-a-date',
].join('\n');

function createTestFile(): File {
  const file = new File([TEST_CSV], 'integracion-enrichment.csv', {
    type: 'text/csv;charset=utf-8',
  });
  if (!file.arrayBuffer) {
    const blob = new Blob([TEST_CSV], { type: 'text/csv;charset=utf-8' });
    file.arrayBuffer = () =>
      new Promise<ArrayBuffer>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.readAsArrayBuffer(blob);
      });
  }
  return file;
}

// --- Tests ---

describe('Integración con mock del Agente_Auditor (MSW)', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'bypass' });
  });

  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', 'http://localhost');
    lastRequestBody = null;
  });

  afterEach(() => {
    server.resetHandlers();
    server.use(successHandler);
    vi.unstubAllEnvs();
  });

  afterAll(() => {
    server.close();
  });

  describe('flujo exitoso con IA mock', () => {
    it('ejecuta análisis local + enriquecimiento mock completo', async () => {
      const orchestrator = new Orchestrator();
      const file = createTestFile();

      // 1. Run local analysis
      const localResult = await orchestrator.analyze(file);

      expect(localResult.summary).toBeDefined();
      expect(localResult.findings.length).toBeGreaterThan(0);
      expect(localResult.riskScore).toBeDefined();

      // 2. Build enrich request
      const enrichRequest = buildEnrichRequest(
        localResult.summary,
        localResult.findings,
        localResult.candidates,
        localResult.riskScore,
      );

      // 3. Call enrichment (intercepted by MSW)
      const enrichResult = await enrichFindings(enrichRequest);

      // 4. Verify success
      expect(enrichResult.success).toBe(true);
      if (!enrichResult.success) return;

      expect(enrichResult.response.source).toBe('ai');
      expect(enrichResult.response.executiveSummary).toContain('hallazgos');
      expect(enrichResult.response.overallRiskAssessment).toBeDefined();

      // 5. Verify association by findingId
      for (const explanation of enrichResult.response.explanations) {
        const matchingFinding = localResult.findings.find((f) => f.id === explanation.findingId);
        expect(matchingFinding).toBeDefined();
      }
      expect(enrichResult.response.explanations.length).toBe(localResult.findings.length);

      // 6. Local results still available
      expect(localResult.summary.rowCount).toBeGreaterThan(0);
      expect(localResult.findings.length).toBeGreaterThan(0);
      expect(localResult.candidates).toBeDefined();
      expect(localResult.riskScore.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('privacidad del payload', () => {
    it('envía únicamente structureSummary, findings, candidates y riskScore', async () => {
      const orchestrator = new Orchestrator();
      const file = createTestFile();

      const localResult = await orchestrator.analyze(file);

      const enrichRequest = buildEnrichRequest(
        localResult.summary,
        localResult.findings,
        localResult.candidates,
        localResult.riskScore,
      );

      await enrichFindings(enrichRequest);

      // Verify the request body captured by MSW
      const sentBody = lastRequestBody as Record<string, unknown>;
      expect(sentBody).toBeDefined();

      // Verify ONLY these 4 top-level keys exist (no rows, sampleRows, etc.)
      const topLevelKeys = Object.keys(sentBody).sort();
      expect(topLevelKeys).toEqual(['candidates', 'findings', 'riskScore', 'structureSummary']);

      // Must NOT have rows or sampleRows anywhere
      expect(sentBody).not.toHaveProperty('rows');
      expect(sentBody).not.toHaveProperty('sampleRows');
      expect(sentBody).not.toHaveProperty('rawRows');
      expect(sentBody).not.toHaveProperty('data');

      // structureSummary should not contain raw data
      const summary = sentBody.structureSummary as Record<string, unknown>;
      expect(summary).not.toHaveProperty('rows');
      expect(summary).not.toHaveProperty('sampleRows');

      // Verify findings don't contain extra row data
      const findings = sentBody.findings as Record<string, unknown>[];
      for (const finding of findings) {
        expect(finding).not.toHaveProperty('rows');
        expect(finding).not.toHaveProperty('rawData');
      }
    });
  });

  describe('modo degradado', () => {
    it('devuelve success false cuando el endpoint responde HTTP 500', async () => {
      server.use(errorHandler);

      const orchestrator = new Orchestrator();
      const file = createTestFile();

      // Local analysis succeeds
      const localResult = await orchestrator.analyze(file);
      expect(localResult.findings.length).toBeGreaterThan(0);

      // Build request and attempt enrichment
      const enrichRequest = buildEnrichRequest(
        localResult.summary,
        localResult.findings,
        localResult.candidates,
        localResult.riskScore,
      );

      const enrichResult = await enrichFindings(enrichRequest);

      // Enrichment fails gracefully
      expect(enrichResult.success).toBe(false);
      if (enrichResult.success) return;
      expect(enrichResult.error).toContain('500');

      // Local results are still fully available and unchanged
      expect(localResult.summary.rowCount).toBeGreaterThan(0);
      expect(localResult.summary.columnCount).toBe(3);
      expect(localResult.findings.length).toBeGreaterThan(0);
      expect(localResult.candidates).toBeDefined();
      expect(localResult.riskScore.total).toBeGreaterThanOrEqual(0);
      expect(localResult.riskScore.breakdown.length).toBe(localResult.findings.length);
    });

    it('no pierde findings ni candidates cuando el enriquecimiento falla', async () => {
      server.use(errorHandler);

      const orchestrator = new Orchestrator();
      const file = createTestFile();

      const localResult = await orchestrator.analyze(file);

      // Capture state before enrichment attempt
      const findingsCount = localResult.findings.length;
      const candidatesCount = localResult.candidates.length;
      const riskTotal = localResult.riskScore.total;

      // Attempt enrichment (will fail)
      const enrichRequest = buildEnrichRequest(
        localResult.summary,
        localResult.findings,
        localResult.candidates,
        localResult.riskScore,
      );
      await enrichFindings(enrichRequest);

      // Verify nothing was lost
      expect(localResult.findings.length).toBe(findingsCount);
      expect(localResult.candidates.length).toBe(candidatesCount);
      expect(localResult.riskScore.total).toBe(riskTotal);
    });
  });
});
