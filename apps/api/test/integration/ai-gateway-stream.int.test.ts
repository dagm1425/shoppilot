import { createServer, request as httpRequest, type IncomingMessage, type Server } from 'node:http';
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

type UpstreamStreamBehavior = {
  status: number;
  jsonBody?: unknown;
  frames?: string[];
  initialDelayMs?: number;
  frameDelayMs?: number;
  keepOpen?: boolean;
  contentType?: string;
};

type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
    traceId: string;
  };
};

const env = parseEnv(process.env);

const DEFAULT_STREAM_FRAMES = [
  'event: RUN_STARTED\ndata: {"type":"RUN_STARTED","runId":"run-1","threadId":"user-1:s-1"}\n\n',
  'event: TEXT_MESSAGE_START\ndata: {"type":"TEXT_MESSAGE_START","messageId":"msg-1","role":"assistant"}\n\n',
  'event: TEXT_MESSAGE_CONTENT\ndata: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg-1","delta":"hello"}\n\n',
  'event: TEXT_MESSAGE_END\ndata: {"type":"TEXT_MESSAGE_END","messageId":"msg-1"}\n\n',
  'event: STATE_SNAPSHOT\ndata: {"type":"STATE_SNAPSHOT","state":{"chatResponse":{"requestId":"gateway-stream-request","sessionId":"stream-session-1","assistantMessage":"hello","recommendations":[],"recommendedProductIds":[],"followUpPrompts":[],"placeholder":false}}}\n\n',
  'event: RUN_FINISHED\ndata: {"type":"RUN_FINISHED","runId":"run-1","threadId":"user-1:s-1"}\n\n',
];

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe('AI gateway stream route (integration)', () => {
  let app: INestApplication;
  let apiBaseUrl = '';
  let upstreamServer: Server;
  let upstreamBaseUrl = '';
  let streamBehavior: UpstreamStreamBehavior;
  let capturedUpstreamRequests: UpstreamRequest[] = [];
  let upstreamAbortObserved = false;

  beforeAll(async () => {
    streamBehavior = {
      status: 200,
      frames: DEFAULT_STREAM_FRAMES,
    };

    upstreamServer = createServer(async (request, response) => {
      if (request.url !== '/ai/chat/stream' || request.method !== 'POST') {
        response.statusCode = 404;
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
            error: {
              code: 'UPSTREAM_NOT_FOUND',
              message: 'Not found.',
            },
          }),
        );
        return;
      }

      request.on('aborted', () => {
        upstreamAbortObserved = true;
      });
      response.on('close', () => {
        if (!response.writableEnded) {
          upstreamAbortObserved = true;
        }
      });

      const body = await readJsonBody(request);
      capturedUpstreamRequests.push({
        method: request.method ?? 'UNKNOWN',
        path: request.url ?? '',
        headers: request.headers,
        body,
      });

      const startResponse = () => {
        if (response.destroyed) {
          return;
        }

        response.statusCode = streamBehavior.status;

        if (streamBehavior.status !== 200) {
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify(streamBehavior.jsonBody ?? { error: { code: 'UPSTREAM_ERROR' } }));
          return;
        }

        response.setHeader('content-type', streamBehavior.contentType ?? 'text/event-stream');
        response.setHeader('cache-control', 'no-cache');
        response.setHeader('connection', 'keep-alive');

        const frames = streamBehavior.frames ?? DEFAULT_STREAM_FRAMES;
        const frameDelayMs = streamBehavior.frameDelayMs ?? 0;
        let index = 0;

        const writeNext = () => {
          if (response.destroyed) {
            return;
          }

          if (index >= frames.length) {
            if (!streamBehavior.keepOpen) {
              response.end();
            }
            return;
          }

          response.write(frames[index] ?? '');
          index += 1;

          if (frameDelayMs > 0) {
            setTimeout(writeNext, frameDelayMs);
            return;
          }

          writeNext();
        };

        writeNext();
      };

      const initialDelayMs = streamBehavior.initialDelayMs ?? 0;
      if (initialDelayMs > 0) {
        setTimeout(startResponse, initialDelayMs);
        return;
      }

      startResponse();
    });

    await new Promise<void>((resolve) => {
      upstreamServer.listen(0, '127.0.0.1', () => resolve());
    });

    const upstreamAddress = upstreamServer.address();
    if (!upstreamAddress || typeof upstreamAddress === 'string') {
      throw new Error('Failed to bind upstream stream test server');
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
    streamBehavior = {
      status: 200,
      frames: DEFAULT_STREAM_FRAMES,
    };
    capturedUpstreamRequests = [];
    upstreamAbortObserved = false;
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

  it('proxies SSE bytes without transforming stream frames', async () => {
    streamBehavior = {
      status: 200,
      frames: DEFAULT_STREAM_FRAMES,
    };

    const response = await fetch(`${apiBaseUrl}/ai/chat/stream`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [REQUEST_ID_HEADER]: 'gateway-stream-request',
        'x-forwarded-for': '203.0.113.50',
      },
      body: JSON.stringify({
        message: 'recommend running shoes under 100',
        sessionId: 'stream-session-1',
        userContext: {
          locale: 'en-US',
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const payload = await response.text();
    expect(payload).toBe(DEFAULT_STREAM_FRAMES.join(''));

    expect(capturedUpstreamRequests).toHaveLength(1);
    const upstreamRequest = capturedUpstreamRequests[0];
    expect(upstreamRequest?.path).toBe('/ai/chat/stream');
    expect(upstreamRequest?.headers[REQUEST_ID_HEADER]).toBe('gateway-stream-request');
    expect(upstreamRequest?.body).toMatchObject({
      message: 'recommend running shoes under 100',
      sessionId: 'stream-session-1',
      requestId: 'gateway-stream-request',
      userContext: {
        locale: 'en-US',
        authScope: 'ANONYMOUS',
      },
    });
    expect(
      (upstreamRequest?.body as { userContext?: { userId?: string } })?.userContext?.userId,
    ).toMatch(/^anon-/);
  });

  it('maps stream upstream timeout to safe 504 before stream starts', async () => {
    streamBehavior = {
      status: 200,
      frames: DEFAULT_STREAM_FRAMES,
      initialDelayMs: env.AI_GATEWAY_TIMEOUT_MS + 100,
    };

    const response = await fetch(`${apiBaseUrl}/ai/chat/stream`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.51',
      },
      body: JSON.stringify({
        message: 'recommend running shoes under 100',
        sessionId: 'stream-session-timeout',
      }),
    });

    const payload = (await response.json()) as ApiErrorResponse;

    expect(response.status).toBe(504);
    expect(payload.error.code).toBe('AI_UPSTREAM_TIMEOUT');
  });

  it('maps stream upstream validation/rate-limit/unavailable statuses safely', async () => {
    const cases = [
      { upstreamStatus: 422, expectedStatus: 400, expectedCode: 'AI_UPSTREAM_VALIDATION_ERROR' },
      { upstreamStatus: 429, expectedStatus: 429, expectedCode: 'AI_RATE_LIMITED' },
      { upstreamStatus: 500, expectedStatus: 502, expectedCode: 'AI_UPSTREAM_UNAVAILABLE' },
    ] as const;

    for (const testCase of cases) {
      streamBehavior = {
        status: testCase.upstreamStatus,
        jsonBody: {
          error: {
            code: 'UPSTREAM_ERROR',
            message: 'upstream failed',
          },
        },
      };

      const response = await fetch(`${apiBaseUrl}/ai/chat/stream`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': `203.0.113.${60 + testCase.upstreamStatus}`,
        },
        body: JSON.stringify({
          message: 'recommend running shoes under 100',
          sessionId: `stream-status-${testCase.upstreamStatus}`,
        }),
      });

      const payload = (await response.json()) as ApiErrorResponse;
      expect(response.status).toBe(testCase.expectedStatus);
      expect(payload.error.code).toBe(testCase.expectedCode);
    }
  });

  it('aborts upstream stream when client disconnects', async () => {
    streamBehavior = {
      status: 200,
      frames: DEFAULT_STREAM_FRAMES,
      frameDelayMs: 60,
      keepOpen: true,
    };

    await new Promise<void>((resolve, reject) => {
      const gatewayRequest = httpRequest(
        `${apiBaseUrl}/ai/chat/stream`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': '203.0.113.99',
          },
        },
        (gatewayResponse) => {
          gatewayResponse.once('data', () => {
            gatewayResponse.destroy();
            resolve();
          });
          gatewayResponse.on('error', reject);
        },
      );

      gatewayRequest.on('error', reject);
      gatewayRequest.end(
        JSON.stringify({
          message: 'recommend running shoes under 100',
          sessionId: 'stream-session-abort',
        }),
      );
    });
    await sleep(200);

    expect(upstreamAbortObserved).toBe(true);
  });
});
