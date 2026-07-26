import { SignatureV4 } from '@smithy/signature-v4';
import { HttpRequest } from '@smithy/protocol-http';
import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';

/**
 * Mantle Responses API response structure.
 */
interface MantleResponseOutput {
  type: string;
  content?: { type: string; text?: string }[];
}

interface MantleResponse {
  id: string;
  status: string;
  output: MantleResponseOutput[];
  error?: { message: string };
}

export type MantleCallResult =
  | {
      success: true;
      text: string;
    }
  | {
      success: false;
      error: string;
      isTimeout: boolean;
    };

/**
 * Calls the Bedrock Mantle Responses API with AWS SigV4 signing.
 *
 * - Uses Lambda execution role credentials via defaultProvider()
 * - Signs with service "bedrock-mantle" in process.env.AWS_REGION
 * - Sends { model, input, store: false }
 * - Extracts output_text from response, ignoring reasoning/reasoning_text
 * - Timeout is controlled by the caller via AbortSignal
 */
export async function callMantle(
  prompt: string,
  modelId: string,
  signal: AbortSignal,
): Promise<MantleCallResult> {
  const region = process.env.AWS_REGION;

  if (!region || region.trim() === '') {
    return {
      success: false,
      error: 'La variable de entorno AWS_REGION no está configurada.',
      isTimeout: false,
    };
  }

  const hostname = `bedrock-mantle.${region}.api.aws`;
  const path = '/v1/responses';

  const body = JSON.stringify({
    model: modelId,
    input: prompt,
    store: false,
  });

  // Build the HTTP request for signing
  const request = new HttpRequest({
    method: 'POST',
    protocol: 'https:',
    hostname,
    path,
    headers: {
      'Content-Type': 'application/json',
      host: hostname,
    },
    body,
  });

  try {
    // Sign the request with SigV4 (inside try to catch credential/signing errors)
    const signer = new SignatureV4({
      service: 'bedrock-mantle',
      region,
      credentials: defaultProvider(),
      sha256: Sha256,
    });

    const signedRequest = await signer.sign(request);

    // Execute the HTTP request using native fetch
    const url = `https://${hostname}${path}`;
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(signedRequest.headers)) {
      if (typeof value === 'string') {
        headers[key] = value;
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal,
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Mantle respondió con HTTP ${response.status}`,
        isTimeout: false,
      };
    }

    const data = await response.json() as MantleResponse;

    if (data.status !== 'completed') {
      return {
        success: false,
        error: `Mantle status: ${data.status}${data.error?.message ? ` - ${data.error.message}` : ''}`,
        isTimeout: false,
      };
    }

    // Extract output_text from output array, ignoring reasoning/reasoning_text
    const text = extractOutputText(data.output);

    if (!text) {
      return {
        success: false,
        error: 'Mantle no devolvió output_text en la respuesta.',
        isTimeout: false,
      };
    }

    return { success: true, text };
  } catch (err: unknown) {
    const isAbort = err instanceof Error && (
      err.name === 'AbortError' ||
      err.message.includes('aborted')
    );

    if (isAbort) {
      return {
        success: false,
        error: 'Timeout: Mantle no respondió en el tiempo esperado.',
        isTimeout: true,
      };
    }

    const message = err instanceof Error ? err.name : 'UnknownError';
    return {
      success: false,
      error: `Error de conexión con Mantle: ${message}`,
      isTimeout: false,
    };
  }
}

/**
 * Extracts ALL output_text blocks from Mantle response output array.
 * Only considers elements with type = "message", and within their content
 * only elements with type = "output_text". Ignores "reasoning" and "reasoning_text".
 * Concatenates all output_text blocks in order.
 */
function extractOutputText(output: MantleResponseOutput[]): string | null {
  const parts: string[] = [];
  for (const item of output) {
    if (item.type !== 'message') continue;
    if (!item.content) continue;

    for (const block of item.content) {
      if (block.type === 'output_text' && block.text) {
        parts.push(block.text);
      }
    }
  }
  return parts.length > 0 ? parts.join('') : null;
}
