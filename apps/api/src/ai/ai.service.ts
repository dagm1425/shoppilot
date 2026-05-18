import { createHash, randomUUID } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Request, Response as ExpressResponse } from 'express';
import { REQUEST_ID_HEADER, type RequestWithContext } from '../common/request-context.js';
import { parseEnv } from '../config/env.js';
import {
  aiUpstreamChatRequestSchema,
  parseAiUpstreamResponseOrThrow,
  type AiChatRequest,
  type AiChatResponse,
} from './ai.schemas.js';

type AiUpstreamErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
  };
};

type GatewayErrorMapping = {
  status: HttpStatus;
  code: string;
  message: string;
  errorType: string;
};

type UpstreamProxyContext = {
  requestId: string;
  sessionId: string;
  userOrIpKey: string;
  upstreamPayload: unknown;
};

type OpenUpstreamRequestResult = {
  response: Response;
  abortController: AbortController;
  cleanupTimeout: () => void;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly env = parseEnv(process.env);

  async chat(input: AiChatRequest, request: RequestWithContext): Promise<AiChatResponse> {
    const startedAt = Date.now();
    const context = this.buildUpstreamProxyContext(input, request);
    this.captureObservabilityProbeIfRequested(request, context.requestId, 'json');

    let upstreamResponse: Response;
    try {
      const upstream = await this.openUpstreamRequest(
        '/ai/chat',
        context.upstreamPayload,
        context.requestId,
      );
      upstreamResponse = upstream.response;
      upstream.cleanupTimeout();
    } catch (error) {
      this.handleUpstreamRequestError({
        error,
        requestId: context.requestId,
        sessionId: context.sessionId,
        userOrIpKey: context.userOrIpKey,
        startedAt,
        transport: 'json',
      });
    }

    if (!upstreamResponse.ok) {
      const upstreamError = await this.parseUpstreamError(upstreamResponse);
      const mapped = this.mapUpstreamStatus(upstreamResponse.status);

      this.logGatewayEvent({
        requestId: context.requestId,
        sessionId: context.sessionId,
        userOrIpKey: context.userOrIpKey,
        status: mapped.status,
        latencyMs: Date.now() - startedAt,
        outcome: mapped.code,
        upstreamStatus: upstreamResponse.status,
        upstreamCode: upstreamError.error?.code,
      });
      this.captureMappedGatewayException(
        new Error(`AI upstream returned non-ok status: ${upstreamResponse.status}`),
        mapped.errorType,
        context.requestId,
        'json',
      );

      this.throwMappedGatewayError(mapped);
    }

    const responsePayload = await this.parseUpstreamSuccessPayload(upstreamResponse);

    this.logGatewayEvent({
      requestId: context.requestId,
      sessionId: responsePayload.sessionId,
      userOrIpKey: context.userOrIpKey,
      status: HttpStatus.OK,
      latencyMs: Date.now() - startedAt,
      outcome: 'success',
      transport: 'json',
    });

    return responsePayload;
  }

  async chatStream(
    input: AiChatRequest,
    request: RequestWithContext,
    response: ExpressResponse,
  ): Promise<void> {
    const startedAt = Date.now();
    const context = this.buildUpstreamProxyContext(input, request);
    this.captureObservabilityProbeIfRequested(request, context.requestId, 'sse');

    this.logger.log({
      event: 'ai.gateway.stream_started',
      timestamp: new Date().toISOString(),
      request_id: context.requestId,
      session_id: context.sessionId,
      user_or_ip_key: context.userOrIpKey,
      transport: 'sse',
    });

    let upstreamRequest: OpenUpstreamRequestResult;
    try {
      upstreamRequest = await this.openUpstreamRequest(
        '/ai/chat/stream',
        context.upstreamPayload,
        context.requestId,
      );
    } catch (error) {
      this.handleUpstreamRequestError({
        error,
        requestId: context.requestId,
        sessionId: context.sessionId,
        userOrIpKey: context.userOrIpKey,
        startedAt,
        transport: 'sse',
      });
    }

    const { response: upstreamResponse, abortController, cleanupTimeout } = upstreamRequest;
    cleanupTimeout();

    if (!upstreamResponse.ok) {
      const upstreamError = await this.parseUpstreamError(upstreamResponse);
      const mapped = this.mapUpstreamStatus(upstreamResponse.status);

      this.logGatewayEvent({
        requestId: context.requestId,
        sessionId: context.sessionId,
        userOrIpKey: context.userOrIpKey,
        status: mapped.status,
        latencyMs: Date.now() - startedAt,
        outcome: mapped.code,
        upstreamStatus: upstreamResponse.status,
        upstreamCode: upstreamError.error?.code,
        transport: 'sse',
      });
      this.captureMappedGatewayException(
        new Error(`AI stream upstream returned non-ok status: ${upstreamResponse.status}`),
        mapped.errorType,
        context.requestId,
        'sse',
      );

      this.throwMappedGatewayError(mapped);
    }

    const streamBody = upstreamResponse.body;
    if (!streamBody) {
      const mapped = this.mapUpstreamStatus(HttpStatus.BAD_GATEWAY);
      this.logGatewayEvent({
        requestId: context.requestId,
        sessionId: context.sessionId,
        userOrIpKey: context.userOrIpKey,
        status: mapped.status,
        latencyMs: Date.now() - startedAt,
        outcome: 'AI_UPSTREAM_RESPONSE_INVALID',
        transport: 'sse',
      });
      this.captureMappedGatewayException(
        new Error('AI stream upstream returned an empty body'),
        'upstream_unavailable',
        context.requestId,
        'sse',
      );
      throw new HttpException(
        {
          code: 'AI_UPSTREAM_RESPONSE_INVALID',
          message: 'Assistant service returned an unreadable response.',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const contentType = upstreamResponse.headers.get('content-type') ?? 'text/event-stream';
    response.status(HttpStatus.OK);
    response.setHeader(REQUEST_ID_HEADER, context.requestId);
    response.setHeader('content-type', contentType);
    response.setHeader('cache-control', 'no-cache, no-transform');
    response.setHeader('connection', 'keep-alive');

    if (typeof response.flushHeaders === 'function') {
      response.flushHeaders();
    }

    const onClientDisconnect = () => {
      abortController.abort();
    };
    request.on('aborted', onClientDisconnect);
    response.on('close', onClientDisconnect);

    try {
      const reader = streamBody.getReader();

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        if (!value || value.length === 0) {
          continue;
        }

        if (response.writableEnded || response.destroyed) {
          abortController.abort();
          break;
        }

        response.write(Buffer.from(value));
      }

      if (!response.writableEnded) {
        response.end();
      }

      this.logGatewayEvent({
        requestId: context.requestId,
        sessionId: context.sessionId,
        userOrIpKey: context.userOrIpKey,
        status: HttpStatus.OK,
        latencyMs: Date.now() - startedAt,
        outcome: 'success',
        transport: 'sse',
      });
    } catch (error) {
      const aborted = this.isAbortLikeError(error);
      this.logGatewayEvent({
        requestId: context.requestId,
        sessionId: context.sessionId,
        userOrIpKey: context.userOrIpKey,
        status: aborted ? HttpStatus.OK : HttpStatus.BAD_GATEWAY,
        latencyMs: Date.now() - startedAt,
        outcome: aborted ? 'client_disconnected' : 'AI_UPSTREAM_STREAM_ERROR',
        transport: 'sse',
      });

      if (!aborted) {
        this.captureMappedGatewayException(
          error instanceof Error ? error : new Error('AI stream proxy failed.'),
          'stream_proxy_error',
          context.requestId,
          'sse',
        );
      }

      if (!response.writableEnded) {
        response.end();
      }
    } finally {
      request.off('aborted', onClientDisconnect);
      response.off('close', onClientDisconnect);
      abortController.abort();
    }
  }

  private async openUpstreamRequest(
    path: '/ai/chat' | '/ai/chat/stream',
    body: unknown,
    requestId: string,
  ): Promise<OpenUpstreamRequestResult> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => {
      abortController.abort();
    }, this.env.AI_GATEWAY_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.env.AI_SERVICE_BASE_URL}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [REQUEST_ID_HEADER]: requestId,
        },
        body: JSON.stringify(body),
        signal: abortController.signal,
      });

      return {
        response,
        abortController,
        cleanupTimeout: () => clearTimeout(timeout),
      };
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  private async parseUpstreamSuccessPayload(response: Response): Promise<AiChatResponse> {
    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new HttpException(
        {
          code: 'AI_UPSTREAM_RESPONSE_INVALID',
          message: 'Assistant service returned an unreadable response.',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }

    return parseAiUpstreamResponseOrThrow(payload);
  }

  private async parseUpstreamError(response: Response): Promise<AiUpstreamErrorPayload> {
    try {
      return (await response.json()) as AiUpstreamErrorPayload;
    } catch {
      return {};
    }
  }

  private mapUpstreamStatus(status: number): GatewayErrorMapping {
    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      return {
        status: HttpStatus.TOO_MANY_REQUESTS,
        code: 'AI_RATE_LIMITED',
        message: 'Too many assistant requests. Please wait and retry.',
        errorType: 'upstream_rate_limited',
      };
    }

    if (
      status === HttpStatus.BAD_REQUEST
      || status === HttpStatus.UNAUTHORIZED
      || status === HttpStatus.FORBIDDEN
      || status === HttpStatus.UNPROCESSABLE_ENTITY
    ) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'AI_UPSTREAM_VALIDATION_ERROR',
        message: 'Assistant request could not be processed.',
        errorType: 'upstream_validation',
      };
    }

    if (status === HttpStatus.REQUEST_TIMEOUT || status === HttpStatus.GATEWAY_TIMEOUT) {
      return {
        status: HttpStatus.GATEWAY_TIMEOUT,
        code: 'AI_UPSTREAM_TIMEOUT',
        message: 'Assistant request timed out. Please try again.',
        errorType: 'upstream_timeout',
      };
    }

    return {
      status: HttpStatus.BAD_GATEWAY,
      code: 'AI_UPSTREAM_UNAVAILABLE',
      message: 'Assistant service is unavailable right now. Please try again.',
      errorType: 'upstream_unavailable',
    };
  }

  private buildUpstreamProxyContext(
    input: AiChatRequest,
    request: RequestWithContext,
  ): UpstreamProxyContext {
    const requestId = request.requestId ?? request.header(REQUEST_ID_HEADER) ?? randomUUID();
    const userOrIpKey = this.resolveUserOrIpKey(request);
    const sanitizedUserId = this.resolveSanitizedUserId(request, userOrIpKey);
    const authScope = request.user?.role ?? 'ANONYMOUS';

    const upstreamPayload = aiUpstreamChatRequestSchema.parse({
      message: input.message,
      sessionId: input.sessionId,
      requestId,
      userContext: {
        userId: sanitizedUserId,
        locale: input.userContext?.locale,
        authScope,
      },
    });

    return {
      requestId,
      sessionId: input.sessionId,
      userOrIpKey,
      upstreamPayload,
    };
  }

  private handleUpstreamRequestError(input: {
    error: unknown;
    requestId: string;
    sessionId: string;
    userOrIpKey: string;
    startedAt: number;
    transport: 'json' | 'sse';
  }): never {
    const isTimeout = this.isAbortLikeError(input.error);
    const mapped = isTimeout
      ? ({
          status: HttpStatus.GATEWAY_TIMEOUT,
          code: 'AI_UPSTREAM_TIMEOUT',
          message: 'Assistant request timed out. Please try again.',
          errorType: 'timeout',
        } satisfies GatewayErrorMapping)
      : ({
          status: HttpStatus.BAD_GATEWAY,
          code: 'AI_UPSTREAM_UNAVAILABLE',
          message: 'Assistant service is unavailable right now. Please try again.',
          errorType: 'upstream_unavailable',
        } satisfies GatewayErrorMapping);

    this.logGatewayEvent({
      requestId: input.requestId,
      sessionId: input.sessionId,
      userOrIpKey: input.userOrIpKey,
      status: mapped.status,
      latencyMs: Date.now() - input.startedAt,
      outcome: mapped.code,
      transport: input.transport,
    });
    this.captureMappedGatewayException(
      input.error instanceof Error ? input.error : new Error('AI gateway upstream fetch failed.'),
      mapped.errorType,
      input.requestId,
      input.transport,
    );

    this.throwMappedGatewayError(mapped);
  }

  private throwMappedGatewayError(mapped: GatewayErrorMapping): never {
    throw new HttpException(
      {
        code: mapped.code,
        message: mapped.message,
      },
      mapped.status,
    );
  }

  private resolveUserOrIpKey(request: RequestWithContext): string {
    if (request.user?.id) {
      return `user:${request.user.id}`;
    }

    return `ip:${this.resolveRequestIp(request)}`;
  }

  private resolveRequestIp(request: RequestWithContext): string {
    const typedRequest = request as Request & {
      ips?: string[];
    };
    const forwardedFor = request.header('x-forwarded-for');
    const forwardedIp = forwardedFor?.split(',')[0]?.trim();

    return typedRequest.ips?.[0] ?? forwardedIp ?? request.ip ?? 'unknown-ip';
  }

  private resolveSanitizedUserId(request: RequestWithContext, userOrIpKey: string): string {
    if (request.user?.id) {
      return request.user.id;
    }

    const anonymousHash = createHash('sha256')
      .update(userOrIpKey)
      .digest('hex')
      .slice(0, 16);

    return `anon-${anonymousHash}`;
  }

  private captureMappedGatewayException(
    error: Error,
    errorType: string,
    requestId: string,
    transport: 'json' | 'sse',
  ): void {
    Sentry.withScope((scope) => {
      scope.setTag('flow', 'ai_assistant');
      scope.setTag('transport', transport);
      scope.setTag('error_type', errorType);
      scope.setTag('request_id', requestId);
      Sentry.captureException(error);
    });
  }

  private captureObservabilityProbeIfRequested(
    request: RequestWithContext,
    requestId: string,
    transport: 'json' | 'sse',
  ): void {
    if (this.env.NODE_ENV === 'production') {
      return;
    }

    if (request.header('x-ai-observability-probe') !== 'sentry') {
      return;
    }

    this.captureMappedGatewayException(
      new Error('AI gateway observability probe triggered.'),
      'observability_probe',
      requestId,
      transport,
    );
  }

  private logGatewayEvent(input: {
    requestId: string;
    sessionId: string;
    userOrIpKey: string;
    status: number;
    latencyMs: number;
    outcome: string;
    transport?: 'json' | 'sse';
    upstreamStatus?: number;
    upstreamCode?: string;
  }): void {
    this.logger.log({
      event: 'ai.gateway.proxy',
      timestamp: new Date().toISOString(),
      request_id: input.requestId,
      session_id: input.sessionId,
      user_or_ip_key: input.userOrIpKey,
      status: input.status,
      latency_ms: input.latencyMs,
      outcome: input.outcome,
      transport: input.transport ?? 'json',
      ...(input.upstreamStatus
        ? {
            upstream_status: input.upstreamStatus,
          }
        : {}),
      ...(input.upstreamCode
        ? {
            upstream_code: input.upstreamCode,
          }
        : {}),
    });
  }

  private isAbortLikeError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const typedError = error as {
      name?: unknown;
      message?: unknown;
      code?: unknown;
      cause?: {
        name?: unknown;
        message?: unknown;
        code?: unknown;
      };
    };

    const candidates = [
      typedError.name,
      typedError.code,
      typedError.message,
      typedError.cause?.name,
      typedError.cause?.code,
      typedError.cause?.message,
    ]
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.toLowerCase());

    return candidates.some(
      (value) => value.includes('abort') || value.includes('timeout') || value === 'aborted',
    );
  }
}
