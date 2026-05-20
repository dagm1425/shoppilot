import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { reportClientError } from './client-error';

const nonEmptyString = z.string().trim().min(1);

const assistantProductSchema = z
  .object({
    productId: nonEmptyString,
    name: nonEmptyString,
    category: nonEmptyString,
    priceCents: z.number().int().nonnegative(),
    currency: z.string().trim().length(3),
    available: z.boolean(),
    rating: z.number().min(0).max(5).nullable().optional(),
    shortDescription: z.string().trim().nullable().optional(),
    primaryImageUrl: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

const assistantRecommendationSchema = z
  .object({
    summary: nonEmptyString,
    recommendedProducts: z.array(assistantProductSchema).default([]),
    comparisonSummary: z.string().trim().nullable().optional(),
    followUpPrompts: z.array(nonEmptyString).default([]),
  })
  .strict();

const assistantChatResponseSchema = z
  .object({
    requestId: nonEmptyString,
    sessionId: nonEmptyString,
    assistantMessage: nonEmptyString,
    recommendations: z.array(assistantRecommendationSchema).default([]),
    recommendedProductIds: z.array(nonEmptyString).default([]),
    retrievalMode: z.enum(['structured', 'semantic', 'hybrid']).nullable().optional(),
    followUpPrompts: z.array(nonEmptyString).default([]),
    model: z.string().trim().nullable().optional(),
    placeholder: z.boolean(),
  })
  .strict();

const assistantChatRequestSchema = z
  .object({
    message: nonEmptyString,
    sessionId: nonEmptyString,
    locale: z.string().trim().min(2).max(35).optional(),
  })
  .strict();

const textMessageContentEventSchema = z
  .object({
    type: z.literal('TEXT_MESSAGE_CONTENT'),
    delta: z.string(),
  })
  .passthrough();

const stateSnapshotEventSchema = z
  .object({
    type: z.literal('STATE_SNAPSHOT'),
    state: z.object({ chatResponse: assistantChatResponseSchema }).strict(),
  })
  .strict();

const runErrorEventSchema = z
  .object({
    type: z.literal('RUN_ERROR'),
    message: z.string().trim().min(1),
    code: z.string().trim().min(1).optional(),
  })
  .strict();

const runStartedEventSchema = z
  .object({
    type: z.literal('RUN_STARTED'),
    runId: nonEmptyString,
    threadId: nonEmptyString,
  })
  .strict();

type ApiError = {
  error?: {
    code?: string;
    message?: string;
    traceId?: string;
  };
};

export type AssistantApiProduct = z.infer<typeof assistantProductSchema>;
export type AssistantApiRecommendation = z.infer<typeof assistantRecommendationSchema>;
export type AssistantApiChatResponse = z.infer<typeof assistantChatResponseSchema>;

export type AssistantStreamError = {
  message: string;
  code?: string;
};

export type AssistantStreamHandlers = {
  signal?: AbortSignal;
  onRunStarted?: (input: { runId: string | null; threadId: string | null }) => void;
  onTextDelta?: (delta: string) => void;
  onSnapshot?: (snapshot: AssistantApiChatResponse) => void;
  onFinished?: (snapshot: AssistantApiChatResponse) => void;
  onError?: (error: AssistantStreamError) => void;
};

const RUN_ID_HEADER = 'x-run-id';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

function getApiBase(): string {
  if (!apiBase) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL is missing.');
  }

  return apiBase;
}

function createClientRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `assistant-${Date.now()}`;
}

function createSseBlockParser(onBlock: (block: string) => void) {
  let buffer = '';

  return (chunk: string) => {
    buffer += chunk.replaceAll('\r\n', '\n');

    while (true) {
      const blockBoundary = buffer.indexOf('\n\n');
      if (blockBoundary < 0) {
        break;
      }

      const block = buffer.slice(0, blockBoundary);
      buffer = buffer.slice(blockBoundary + 2);

      if (block.trim().length > 0) {
        onBlock(block);
      }
    }
  };
}

function parseSseBlock(block: string): { eventName: string; data: string | null } {
  const lines = block.split('\n');
  let eventName = 'message';
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith(':')) {
      continue;
    }

    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
      continue;
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) {
    return { eventName, data: null };
  }

  return { eventName, data: dataLines.join('\n') };
}

async function parseApiError(response: Response): Promise<AssistantStreamError> {
  let payload: ApiError = {};

  try {
    payload = (await response.json()) as ApiError;
  } catch {
    payload = {};
  }

  return {
    message: payload.error?.message ?? 'Assistant request failed.',
    code: payload.error?.code,
  };
}

function parseUserInputText(content: unknown): string {
  if (!Array.isArray(content)) {
    return '';
  }

  const textParts = content
    .filter((part): part is { type: 'text'; text: string } => {
      if (typeof part !== 'object' || part === null) {
        return false;
      }
      const candidate = part as { type?: unknown; text?: unknown };
      return candidate.type === 'text' && typeof candidate.text === 'string';
    })
    .map((part) => part.text.trim())
    .filter((text) => text.length > 0);

  return textParts.join('\n').trim();
}

export function readPromptFromAppendMessage(message: { content: unknown }): string {
  return parseUserInputText(message.content);
}

export async function streamAssistantMessage(
  rawInput: z.input<typeof assistantChatRequestSchema>,
  handlers: AssistantStreamHandlers,
): Promise<void> {
  const parsedInput = assistantChatRequestSchema.parse(rawInput);
  const requestId = createClientRequestId();

  Sentry.addBreadcrumb({
    category: 'ai_assistant',
    level: 'info',
    message: 'assistant.stream.start',
    data: {
      request_id: requestId,
      session_id: parsedInput.sessionId,
    },
  });

  let response: Response;
  try {
    response = await fetch(`${getApiBase()}/ai/chat/stream`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'x-request-id': requestId,
      },
      body: JSON.stringify({
        message: parsedInput.message,
        sessionId: parsedInput.sessionId,
        userContext: parsedInput.locale
          ? {
              locale: parsedInput.locale,
            }
          : undefined,
      }),
      signal: handlers.signal,
    });
  } catch (error) {
    if (handlers.signal?.aborted) {
      return;
    }

    reportClientError({
      error,
      context: 'assistant.stream.network',
    });

    handlers.onError?.({
      message: 'Unable to reach the assistant right now.',
      code: 'AI_NETWORK_ERROR',
    });
    return;
  }

  if (!response.ok) {
    const parsedError = await parseApiError(response);
    handlers.onError?.(parsedError);
    return;
  }

  if (!response.body) {
    handlers.onError?.({
      message: 'Assistant stream could not be read.',
      code: 'AI_STREAM_BODY_MISSING',
    });
    return;
  }

  let latestSnapshot: AssistantApiChatResponse | null = null;
  let streamRunId: string | null = response.headers.get(RUN_ID_HEADER);
  let streamThreadId: string | null = null;
  let terminalEventReached = false;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parseChunk = createSseBlockParser((block) => {
    if (terminalEventReached) {
      return;
    }

    const parsedBlock = parseSseBlock(block);
    if (!parsedBlock.data) {
      return;
    }

    let parsedData: unknown;
    try {
      parsedData = JSON.parse(parsedBlock.data);
    } catch (error) {
      reportClientError({
        error,
        context: 'assistant.stream.parse-json',
      });
      return;
    }

    const eventType =
      typeof parsedData === 'object' &&
      parsedData !== null &&
      'type' in parsedData &&
      typeof (parsedData as { type?: unknown }).type === 'string'
        ? (parsedData as { type: string }).type
        : parsedBlock.eventName;

    if (eventType === 'RUN_STARTED') {
      const parsed = runStartedEventSchema.safeParse(parsedData);
      if (parsed.success) {
        streamRunId = parsed.data.runId;
        streamThreadId = parsed.data.threadId;
      }
      handlers.onRunStarted?.({ runId: streamRunId, threadId: streamThreadId });
      return;
    }

    if (eventType === 'TEXT_MESSAGE_CONTENT') {
      const parsed = textMessageContentEventSchema.safeParse(parsedData);
      if (parsed.success) {
        handlers.onTextDelta?.(parsed.data.delta);
      }
      return;
    }

    if (eventType === 'STATE_SNAPSHOT') {
      const parsed = stateSnapshotEventSchema.safeParse(parsedData);
      if (!parsed.success) {
        reportClientError({
          error: parsed.error,
          context: 'assistant.stream.snapshot.validation',
        });
        return;
      }
      latestSnapshot = parsed.data.state.chatResponse;
      handlers.onSnapshot?.(latestSnapshot);
      return;
    }

    if (eventType === 'RUN_ERROR') {
      const parsed = runErrorEventSchema.safeParse(parsedData);
      if (!parsed.success) {
        terminalEventReached = true;
        handlers.onError?.({
          message: 'Assistant stream failed unexpectedly.',
          code: 'AI_STREAM_RUN_ERROR',
        });
        return;
      }
      terminalEventReached = true;
      handlers.onError?.({
        message: parsed.data.message,
        code: parsed.data.code ?? 'AI_INTERNAL_ERROR',
      });
      return;
    }

    if (eventType === 'RUN_FINISHED') {
      if (!latestSnapshot) {
        terminalEventReached = true;
        handlers.onError?.({
          message: 'Assistant response finished without final state.',
          code: 'AI_STREAM_SNAPSHOT_MISSING',
        });
        return;
      }
      terminalEventReached = true;
      handlers.onFinished?.(latestSnapshot);
    }
  });

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (!value || value.length === 0) {
        continue;
      }

      parseChunk(decoder.decode(value, { stream: true }));

      if (terminalEventReached) {
        break;
      }
    }

    const finalChunk = decoder.decode();
    if (!terminalEventReached && finalChunk.length > 0) {
      parseChunk(finalChunk);
    }
  } catch (error) {
    if (handlers.signal?.aborted) {
      return;
    }

    reportClientError({
      error,
      context: 'assistant.stream.read',
    });
    handlers.onError?.({
      message: 'Assistant stream failed while reading response.',
      code: 'AI_STREAM_READ_ERROR',
    });
    return;
  }

  Sentry.addBreadcrumb({
    category: 'ai_assistant',
    level: 'info',
    message: 'assistant.stream.completed',
    data: {
      request_id: requestId,
      run_id: streamRunId,
      thread_id: streamThreadId,
      session_id: parsedInput.sessionId,
      has_snapshot: latestSnapshot !== null,
    },
  });
}
