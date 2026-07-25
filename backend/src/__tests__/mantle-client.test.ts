import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';

// Mock all external dependencies
vi.mock('@smithy/signature-v4', () => ({
  SignatureV4: vi.fn().mockImplementation(() => ({
    sign: vi.fn().mockResolvedValue({
      headers: {
        'content-type': 'application/json',
        host: 'bedrock-mantle.us-west-2.api.aws',
        authorization: 'AWS4-HMAC-SHA256 Credential=test/20240101/us-west-2/bedrock-mantle/aws4_request',
      },
    }),
  })),
}));

vi.mock('@smithy/protocol-http', () => ({
  HttpRequest: vi.fn().mockImplementation((opts) => opts),
}));

vi.mock('@aws-crypto/sha256-js', () => ({
  Sha256: vi.fn(),
}));

vi.mock('@aws-sdk/credential-provider-node', () => ({
  defaultProvider: vi.fn().mockReturnValue(() =>
    Promise.resolve({ accessKeyId: 'AKIATEST', secretAccessKey: 'testSecret', sessionToken: 'testToken' })
  ),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { callMantle } from '../mantle-client';

function makeMantleResponse(output: unknown[]) {
  return { id: 'resp-001', status: 'completed', output };
}

describe('mantle-client — callMantle', () => {
  beforeEach(() => {
    vi.stubEnv('AWS_REGION', 'us-west-2');
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('envía POST a https://bedrock-mantle.us-west-2.api.aws/v1/responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeMantleResponse([
        { type: 'message', content: [{ type: 'output_text', text: 'OK' }] },
      ])),
    });

    const signal = new AbortController().signal;
    await callMantle('test prompt', 'openai.gpt-oss-20b', signal);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://bedrock-mantle.us-west-2.api.aws/v1/responses');
    expect(opts.method).toBe('POST');
  });

  it('el body contiene model, input y store:false', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeMantleResponse([
        { type: 'message', content: [{ type: 'output_text', text: 'OK' }] },
      ])),
    });

    const signal = new AbortController().signal;
    await callMantle('mi prompt especial', 'openai.gpt-oss-20b', signal);

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    expect(body.model).toBe('openai.gpt-oss-20b');
    expect(body.input).toBe('mi prompt especial');
    expect(body.store).toBe(false);
  });

  it('extrae output_text únicamente de output type=message → content type=output_text', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeMantleResponse([
        { type: 'message', content: [{ type: 'output_text', text: 'respuesta correcta' }] },
      ])),
    });

    const result = await callMantle('prompt', 'model', new AbortController().signal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.text).toBe('respuesta correcta');
    }
  });

  it('ignora output type=reasoning y content type=reasoning_text', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeMantleResponse([
        { type: 'reasoning', content: [{ type: 'reasoning_text', text: 'pensamiento interno secreto' }] },
        { type: 'message', content: [
          { type: 'reasoning_text', text: 'esto no debe usarse' },
          { type: 'output_text', text: 'esta es la respuesta válida' },
        ]},
      ])),
    });

    const result = await callMantle('prompt', 'model', new AbortController().signal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.text).toBe('esta es la respuesta válida');
      expect(result.text).not.toContain('pensamiento');
      expect(result.text).not.toContain('esto no debe usarse');
    }
  });

  it('retorna success=false si completed pero sin output_text', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeMantleResponse([
        { type: 'message', content: [{ type: 'reasoning_text', text: 'solo razonamiento' }] },
      ])),
    });

    const result = await callMantle('prompt', 'model', new AbortController().signal);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('output_text');
    }
  });

  it('retorna success=false e isTimeout=false con HTTP no exitoso', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await callMantle('prompt', 'model', new AbortController().signal);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.isTimeout).toBe(false);
      expect(result.error).toContain('500');
    }
  });

  it('retorna success=false e isTimeout=true con AbortError', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValueOnce(abortError);

    const result = await callMantle('prompt', 'model', new AbortController().signal);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.isTimeout).toBe(true);
    }
  });

  it('retorna success=false si AWS_REGION no está configurada', async () => {
    vi.stubEnv('AWS_REGION', '');

    const result = await callMantle('prompt', 'model', new AbortController().signal);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('AWS_REGION');
      expect(result.isTimeout).toBe(false);
    }
  });
});
