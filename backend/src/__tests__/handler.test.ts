import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import type { MantleCallResult } from '../mantle-client';

const { mockCallMantle } = vi.hoisted(() => ({
  mockCallMantle: vi.fn()
}));

vi.mock('../mantle-client', () => ({
  callMantle: mockCallMantle
}));

import { handler } from '../handler';

type TestSeverity = 'alto' | 'medio' | 'bajo';
type TestCandidateType = 'primary_key' | 'business_key' | 'incremental_marker';
interface TestFinding { id: string; category: string; severity: TestSeverity; description: string; count: number; percentage?: number; }
interface TestPayload { structureSummary: { rowCount: number; columnCount: number; columns: { name: string; inferredType: string }[]; }; findings: TestFinding[]; candidates: { columnName: string; candidateType: TestCandidateType; confidence: string; }[]; riskScore: number; }

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return { httpMethod: 'POST', path: '/audit/enrich', body: null, headers: { 'Content-Type': 'application/json' }, multiValueHeaders: {}, isBase64Encoded: false, pathParameters: null, queryStringParameters: null, multiValueQueryStringParameters: null, stageVariables: null, requestContext: {} as APIGatewayProxyEvent['requestContext'], resource: '', ...overrides };
}

function validPayload(): TestPayload {
  return { structureSummary: { rowCount: 100, columnCount: 3, columns: [{ name: 'id', inferredType: 'number' }, { name: 'nombre', inferredType: 'string' }, { name: 'fecha', inferredType: 'date' }] }, findings: [{ id: 'nulls-nombre', category: 'nulls', severity: 'alto', description: 'La columna nombre tiene 25% nulos', count: 25, percentage: 25.0 }], candidates: [{ columnName: 'id', candidateType: 'primary_key', confidence: 'alta' }], riskScore: 20 };
}

function mantleSuccessText(findingIds: string[]): string {
  return JSON.stringify({ explanations: findingIds.map((id) => ({ findingId: id, technicalImpact: `Impacto para ${id}`, contextualExplanation: `Contexto para ${id}`, correctiveAction: `Acción para ${id}`, priority: 'high' })), executiveSummary: 'Resumen ejecutivo.', overallRiskAssessment: 'Evaluación del riesgo.' });
}

describe('Lambda handler - /audit/enrich (Mantle)', () => {
  beforeEach(() => {
    vi.stubEnv('BEDROCK_MODEL_ID', 'openai.gpt-oss-20b');
    vi.stubEnv('ALLOWED_ORIGIN', 'http://localhost:5173');
    vi.stubEnv('AWS_REGION', 'us-west-2');
    mockCallMantle.mockReset();
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  describe('validación del payload', () => {
    it('rechaza JSON inválido con HTTP 400', async () => {
      const r = await handler(makeEvent({ body: 'not json{{{' }));
      expect(r.statusCode).toBe(400);
      expect(JSON.parse(r.body).error).toBe('INVALID_JSON');
    });

    it('rechaza estructura inválida con HTTP 400', async () => {
      const r = await handler(makeEvent({ body: JSON.stringify({ findings: [], candidates: [], riskScore: 50 }) }));
      expect(r.statusCode).toBe(400);
      expect(JSON.parse(r.body).error).toBe('INVALID_PAYLOAD');
    });

    it('rechaza riskScore > 100', async () => {
      const p = validPayload(); p.riskScore = 150;
      const r = await handler(makeEvent({ body: JSON.stringify(p) }));
      expect(r.statusCode).toBe(400);
      expect(JSON.parse(r.body).message).toContain('riskScore');
    });

    it('rechaza riskScore negativo', async () => {
      const p = validPayload(); p.riskScore = -5;
      const r = await handler(makeEvent({ body: JSON.stringify(p) }));
      expect(r.statusCode).toBe(400);
    });

    it('rechaza payload > 64 KB', async () => {
      const r = await handler(makeEvent({ body: 'x'.repeat(65 * 1024) }));
      expect(r.statusCode).toBe(400);
      expect(JSON.parse(r.body).error).toBe('PAYLOAD_TOO_LARGE');
    });

    it('rechaza severity inválida', async () => {
      const p = validPayload();
      (p.findings[0] as unknown as Record<string, unknown>).severity = 'critico';
      const r = await handler(makeEvent({ body: JSON.stringify(p) }));
      expect(r.statusCode).toBe(400);
      expect(JSON.parse(r.body).message).toContain('severity');
    });
  });

  describe('sanitización', () => {
    it('elimina caracteres especiales de nombres de columnas', async () => {
      const p = validPayload();
      p.structureSummary.columns = [{ name: 'col name!@#', inferredType: 'string' }];
      p.candidates = [{ columnName: 'cand_name!', candidateType: 'primary_key', confidence: 'alta' }];
      mockCallMantle.mockResolvedValueOnce({ success: true, text: mantleSuccessText(['nulls-nombre']) } as MantleCallResult);
      const r = await handler(makeEvent({ body: JSON.stringify(p) }));
      expect(r.statusCode).toBe(200);
      const promptArg = mockCallMantle.mock.calls[0]?.[0] as string;
      expect(promptArg).toContain('colname');
      expect(promptArg).not.toContain('!');
    });

    it('trunca nombres a 128 caracteres', async () => {
      const p = validPayload();
      p.structureSummary.columns = [{ name: 'a'.repeat(200), inferredType: 'string' }];
      mockCallMantle.mockResolvedValueOnce({ success: true, text: mantleSuccessText(['nulls-nombre']) } as MantleCallResult);
      const r = await handler(makeEvent({ body: JSON.stringify(p) }));
      expect(r.statusCode).toBe(200);
      const promptArg = mockCallMantle.mock.calls[0]?.[0] as string;
      const line = promptArg.split('\n').find((l: string) => l.includes('Nombres de columnas:'));
      const name = line?.replace('- Nombres de columnas: ', '').trim() ?? '';
      expect(name.length).toBeLessThanOrEqual(128);
    });
  });

  describe('callMantle - éxito', () => {
    it('retorna HTTP 200 con EnrichResponse', async () => {
      mockCallMantle.mockResolvedValueOnce({ success: true, text: mantleSuccessText(['nulls-nombre']) } as MantleCallResult);
      const r = await handler(makeEvent({ body: JSON.stringify(validPayload()) }));
      expect(r.statusCode).toBe(200);
      const b = JSON.parse(r.body);
      expect(b.source).toBe('ai');
      expect(b.executiveSummary).toBe('Resumen ejecutivo.');
      expect(b.explanations[0].findingId).toBe('nulls-nombre');
      expect(b.explanations[0].priority).toBe('high');
    });

    it('asocia explicaciones por findingId', async () => {
      const p = validPayload();
      p.findings = [
        { id: 'f1', category: 'nulls', severity: 'alto', description: 'd1', count: 10 },
        { id: 'f2', category: 'empties', severity: 'medio', description: 'd2', count: 5, percentage: 10 },
      ];
      mockCallMantle.mockResolvedValueOnce({ success: true, text: mantleSuccessText(['f1', 'f2']) } as MantleCallResult);
      const r = await handler(makeEvent({ body: JSON.stringify(p) }));
      const b = JSON.parse(r.body);
      expect(b.explanations[0].findingId).toBe('f1');
      expect(b.explanations[1].findingId).toBe('f2');
    });

    it('respuesta exitosa incluye Content-Type con charset=utf-8', async () => {
      mockCallMantle.mockResolvedValueOnce({ success: true, text: mantleSuccessText(['nulls-nombre']) } as MantleCallResult);
      const r = await handler(makeEvent({ body: JSON.stringify(validPayload()) }));
      expect(r.statusCode).toBe(200);
      expect(r.headers?.['Content-Type']).toBe('application/json; charset=utf-8');
    });
  });

  describe('callMantle - timeout', () => {
    it('retorna HTTP 504 BEDROCK_TIMEOUT', async () => {
      mockCallMantle.mockResolvedValueOnce({ success: false, error: 'Timeout', isTimeout: true } as MantleCallResult);
      const r = await handler(makeEvent({ body: JSON.stringify(validPayload()) }));
      expect(r.statusCode).toBe(504);
      expect(JSON.parse(r.body).error).toBe('BEDROCK_TIMEOUT');
    });
  });

  describe('callMantle - error genérico', () => {
    it('retorna HTTP 502 BEDROCK_ERROR', async () => {
      mockCallMantle.mockResolvedValueOnce({ success: false, error: 'Error', isTimeout: false } as MantleCallResult);
      const r = await handler(makeEvent({ body: JSON.stringify(validPayload()) }));
      expect(r.statusCode).toBe(502);
      expect(JSON.parse(r.body).error).toBe('BEDROCK_ERROR');
    });
  });

  describe('variables de entorno', () => {
    it('HTTP 500 sin BEDROCK_MODEL_ID', async () => {
      vi.stubEnv('BEDROCK_MODEL_ID', '');
      const r = await handler(makeEvent({ body: JSON.stringify(validPayload()) }));
      expect(r.statusCode).toBe(500);
      expect(JSON.parse(r.body).error).toBe('SERVER_CONFIGURATION_ERROR');
    });

    it('HTTP 500 sin ALLOWED_ORIGIN', async () => {
      vi.stubEnv('ALLOWED_ORIGIN', '');
      const r = await handler(makeEvent({ body: JSON.stringify(validPayload()) }));
      expect(r.statusCode).toBe(500);
      expect(JSON.parse(r.body).error).toBe('SERVER_CONFIGURATION_ERROR');
    });
  });

  describe('invocación de callMantle', () => {
    it('callMantle recibe prompt, modelId y AbortSignal', async () => {
      mockCallMantle.mockResolvedValueOnce({ success: true, text: mantleSuccessText(['nulls-nombre']) } as MantleCallResult);
      await handler(makeEvent({ body: JSON.stringify(validPayload()) }));
      expect(mockCallMantle).toHaveBeenCalledTimes(1);
      const [prompt, modelId, signal] = mockCallMantle.mock.calls[0] as [string, string, AbortSignal];
      expect(prompt).toContain('SYSTEM_INSTRUCTIONS');
      expect(modelId).toBe('openai.gpt-oss-20b');
      expect(signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe('buildPrompt — findingId count and listing', () => {
    it('prompt contiene la cantidad exacta y los IDs de los findings', async () => {
      const p = validPayload();
      p.findings = [
        { id: 'nulls-col-a', category: 'nulls', severity: 'alto', description: 'd1', count: 10 },
        { id: 'empties-col-b', category: 'empties', severity: 'medio', description: 'd2', count: 5, percentage: 8 },
      ];
      mockCallMantle.mockResolvedValueOnce({ success: true, text: mantleSuccessText(['nulls-col-a', 'empties-col-b']) } as MantleCallResult);
      await handler(makeEvent({ body: JSON.stringify(p) }));
      const promptArg = mockCallMantle.mock.calls[0]?.[0] as string;
      expect(promptArg).toContain('EXACTAMENTE 2 explicaciones');
      expect(promptArg).toContain('"nulls-col-a"');
      expect(promptArg).toContain('"empties-col-b"');
    });

    it('serializa correctamente IDs con comillas o caracteres especiales en la lista del prompt', async () => {
      const p = validPayload();
      p.findings = [
        { id: 'null"s-col', category: 'nulls', severity: 'alto', description: 'd1', count: 10 },
        { id: 'empty<tag>', category: 'empties', severity: 'medio', description: 'd2', count: 5 },
      ];
      mockCallMantle.mockResolvedValueOnce({ success: true, text: mantleSuccessText(['null"s-col', 'empty<tag>']) } as MantleCallResult);
      await handler(makeEvent({ body: JSON.stringify(p) }));
      const promptArg = mockCallMantle.mock.calls[0]?.[0] as string;
      // JSON.stringify properly escapes quotes
      expect(promptArg).toContain('["null\\"s-col","empty<tag>"]');
      expect(promptArg).toContain('EXACTAMENTE 2 explicaciones');
    });
  });

  describe('parseMantleResponse — findingId robustness', () => {
    it('asocia todos los findingId exactos correctamente', async () => {
      const p = validPayload();
      p.findings = [
        { id: 'f1', category: 'nulls', severity: 'alto', description: 'd1', count: 10 },
        { id: 'f2', category: 'empties', severity: 'medio', description: 'd2', count: 5 },
        { id: 'f3', category: 'duplicates', severity: 'bajo', description: 'd3', count: 2 },
      ];
      mockCallMantle.mockResolvedValueOnce({ success: true, text: mantleSuccessText(['f1', 'f2', 'f3']) } as MantleCallResult);
      const r = await handler(makeEvent({ body: JSON.stringify(p) }));
      const b = JSON.parse(r.body);
      expect(b.explanations).toHaveLength(3);
      expect(b.explanations[0].findingId).toBe('f1');
      expect(b.explanations[1].findingId).toBe('f2');
      expect(b.explanations[2].findingId).toBe('f3');
      expect(b.explanations[0].technicalImpact).toBe('Impacto para f1');
    });

    it('findingId con espacios alrededor se asocia correctamente via trim', async () => {
      const p = validPayload();
      p.findings = [
        { id: 'f1', category: 'nulls', severity: 'alto', description: 'd1', count: 10 },
      ];
      const responseWithSpaces = JSON.stringify({
        explanations: [{ findingId: '  f1  ', technicalImpact: 'impacto trimmed', contextualExplanation: 'ctx', correctiveAction: 'action', priority: 'high' }],
        executiveSummary: 'resumen',
        overallRiskAssessment: 'evaluacion',
      });
      mockCallMantle.mockResolvedValueOnce({ success: true, text: responseWithSpaces } as MantleCallResult);
      const r = await handler(makeEvent({ body: JSON.stringify(p) }));
      const b = JSON.parse(r.body);
      expect(b.explanations[0].findingId).toBe('f1');
      expect(b.explanations[0].technicalImpact).toBe('impacto trimmed');
    });

    it('findingId omitido usa fallback solo para ese hallazgo', async () => {
      const p = validPayload();
      p.findings = [
        { id: 'f1', category: 'nulls', severity: 'alto', description: 'd1', count: 10 },
        { id: 'f2', category: 'empties', severity: 'medio', description: 'd2', count: 5 },
      ];
      const partialResponse = JSON.stringify({
        explanations: [{ findingId: 'f1', technicalImpact: 'impacto f1', contextualExplanation: 'ctx f1', correctiveAction: 'action f1', priority: 'high' }],
        executiveSummary: 'resumen',
        overallRiskAssessment: 'evaluacion',
      });
      mockCallMantle.mockResolvedValueOnce({ success: true, text: partialResponse } as MantleCallResult);
      const r = await handler(makeEvent({ body: JSON.stringify(p) }));
      const b = JSON.parse(r.body);
      expect(b.explanations).toHaveLength(2);
      expect(b.explanations[0].findingId).toBe('f1');
      expect(b.explanations[0].technicalImpact).toBe('impacto f1');
      expect(b.explanations[1].findingId).toBe('f2');
      expect(b.explanations[1].technicalImpact).toContain('Hallazgo f2 requiere revisión');
    });

    it('ignora IDs desconocidos que no corresponden a ningún finding', async () => {
      const p = validPayload();
      p.findings = [
        { id: 'f1', category: 'nulls', severity: 'alto', description: 'd1', count: 10 },
      ];
      const responseWithUnknown = JSON.stringify({
        explanations: [
          { findingId: 'f1', technicalImpact: 'impacto f1', contextualExplanation: 'ctx', correctiveAction: 'action', priority: 'high' },
          { findingId: 'DESCONOCIDO', technicalImpact: 'no deberia aparecer', contextualExplanation: 'x', correctiveAction: 'x', priority: 'low' },
        ],
        executiveSummary: 'resumen',
        overallRiskAssessment: 'evaluacion',
      });
      mockCallMantle.mockResolvedValueOnce({ success: true, text: responseWithUnknown } as MantleCallResult);
      const r = await handler(makeEvent({ body: JSON.stringify(p) }));
      const b = JSON.parse(r.body);
      expect(b.explanations).toHaveLength(1);
      expect(b.explanations[0].findingId).toBe('f1');
      expect(b.explanations[0].technicalImpact).toBe('impacto f1');
    });

    it('ignora findingId duplicado y usa solo la primera coincidencia', async () => {
      const p = validPayload();
      p.findings = [
        { id: 'f1', category: 'nulls', severity: 'alto', description: 'd1', count: 10 },
      ];
      const responseWithDupe = JSON.stringify({
        explanations: [
          { findingId: 'f1', technicalImpact: 'primera', contextualExplanation: 'ctx1', correctiveAction: 'action1', priority: 'high' },
          { findingId: 'f1', technicalImpact: 'segunda', contextualExplanation: 'ctx2', correctiveAction: 'action2', priority: 'low' },
        ],
        executiveSummary: 'resumen',
        overallRiskAssessment: 'evaluacion',
      });
      mockCallMantle.mockResolvedValueOnce({ success: true, text: responseWithDupe } as MantleCallResult);
      const r = await handler(makeEvent({ body: JSON.stringify(p) }));
      const b = JSON.parse(r.body);
      expect(b.explanations).toHaveLength(1);
      expect(b.explanations[0].findingId).toBe('f1');
      expect(b.explanations[0].technicalImpact).toBe('primera');
    });

    it('ignora elemento de explanations cuyo findingId no es string y usa fallback', async () => {
      const p = validPayload();
      p.findings = [
        { id: 'f1', category: 'nulls', severity: 'alto', description: 'd1', count: 10 },
      ];
      const responseWithBadType = JSON.stringify({
        explanations: [
          { findingId: 123, technicalImpact: 'no valido', contextualExplanation: 'x', correctiveAction: 'x', priority: 'high' },
        ],
        executiveSummary: 'resumen',
        overallRiskAssessment: 'evaluacion',
      });
      mockCallMantle.mockResolvedValueOnce({ success: true, text: responseWithBadType } as MantleCallResult);
      const r = await handler(makeEvent({ body: JSON.stringify(p) }));
      const b = JSON.parse(r.body);
      expect(b.explanations).toHaveLength(1);
      expect(b.explanations[0].findingId).toBe('f1');
      expect(b.explanations[0].technicalImpact).toContain('Hallazgo f1 requiere revisión');
    });

    it('finding.id original con espacios se conserva en la salida aunque Mantle responda normalizado', async () => {
      const p = validPayload();
      p.findings = [
        { id: ' f1 ', category: 'nulls', severity: 'alto', description: 'd1', count: 10 },
      ];
      const responseNormalized = JSON.stringify({
        explanations: [{ findingId: 'f1', technicalImpact: 'impacto normalizado', contextualExplanation: 'ctx', correctiveAction: 'action', priority: 'high' }],
        executiveSummary: 'resumen',
        overallRiskAssessment: 'evaluacion',
      });
      mockCallMantle.mockResolvedValueOnce({ success: true, text: responseNormalized } as MantleCallResult);
      const r = await handler(makeEvent({ body: JSON.stringify(p) }));
      const b = JSON.parse(r.body);
      expect(b.explanations[0].findingId).toBe(' f1 ');
      expect(b.explanations[0].technicalImpact).toBe('impacto normalizado');
    });
  });

  describe('buildPrompt — clasificación de riesgo autoritativa', () => {
    it.each([
      { score: 0, expectedLevel: 'bajo' },
      { score: 29, expectedLevel: 'bajo' },
      { score: 30, expectedLevel: 'medio' },
      { score: 59, expectedLevel: 'medio' },
      { score: 60, expectedLevel: 'alto' },
      { score: 100, expectedLevel: 'alto' },
    ])('riskScore=$score → prompt contiene "Clasificación de riesgo: $expectedLevel"', async ({ score, expectedLevel }) => {
      const p = validPayload();
      p.riskScore = score;
      mockCallMantle.mockResolvedValueOnce({ success: true, text: mantleSuccessText(['nulls-nombre']) } as MantleCallResult);
      await handler(makeEvent({ body: JSON.stringify(p) }));
      const promptArg = mockCallMantle.mock.calls[0]?.[0] as string;
      expect(promptArg).toContain(`Clasificación de riesgo: ${expectedLevel}`);
      expect(promptArg).toContain(`Puntaje de riesgo: ${score}/100`);
    });

    it('riskScore=60 incluye la regla que prohíbe reinterpretar la clasificación', async () => {
      const p = validPayload();
      p.riskScore = 60;
      mockCallMantle.mockResolvedValueOnce({ success: true, text: mantleSuccessText(['nulls-nombre']) } as MantleCallResult);
      await handler(makeEvent({ body: JSON.stringify(p) }));
      const promptArg = mockCallMantle.mock.calls[0]?.[0] as string;
      expect(promptArg).toContain('REGLA SOBRE CLASIFICACIÓN DE RIESGO');
      expect(promptArg).toContain('utiliza EXACTAMENTE la clasificación proporcionada: "alto"');
      expect(promptArg).toContain('No reinterpretes');
      expect(promptArg).toContain('No describas un riesgo "alto" como moderado');
    });

    it('riskScore=60 con respuesta válida retorna HTTP 200 sin cambios al contrato', async () => {
      const p = validPayload();
      p.riskScore = 60;
      mockCallMantle.mockResolvedValueOnce({ success: true, text: mantleSuccessText(['nulls-nombre']) } as MantleCallResult);
      const r = await handler(makeEvent({ body: JSON.stringify(p) }));
      expect(r.statusCode).toBe(200);
      const b = JSON.parse(r.body);
      expect(b.source).toBe('ai');
      expect(b.explanations).toHaveLength(1);
      expect(b.executiveSummary).toBeDefined();
      expect(b.overallRiskAssessment).toBeDefined();
    });
  });
});
