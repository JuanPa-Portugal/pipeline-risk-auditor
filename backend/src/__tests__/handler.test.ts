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
});
