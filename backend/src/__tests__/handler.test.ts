import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

// Use vi.hoisted to ensure mockSend is available when the mock factory runs
const { mockSend } = vi.hoisted(() => {
  return { mockSend: vi.fn() };
});

vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: vi.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  ConverseCommand: vi.fn().mockImplementation((input) => input),
}));

// Import handler after mocks
import { handler } from '../handler';

// --- Test types (matching the handler's expected payload structure) ---

type TestSeverity = 'alto' | 'medio' | 'bajo';
type TestCandidateType = 'primary_key' | 'business_key' | 'incremental_marker';

interface TestFinding {
  id: string;
  category: string;
  severity: TestSeverity;
  description: string;
  count: number;
  percentage?: number;
}

interface TestPayload {
  structureSummary: {
    rowCount: number;
    columnCount: number;
    columns: { name: string; inferredType: string }[];
  };
  findings: TestFinding[];
  candidates: {
    columnName: string;
    candidateType: TestCandidateType;
    confidence: string;
  }[];
  riskScore: number;
}

// --- Helpers ---

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    path: '/audit/enrich',
    body: null,
    headers: { 'Content-Type': 'application/json' },
    multiValueHeaders: {},
    isBase64Encoded: false,
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: '',
    ...overrides,
  };
}

function validPayload(): TestPayload {
  return {
    structureSummary: {
      rowCount: 100,
      columnCount: 3,
      columns: [
        { name: 'id', inferredType: 'number' },
        { name: 'nombre', inferredType: 'string' },
        { name: 'fecha', inferredType: 'date' },
      ],
    },
    findings: [
      {
        id: 'nulls-nombre',
        category: 'nulls',
        severity: 'alto',
        description: 'La columna nombre tiene 25% nulos',
        count: 25,
        percentage: 25.0,
      },
    ],
    candidates: [
      {
        columnName: 'id',
        candidateType: 'primary_key',
        confidence: 'alta',
      },
    ],
    riskScore: 20,
  };
}

function bedrockSuccessResponse(findingIds: string[]) {
  const explanations = findingIds.map((id) => ({
    findingId: id,
    technicalImpact: `Impacto técnico para ${id}`,
    contextualExplanation: `Contexto para ${id}`,
    correctiveAction: `Acción correctiva para ${id}`,
    priority: 'high',
  }));

  return {
    output: {
      message: {
        content: [
          {
            text: JSON.stringify({
              explanations,
              executiveSummary: 'Resumen ejecutivo del análisis.',
              overallRiskAssessment: 'Evaluación general del riesgo.',
            }),
          },
        ],
      },
    },
  };
}

// --- Tests ---

describe('Lambda handler - /audit/enrich', () => {
  beforeEach(() => {
    vi.stubEnv('BEDROCK_MODEL_ID', 'openai.gpt-oss-20b-1:0');
    vi.stubEnv('ALLOWED_ORIGIN', 'http://localhost:5173');
    mockSend.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  // --- 1. Payload validation ---

  describe('validación del payload', () => {
    it('rechaza JSON inválido con HTTP 400', async () => {
      const event = makeEvent({ body: 'not json{{{' });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INVALID_JSON');
    });

    it('rechaza estructura inválida (sin structureSummary) con HTTP 400', async () => {
      const event = makeEvent({
        body: JSON.stringify({ findings: [], candidates: [], riskScore: 50 }),
      });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INVALID_PAYLOAD');
    });

    it('rechaza riskScore fuera de rango (> 100) con HTTP 400', async () => {
      const payload = validPayload();
      payload.riskScore = 150;
      const event = makeEvent({ body: JSON.stringify(payload) });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INVALID_PAYLOAD');
      expect(body.message).toContain('riskScore');
    });

    it('rechaza riskScore negativo con HTTP 400', async () => {
      const payload = validPayload();
      payload.riskScore = -5;
      const event = makeEvent({ body: JSON.stringify(payload) });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INVALID_PAYLOAD');
    });

    it('rechaza payload mayor a 64 KB con HTTP 400', async () => {
      const largeBody = 'x'.repeat(65 * 1024);
      const event = makeEvent({ body: largeBody });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('PAYLOAD_TOO_LARGE');
    });

    it('rechaza findings con severity inválida', async () => {
      const payload = validPayload();
      (payload.findings[0] as unknown as Record<string, unknown>).severity = 'critico';
      const event = makeEvent({ body: JSON.stringify(payload) });
      const result = await handler(event);
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INVALID_PAYLOAD');
      expect(body.message).toContain('severity');
    });
  });

  // --- 2. Sanitization ---

  describe('sanitización de nombres de columnas', () => {
    it('elimina caracteres especiales y espacios de los nombres de columnas', async () => {
      const payload = validPayload();
      payload.structureSummary.columns = [
        { name: 'col name!@#$%^&*()', inferredType: 'string' },
      ];
      payload.candidates = [
        { columnName: 'cand_name with spaces!', candidateType: 'primary_key', confidence: 'alta' },
      ];

      mockSend.mockResolvedValueOnce(bedrockSuccessResponse(['nulls-nombre']));

      const event = makeEvent({ body: JSON.stringify(payload) });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      const commandArg = mockSend.mock.calls[0]?.[0];
      const promptText = commandArg?.messages?.[0]?.content?.[0]?.text as string;
      expect(promptText).toContain('colname');
      expect(promptText).not.toContain('!');
      expect(promptText).not.toContain('@');
      expect(promptText).toContain('candnamewithspaces');
      expect(promptText).not.toContain('cand_name with spaces!');
    });

    it('trunca nombres de columnas a 128 caracteres máximo', async () => {
      const longName = 'a'.repeat(200);
      const payload = validPayload();
      payload.structureSummary.columns = [
        { name: longName, inferredType: 'string' },
      ];

      mockSend.mockResolvedValueOnce(bedrockSuccessResponse(['nulls-nombre']));

      const event = makeEvent({ body: JSON.stringify(payload) });
      const result = await handler(event);
      expect(result.statusCode).toBe(200);

      const commandArg = mockSend.mock.calls[0]?.[0];
      const promptText = commandArg?.messages?.[0]?.content?.[0]?.text as string;
      const namesLine = promptText.split('\n').find((l: string) => l.includes('Nombres de columnas:'));
      const extractedName = namesLine?.replace('- Nombres de columnas: ', '').trim() ?? '';
      expect(extractedName.length).toBeLessThanOrEqual(128);
    });
  });

  // --- 3. Timeout ---

  describe('timeout de Bedrock', () => {
    it('retorna HTTP 504 BEDROCK_TIMEOUT cuando la invocación es abortada', async () => {
      vi.useFakeTimers();

      mockSend.mockImplementation((_command: unknown, options: { abortSignal?: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          const signal = options?.abortSignal;
          if (signal) {
            signal.addEventListener('abort', () => {
              const error = new Error('The operation was aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }
        });
      });

      const payload = validPayload();
      const event = makeEvent({ body: JSON.stringify(payload) });

      const resultPromise = handler(event);

      await vi.advanceTimersByTimeAsync(26_000);

      const result = await resultPromise;
      expect(result.statusCode).toBe(504);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('BEDROCK_TIMEOUT');
    });
  });

  // --- 4. Successful response ---

  describe('respuesta válida de Bedrock', () => {
    it('retorna HTTP 200 con EnrichResponse cuando Bedrock responde correctamente', async () => {
      const payload = validPayload();
      mockSend.mockResolvedValueOnce(bedrockSuccessResponse(['nulls-nombre']));

      const event = makeEvent({ body: JSON.stringify(payload) });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.source).toBe('ai');
      expect(body.executiveSummary).toBe('Resumen ejecutivo del análisis.');
      expect(body.overallRiskAssessment).toBe('Evaluación general del riesgo.');
      expect(Array.isArray(body.explanations)).toBe(true);
      expect(body.explanations.length).toBe(1);
      expect(body.explanations[0].findingId).toBe('nulls-nombre');
      expect(body.explanations[0].technicalImpact).toBe('Impacto técnico para nulls-nombre');
      expect(body.explanations[0].priority).toBe('high');
    });

    it('asocia explicaciones por findingId correctamente', async () => {
      const payload = validPayload();
      payload.findings = [
        { id: 'f1', category: 'nulls', severity: 'alto', description: 'desc1', count: 10 },
        { id: 'f2', category: 'empties', severity: 'medio', description: 'desc2', count: 5, percentage: 10 },
      ];
      mockSend.mockResolvedValueOnce(bedrockSuccessResponse(['f1', 'f2']));

      const event = makeEvent({ body: JSON.stringify(payload) });
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.explanations[0].findingId).toBe('f1');
      expect(body.explanations[1].findingId).toBe('f2');
    });
  });

  // --- 5. Environment variables ---

  describe('variables de entorno', () => {
    it('retorna HTTP 500 cuando BEDROCK_MODEL_ID no está configurado', async () => {
      vi.stubEnv('BEDROCK_MODEL_ID', '');
      const event = makeEvent({ body: JSON.stringify(validPayload()) });
      const result = await handler(event);
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('SERVER_CONFIGURATION_ERROR');
    });

    it('retorna HTTP 500 cuando ALLOWED_ORIGIN no está configurado', async () => {
      vi.stubEnv('ALLOWED_ORIGIN', '');
      const event = makeEvent({ body: JSON.stringify(validPayload()) });
      const result = await handler(event);
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('SERVER_CONFIGURATION_ERROR');
    });
  });
});
