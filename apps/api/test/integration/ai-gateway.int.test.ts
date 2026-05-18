import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { parseEnv } from '../../src/config/env.js';
import { REQUEST_ID_HEADER } from '../../src/common/request-context.js';
import { createTestApp } from '../helpers/test-app.js';

type UpstreamRequest = {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
};

type UpstreamBehavior = {
  status: number;
  body: unknown;
  delayMs?: number;
};

type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
    traceId: string;
  };
};

const env = parseEnv(process.env);

function createSuccessPayload(requestId: string, sessionId: string) {
  return {
    requestId,
    sessionId,
    assistantMessage: 'I found two strong shoe options for your budget.',
    recommendations: [
      {
        summary: 'Top budget picks',
        recommendedProducts: [
          {
            productId: 'runner-pro',
            name: 'Runner Pro',
            category: 'shoes',
            priceCents: 8900,
            currency: 'USD',
            available: true,
            rating: 4.6,
            shortDescription: 'Breathable daily trainer',
          },
        ],
        comparisonSummary: null,
        followUpPrompts: ['Show lighter options'],
      },
    ],
    recommendedProductIds: ['runner-pro'],
    retrievalMode: 'semantic',
    followUpPrompts: ['Show lighter options'],
    model: 'gpt-4.1-mini',
    placeholder: false,
  };
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    request.on('error', reject);
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (raw.length === 0) {
        resolve(undefined);
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function writeJson(
  response: ServerResponse,
  status: number,
  payload: unknown,
  delayMs?: number,
): void {
  const write = () => {
    response.statusCode = status;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(payload));
  };

  if (!delayMs || delayMs <= 0) {
    write();
    return;
  }

  setTimeout(write, delayMs);
}

describe('AI gateway route (integration)', () => {
  let app: INestApplication;
  let apiBaseUrl = '';

  let upstreamServer: Server;
  let upstreamBaseUrl = '';
  let upstreamBehavior: UpstreamBehavior;
  let capturedUpstreamRequests: UpstreamRequest[] = [];

  beforeAll(async () => {
    upstreamBehavior = {
      status: 200,
      body: createSuccessPayload('request-default', 'session-default'),
    };

    upstreamServer = createServer(async (request, response) => {
      if (request.url !== '/ai/chat' || request.method !== 'POST') {
        writeJson(response, 404, {
          error: {
            code: 'UPSTREAM_NOT_FOUND',
            message: 'Not found.',
          },
        });
        return;
      }

      const body = await readJsonBody(request);
      capturedUpstreamRequests.push({
        method: request.method ?? 'UNKNOWN',
        path: request.url ?? '',
        headers: request.headers,
        body,
      });

      writeJson(response, upstreamBehavior.status, upstreamBehavior.body, upstreamBehavior.delayMs);
    });

    await new Promise<void>((resolve) => {
      upstreamServer.listen(0, '127.0.0.1', () => resolve());
    });

    const upstreamAddress = upstreamServer.address();
    if (!upstreamAddress || typeof upstreamAddress === 'string') {
      throw new Error('Failed to bind upstream test server');
    }

    upstreamBaseUrl = `http://127.0.0.1:${(upstreamAddress as AddressInfo).port}`;
    process.env.AI_SERVICE_BASE_URL = upstreamBaseUrl;

    app = await createTestApp();
    await app.listen(0);
    const address = app.getHttpServer().address();

    if (typeof address !== 'object' || !address?.port) {
      throw new Error('Failed to bind integration server port');
    }

    apiBaseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    upstreamBehavior = {
      status: 200,
      body: createSuccessPayload('request-default', 'session-default'),
    };
    capturedUpstreamRequests = [];
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve, reject) => {
      upstreamServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  it('proxies to FastAPI with sanitized context and request-id forwarding', async () => {
    upstreamBehavior = {
      status: 200,
      body: createSuccessPayload('gateway-request-id', 'session-1'),
    };

    const response = await fetch(`${apiBaseUrl}/ai/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [REQUEST_ID_HEADER]: 'gateway-request-id',
        'x-forwarded-for': '203.0.113.10',
      },
      body: JSON.stringify({
        message: 'Recommend running shoes under $100',
        sessionId: 'session-1',
        userContext: {
          locale: 'en-US',
        },
      }),
    });

    const payload = (await response.json()) as {
      assistantMessage: string;
      recommendedProductIds: string[];
      sessionId: string;
      requestId: string;
    };

    expect(response.status).toBe(201);
    expect(payload.assistantMessage).toContain('shoe options');
    expect(payload.sessionId).toBe('session-1');
    expect(payload.requestId).toBe('gateway-request-id');
    expect(payload.recommendedProductIds).toEqual(['runner-pro']);

    expect(capturedUpstreamRequests).toHaveLength(1);
    const upstreamRequest = capturedUpstreamRequests[0];
    expect(upstreamRequest?.path).toBe('/ai/chat');

    expect(upstreamRequest?.headers[REQUEST_ID_HEADER]).toBe('gateway-request-id');
    expect(upstreamRequest?.body).toMatchObject({
      message: 'Recommend running shoes under $100',
      sessionId: 'session-1',
      requestId: 'gateway-request-id',
      userContext: {
        locale: 'en-US',
        authScope: 'ANONYMOUS',
      },
    });
    expect(
      (upstreamRequest?.body as { userContext?: { userId?: string } })?.userContext?.userId,
    ).toMatch(/^anon-/);
  });

  it('rejects invalid payloads before proxying', async () => {
    const response = await fetch(`${apiBaseUrl}/ai/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.11',
      },
      body: JSON.stringify({
        message: '    ',
        sessionId: 'session-1',
      }),
    });

    const payload = (await response.json()) as ApiErrorResponse;

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('AI_VALIDATION_ERROR');
    expect(capturedUpstreamRequests).toHaveLength(0);
  });

  it('maps upstream validation failures to safe 400 responses', async () => {
    upstreamBehavior = {
      status: 422,
      body: {
        error: {
          code: 'AI_VALIDATION_ERROR',
          message: 'Invalid payload.',
          requestId: 'upstream-422',
        },
      },
    };

    const response = await fetch(`${apiBaseUrl}/ai/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.12',
      },
      body: JSON.stringify({
        message: 'Recommend daily trainers',
        sessionId: 'session-validation',
      }),
    });

    const payload = (await response.json()) as ApiErrorResponse;

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('AI_UPSTREAM_VALIDATION_ERROR');
  });

  it('maps upstream unavailability to safe 502 responses', async () => {
    upstreamBehavior = {
      status: 500,
      body: {
        error: {
          code: 'AI_INTERNAL_ERROR',
          message: 'Internal error.',
          requestId: 'upstream-500',
        },
      },
    };

    const response = await fetch(`${apiBaseUrl}/ai/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.13',
      },
      body: JSON.stringify({
        message: 'Recommend gym shoes',
        sessionId: 'session-error',
      }),
    });

    const payload = (await response.json()) as ApiErrorResponse;

    expect(response.status).toBe(502);
    expect(payload.error.code).toBe('AI_UPSTREAM_UNAVAILABLE');
  });

  it('maps upstream timeout behavior to safe 504 responses', async () => {
    upstreamBehavior = {
      status: 200,
      body: createSuccessPayload('timeout-request', 'session-timeout'),
      delayMs: env.AI_GATEWAY_TIMEOUT_MS + 150,
    };

    const response = await fetch(`${apiBaseUrl}/ai/chat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.14',
      },
      body: JSON.stringify({
        message: 'Recommend trail shoes',
        sessionId: 'session-timeout',
      }),
    });

    const payload = (await response.json()) as ApiErrorResponse;

    expect(response.status).toBe(504);
    expect(payload.error.code).toBe('AI_UPSTREAM_TIMEOUT');
  });

  it('enforces basic rate limits on assistant endpoint', async () => {
    upstreamBehavior = {
      status: 200,
      body: createSuccessPayload('rate-limit-request', 'session-rate-limit'),
    };

    let throttled = false;

    for (let index = 0; index < env.AI_RATE_LIMIT_MAX + 3; index += 1) {
      const response = await fetch(`${apiBaseUrl}/ai/chat`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.77',
        },
        body: JSON.stringify({
          message: `Recommend shoes attempt ${index + 1}`,
          sessionId: 'session-rate-limit',
        }),
      });

      if (response.status === 429) {
        const payload = (await response.json()) as ApiErrorResponse;
        expect(payload.error.code).toBe('AI_RATE_LIMITED');
        throttled = true;
        break;
      }
    }

    expect(throttled).toBe(true);
  });
});
