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
  type AiChatRequest,
} from './ai.schemas.js';

const RUN_ID_HEADER = 'x-run-id';
const THREAD_ID_HEADER = 'x-thread-id';
const AI_PROVIDER_HEADER = 'x-ai-provider';
const AI_MODEL_HEADER = 'x-ai-model';
const AI_TOKEN_PROMPT_HEADER = 'x-ai-token-prompt';
const AI_TOKEN_COMPLETION_HEADER = 'x-ai-token-completion';
const AI_TOKEN_TOTAL_HEADER = 'x-ai-token-total';
const AI_COST_ESTIMATE_HEADER = 'x-ai-cost-estimate-usd';
const AI_FALLBACK_REASON_HEADER = 'x-ai-fallback-reason';

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
  runId: string;
  threadId: string;
  sessionId: string;
  userOrIpKey: string;
  upstreamPayload: unknown;
};

type UpstreamResponseTelemetry = {
  runId: string;
  threadId: string;
  provider: string | null;
  model: string | null;
  tokenUsage: {
    prompt: number | null;
    completion: number | null;
    total: number | null;
  };
  costEstimateUsd: number | null;
  fallbackReason: string | null;
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

  async chatStream(
    input: AiChatRequest,
    request: RequestWithContext,
    response: ExpressResponse,
  ): Promise<void> {
    const startedAt = Date.now();
    const context = this.buildUpstreamProxyContext(input, request);
    this.captureObservabilityProbeIfRequested(request, context.requestId);

    this.logger.log({
      event: 'ai.gateway.stream_started',
      timestamp: new Date().toISOString(),
      request_id: context.requestId,
      run_id: context.runId,
      thread_id: context.threadId,
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
        context.runId,
      );
    } catch (error) {
      this.handleUpstreamRequestError({
        error,
        requestId: context.requestId,
        runId: context.runId,
        threadId: context.threadId,
        sessionId: context.sessionId,
        userOrIpKey: context.userOrIpKey,
        startedAt,
      });
    }

    const { response: upstreamResponse, abortController, cleanupTimeout } = upstreamRequest;
    cleanupTimeout();

    if (!upstreamResponse.ok) {
      const upstreamError = await this.parseUpstreamError(upstreamResponse);
      const mapped = this.mapUpstreamStatus(upstreamResponse.status);

      this.logGatewayEvent({
        route: '/ai/chat/stream',
        requestId: context.requestId,
        runId: context.runId,
        threadId: context.threadId,
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
        context.runId,
        context.threadId,
      );

      this.throwMappedGatewayError(mapped);
    }

    const telemetry = this.extractUpstreamTelemetry(upstreamResponse.headers, context);
    const streamBody = upstreamResponse.body;
    if (!streamBody) {
      const mapped = this.mapUpstreamStatus(HttpStatus.BAD_GATEWAY);
      this.logGatewayEvent({
        route: '/ai/chat/stream',
        requestId: context.requestId,
        runId: telemetry.runId,
        threadId: telemetry.threadId,
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
        telemetry.runId,
        telemetry.threadId,
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
    response.setHeader(RUN_ID_HEADER, telemetry.runId);
    response.setHeader(THREAD_ID_HEADER, telemetry.threadId);
    response.setHeader('content-type', contentType);
    response.setHeader('cache-control', 'no-cache, no-transform');
    response.setHeader('connection', 'keep-alive');

    if (telemetry.provider) {
      response.setHeader(AI_PROVIDER_HEADER, telemetry.provider);
    }
    if (telemetry.model) {
      response.setHeader(AI_MODEL_HEADER, telemetry.model);
    }
    if (telemetry.tokenUsage.prompt !== null) {
      response.setHeader(AI_TOKEN_PROMPT_HEADER, String(telemetry.tokenUsage.prompt));
    }
    if (telemetry.tokenUsage.completion !== null) {
      response.setHeader(AI_TOKEN_COMPLETION_HEADER, String(telemetry.tokenUsage.completion));
    }
    if (telemetry.tokenUsage.total !== null) {
      response.setHeader(AI_TOKEN_TOTAL_HEADER, String(telemetry.tokenUsage.total));
    }
    if (telemetry.costEstimateUsd !== null) {
      response.setHeader(AI_COST_ESTIMATE_HEADER, telemetry.costEstimateUsd.toFixed(8));
    }
    if (telemetry.fallbackReason) {
      response.setHeader(AI_FALLBACK_REASON_HEADER, telemetry.fallbackReason);
    }

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
        route: '/ai/chat/stream',
        requestId: context.requestId,
        runId: telemetry.runId,
        threadId: telemetry.threadId,
        sessionId: context.sessionId,
        userOrIpKey: context.userOrIpKey,
        status: HttpStatus.OK,
        latencyMs: Date.now() - startedAt,
        outcome: 'success',
        transport: 'sse',
        provider: telemetry.provider,
        model: telemetry.model,
        tokenUsage: telemetry.tokenUsage,
        costEstimateUsd: telemetry.costEstimateUsd,
        fallbackReason: telemetry.fallbackReason,
      });
    } catch (error) {
      const aborted = this.isAbortLikeError(error);
      this.logGatewayEvent({
        route: '/ai/chat/stream',
        requestId: context.requestId,
        runId: telemetry.runId,
        threadId: telemetry.threadId,
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
          telemetry.runId,
          telemetry.threadId,
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
    path: '/ai/chat/stream',
    body: unknown,
    requestId: string,
    runId: string,
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
          [RUN_ID_HEADER]: runId,
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
    const runId = request.header(RUN_ID_HEADER)?.trim() || `run-${randomUUID()}`;
    const threadId = `${sanitizedUserId}:${input.sessionId}`;

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
      runId,
      threadId,
      sessionId: input.sessionId,
      userOrIpKey,
      upstreamPayload,
    };
  }

  private handleUpstreamRequestError(input: {
    error: unknown;
    requestId: string;
    runId: string;
    threadId: string;
    sessionId: string;
    userOrIpKey: string;
    startedAt: number;
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
      route: '/ai/chat/stream',
      requestId: input.requestId,
      runId: input.runId,
      threadId: input.threadId,
      sessionId: input.sessionId,
      userOrIpKey: input.userOrIpKey,
      status: mapped.status,
      latencyMs: Date.now() - input.startedAt,
      outcome: mapped.code,
      transport: 'sse',
    });
    this.captureMappedGatewayException(
      input.error instanceof Error ? input.error : new Error('AI gateway upstream fetch failed.'),
      mapped.errorType,
      input.requestId,
      'sse',
      input.runId,
      input.threadId,
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
    transport: 'sse',
    runId?: string,
    threadId?: string,
  ): void {
    Sentry.withScope((scope) => {
      scope.setTag('flow', 'ai_assistant');
      scope.setTag('transport', transport);
      scope.setTag('error_type', errorType);
      scope.setTag('request_id', requestId);
      if (runId) {
        scope.setTag('run_id', runId);
      }
      if (threadId) {
        scope.setTag('thread_id', threadId);
      }
      Sentry.captureException(error);
    });
  }

  private captureObservabilityProbeIfRequested(
    request: RequestWithContext,
    requestId: string,
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
      'sse',
    );
  }

  private logGatewayEvent(input: {
    route: '/ai/chat/stream';
    requestId: string;
    runId: string;
    threadId: string;
    sessionId: string;
    userOrIpKey: string;
    status: number;
    latencyMs: number;
    outcome: string;
    transport?: 'sse';
    upstreamStatus?: number;
    upstreamCode?: string;
    provider?: string | null;
    model?: string | null;
    tokenUsage?: {
      prompt: number | null;
      completion: number | null;
      total: number | null;
    };
    costEstimateUsd?: number | null;
    fallbackReason?: string | null;
  }): void {
    this.logger.log({
      event: 'ai.gateway.proxy',
      timestamp: new Date().toISOString(),
      route: input.route,
      request_id: input.requestId,
      run_id: input.runId,
      thread_id: input.threadId,
      session_id: input.sessionId,
      user_or_ip_key: input.userOrIpKey,
      status: input.status,
      latency_ms: input.latencyMs,
      outcome: input.outcome,
      transport: input.transport ?? 'sse',
      llm_provider: input.provider,
      llm_model: input.model,
      token_usage_prompt: input.tokenUsage?.prompt ?? null,
      token_usage_completion: input.tokenUsage?.completion ?? null,
      token_usage_total: input.tokenUsage?.total ?? null,
      cost_estimate_usd: input.costEstimateUsd ?? null,
      fallback_reason: input.fallbackReason ?? null,
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

  private extractUpstreamTelemetry(
    headers: Headers,
    context: UpstreamProxyContext,
  ): UpstreamResponseTelemetry {
    const tokenPrompt = this.parseNumericHeader(headers.get(AI_TOKEN_PROMPT_HEADER));
    const tokenCompletion = this.parseNumericHeader(headers.get(AI_TOKEN_COMPLETION_HEADER));
    const tokenTotal = this.parseNumericHeader(headers.get(AI_TOKEN_TOTAL_HEADER));

    return {
      runId: headers.get(RUN_ID_HEADER)?.trim() || context.runId,
      threadId: headers.get(THREAD_ID_HEADER)?.trim() || context.threadId,
      provider: headers.get(AI_PROVIDER_HEADER)?.trim() || null,
      model: headers.get(AI_MODEL_HEADER)?.trim() || null,
      tokenUsage: {
        prompt: tokenPrompt,
        completion: tokenCompletion,
        total: tokenTotal,
      },
      costEstimateUsd: this.parseNumericHeader(headers.get(AI_COST_ESTIMATE_HEADER)),
      fallbackReason: headers.get(AI_FALLBACK_REASON_HEADER)?.trim() || null,
    };
  }

  private parseNumericHeader(rawValue: string | null): number | null {
    if (!rawValue) {
      return null;
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return parsed;
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
