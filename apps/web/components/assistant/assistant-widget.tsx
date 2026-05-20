'use client';

import Link from 'next/link';
import { BotIcon, ChevronDownIcon, SendHorizontalIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AssistantModalPrimitive,
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePartPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type AppendMessage,
  type ExternalStoreAdapter,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import {
  readPromptFromAppendMessage,
  streamAssistantMessage,
  type AssistantApiChatResponse,
  type AssistantApiProduct,
} from '../../lib/assistant-api';
import { useAuthStore } from '../../lib/auth-store';
import { fetchCatalogProductDetails } from '../../lib/catalog-api';

const ASSISTANT_SESSION_STORAGE_KEY = 'shoppilot.assistant.session-id';

type RequestState = 'idle' | 'loading' | 'success' | 'error';
type ChatMessageRole = 'user' | 'assistant';

type ChatMessage = {
  id: string;
  role: ChatMessageRole;
  content: string;
  createdAt: Date;
};

type ProductImageUrlMap = Record<string, string>;

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}`;
}

function readOrCreateSessionId(): string {
  const fallback = createId('assistant-session');

  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const existing = window.localStorage.getItem(ASSISTANT_SESSION_STORAGE_KEY)?.trim();
    if (existing && existing.length > 0) {
      return existing;
    }

    window.localStorage.setItem(ASSISTANT_SESSION_STORAGE_KEY, fallback);
    return fallback;
  } catch {
    return fallback;
  }
}

function rotateStoredSessionId(): string {
  const nextSessionId = createId('assistant-session');

  if (typeof window === 'undefined') {
    return nextSessionId;
  }

  try {
    window.localStorage.setItem(ASSISTANT_SESSION_STORAGE_KEY, nextSessionId);
  } catch {
    // Ignore storage write errors; widget can still continue with in-memory session.
  }

  return nextSessionId;
}

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

function buildRecommendedProducts(payload: AssistantApiChatResponse | null): AssistantApiProduct[] {
  if (!payload) {
    return [];
  }

  const products = payload.recommendations.flatMap((recommendation) => recommendation.recommendedProducts);
  const deduped = new Map<string, AssistantApiProduct>();

  for (const product of products) {
    if (!deduped.has(product.productId)) {
      deduped.set(product.productId, product);
    }
  }

  if (deduped.size > 0) {
    return Array.from(deduped.values());
  }

  return payload.recommendedProductIds.map((productId) => ({
    productId,
    name: `Recommended item ${productId}`,
    category: 'Recommendation',
    priceCents: 0,
    currency: 'USD',
    available: true,
    rating: null,
    shortDescription: 'Product details are not available in this response.',
  }));
}

function resolveComparisonSummary(payload: AssistantApiChatResponse | null): string | null {
  if (!payload) {
    return null;
  }

  for (const recommendation of payload.recommendations) {
    if (recommendation.comparisonSummary && recommendation.comparisonSummary.trim().length > 0) {
      return recommendation.comparisonSummary;
    }
  }

  return null;
}

const AssistantMessageTextPart = () => {
  return (
    <p className="whitespace-pre-wrap text-sm leading-5">
      <MessagePartPrimitive.Text />
    </p>
  );
};

const AssistantThreadMessage = () => {
  return (
    <MessagePrimitive.Root className="w-full">
      <MessagePrimitive.If user>
        <div className="ml-auto w-full max-w-[88%] rounded-md border border-border bg-muted px-2.5 py-1.5 text-sm text-foreground">
          <MessagePrimitive.Parts>
            {({ part }) => {
              if (part.type !== 'text') {
                return null;
              }
              return <MessagePartPrimitive.Text className="whitespace-pre-wrap text-sm leading-5" />;
            }}
          </MessagePrimitive.Parts>
        </div>
      </MessagePrimitive.If>
      <MessagePrimitive.If assistant>
        <div className="mr-auto w-full max-w-[88%] rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground">
          <MessagePrimitive.Parts components={{ Text: AssistantMessageTextPart }} />
        </div>
      </MessagePrimitive.If>
    </MessagePrimitive.Root>
  );
};

type AssistantModalContentProps = {
  resetToken: number;
};

function AssistantModalContent({ resetToken }: AssistantModalContentProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState(() => readOrCreateSessionId());
  const [requestState, setRequestState] = useState<RequestState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [lastPrompt, setLastPrompt] = useState('');
  const [latestPayload, setLatestPayload] = useState<AssistantApiChatResponse | null>(null);
  const [productImageUrls, setProductImageUrls] = useState<ProductImageUrlMap>({});
  const [hasStreamingAssistantText, setHasStreamingAssistantText] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const resetChatState = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setSessionId(readOrCreateSessionId());
    setMessages([]);
    setRequestState('idle');
    setErrorMessage('');
    setLastPrompt('');
    setLatestPayload(null);
    setProductImageUrls({});
    setHasStreamingAssistantText(false);
  }, []);

  useEffect(() => {
    if (resetToken === 0) {
      return;
    }

    resetChatState();
  }, [resetChatState, resetToken]);

  const recommendedProducts = useMemo(
    () => buildRecommendedProducts(latestPayload),
    [latestPayload],
  );
  const comparisonSummary = useMemo(
    () => resolveComparisonSummary(latestPayload),
    [latestPayload],
  );
  const isRunning = requestState === 'loading';

  useEffect(() => {
    if (recommendedProducts.length === 0) {
      setProductImageUrls({});
      return;
    }

    let active = true;

    const known: ProductImageUrlMap = {};
    const missingProductIds: string[] = [];
    for (const product of recommendedProducts) {
      if (typeof product.primaryImageUrl === 'string' && product.primaryImageUrl.trim().length > 0) {
        known[product.productId] = product.primaryImageUrl.trim();
        continue;
      }
      missingProductIds.push(product.productId);
    }

    async function hydrateMissingImages() {
      if (!active) {
        return;
      }

      if (missingProductIds.length === 0) {
        setProductImageUrls(known);
        return;
      }

      const resolvedEntries = await Promise.all(
        missingProductIds.map(async (productId) => {
          try {
            const detailsResult = await fetchCatalogProductDetails(productId);
            if (!detailsResult.ok) {
              return [productId, null] as const;
            }

            const imageUrl = detailsResult.data.product.images[0] ?? null;
            return [productId, imageUrl] as const;
          } catch {
            return [productId, null] as const;
          }
        }),
      );

      if (!active) {
        return;
      }

      const resolvedMap: ProductImageUrlMap = { ...known };
      for (const [productId, imageUrl] of resolvedEntries) {
        if (typeof imageUrl === 'string' && imageUrl.trim().length > 0) {
          resolvedMap[productId] = imageUrl.trim();
        }
      }

      setProductImageUrls(resolvedMap);
    }

    void hydrateMissingImages();

    return () => {
      active = false;
    };
  }, [recommendedProducts]);

  const runPrompt = useCallback(
    async (rawPrompt: string): Promise<void> => {
      const prompt = rawPrompt.trim();
      if (prompt.length === 0 || isRunning) {
        return;
      }

      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const activeSessionId = sessionId.trim().length > 0 ? sessionId : readOrCreateSessionId();
      if (activeSessionId !== sessionId) {
        setSessionId(activeSessionId);
      }

      setRequestState('loading');
      setErrorMessage('');
      setLastPrompt(prompt);
      setLatestPayload(null);
      setProductImageUrls({});
      setHasStreamingAssistantText(false);
      setMessages((previous) => [
        ...previous,
        {
          id: createId('user-message'),
          role: 'user',
          content: prompt,
          createdAt: new Date(),
        },
      ]);

      let streamCompleted = false;
      let streamFailed = false;
      let bufferedAssistantText = '';
      const streamingAssistantMessageId = createId('assistant-message');

      await streamAssistantMessage(
        {
          message: prompt,
          sessionId: activeSessionId,
          locale: typeof navigator !== 'undefined' ? navigator.language : undefined,
        },
        {
          signal: abortController.signal,
          onRunStarted: () => {
            if (!mountedRef.current || abortController.signal.aborted) {
              return;
            }
            setRequestState('loading');
          },
          onTextDelta: (delta) => {
            bufferedAssistantText += delta;

            if (!mountedRef.current || abortController.signal.aborted) {
              return;
            }

            setHasStreamingAssistantText(true);
            setMessages((previous) => {
              const existingIndex = previous.findIndex(
                (message) => message.id === streamingAssistantMessageId,
              );

              if (existingIndex < 0) {
                return [
                  ...previous,
                  {
                    id: streamingAssistantMessageId,
                    role: 'assistant',
                    content: bufferedAssistantText,
                    createdAt: new Date(),
                  },
                ];
              }

              const next = [...previous];
              next[existingIndex] = {
                ...next[existingIndex],
                content: bufferedAssistantText,
              };
              return next;
            });
          },
          onFinished: (snapshot) => {
            if (!mountedRef.current || abortController.signal.aborted) {
              return;
            }
            streamCompleted = true;
            setLatestPayload(snapshot);
            setHasStreamingAssistantText(false);
            const finalAssistantText =
              snapshot.assistantMessage.trim().length > 0
                ? snapshot.assistantMessage
                : bufferedAssistantText;
            setMessages((previous) => {
              const existingIndex = previous.findIndex(
                (message) => message.id === streamingAssistantMessageId,
              );

              if (existingIndex < 0) {
                return [
                  ...previous,
                  {
                    id: streamingAssistantMessageId,
                    role: 'assistant',
                    content: finalAssistantText,
                    createdAt: new Date(),
                  },
                ];
              }

              const next = [...previous];
              next[existingIndex] = {
                ...next[existingIndex],
                content: finalAssistantText,
              };
              return next;
            });
            setRequestState('success');
          },
          onError: (error) => {
            if (!mountedRef.current || abortController.signal.aborted) {
              return;
            }
            streamFailed = true;
            setHasStreamingAssistantText(false);
            setRequestState('error');
            setErrorMessage(error.message);
          },
        },
      );

      if (!mountedRef.current || abortController.signal.aborted) {
        return;
      }

      if (!streamCompleted && !streamFailed) {
        setRequestState('error');
        setErrorMessage('Assistant stream ended unexpectedly.');
      }
    },
    [isRunning, sessionId],
  );

  const externalMessages = useMemo<ThreadMessageLike[]>(
    () =>
      messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
        ...(message.role === 'assistant'
          ? {
              status: {
                type: 'complete' as const,
                reason: 'stop' as const,
              },
            }
          : {}),
      })),
    [messages],
  );

  const adapter = useMemo<ExternalStoreAdapter<ThreadMessageLike>>(
    () => ({
      messages: externalMessages,
      isRunning: false,
      isSendDisabled: isRunning,
      unstable_capabilities: {
        copy: false,
      },
      convertMessage: (message) => message,
      onNew: async (message: AppendMessage) => {
        await runPrompt(readPromptFromAppendMessage(message));
      },
    }),
    [externalMessages, isRunning, runPrompt],
  );

  const runtime = useExternalStoreRuntime(adapter);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex h-full flex-col bg-card text-sm">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-3 py-3">
            <div className="space-y-3">
              {messages.length === 0 && !isRunning ? (
                <div className="space-y-1">
                  <p className="text-base font-semibold text-foreground">Shoppilot</p>
                  <p className="text-sm text-muted-foreground">
                    Ask for recommendations, comparisons, and budget-friendly options.
                  </p>
                </div>
              ) : null}

              <ThreadPrimitive.Root className="flex flex-col gap-2">
                <ThreadPrimitive.Messages components={{ Message: AssistantThreadMessage }} />
              </ThreadPrimitive.Root>

              {isRunning && !hasStreamingAssistantText ? (
                <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
                  Thinking...
                </p>
              ) : null}

              {requestState === 'error' ? (
                <section className="rounded-md border border-danger/40 bg-danger/10 p-3">
                  <p className="text-sm font-semibold text-foreground">Assistant request failed</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {errorMessage || 'Something went wrong while contacting the assistant.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (lastPrompt.trim().length > 0) {
                        void runPrompt(lastPrompt);
                      }
                    }}
                    disabled={isRunning || lastPrompt.trim().length === 0}
                    className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    Retry last message
                  </button>
                </section>
              ) : null}

              {!isRunning && latestPayload ? (
                <section className="space-y-2 rounded-md border border-border bg-background p-2.5">
                  <div className="space-y-2">
                    {recommendedProducts.length > 0 ? (
                      recommendedProducts.map((product) => (
                        <Link
                          key={product.productId}
                          href={`/catalog/${product.productId}`}
                          className="group flex items-center gap-2 rounded-md border border-border bg-card p-2 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {productImageUrls[product.productId] ? (
                            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-sm border border-border bg-muted">
                              <img
                                src={productImageUrls[product.productId]}
                                alt={product.name}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            </div>
                          ) : (
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border border-border bg-muted text-sm font-semibold uppercase text-muted-foreground">
                              {product.category.slice(0, 3)}
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">{product.name}</p>
                            <p className="truncate text-sm text-muted-foreground">{product.category}</p>
                            <p className="mt-0.5 text-sm text-foreground">
                              {formatPrice(product.priceCents, product.currency)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {product.available ? 'In stock' : 'Out of stock'}
                            </p>
                          </div>
                        </Link>
                      ))
                    ) : (
                      <div className="rounded-md border border-border bg-card p-2">
                        <p className="text-sm font-semibold text-foreground">No recommendations returned</p>
                        <p className="text-sm text-muted-foreground">
                          Try adding a price range or product category to narrow the request.
                        </p>
                      </div>
                    )}
                  </div>

                  {comparisonSummary ? (
                    <div className="rounded-md border border-border bg-card px-2.5 py-2">
                      <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Comparison
                      </p>
                      <p className="mt-1 text-sm text-foreground">{comparisonSummary}</p>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>
          </div>

          <div className="border-t border-border p-3">
            <ComposerPrimitive.Root className="flex items-end gap-2">
              <ComposerPrimitive.Input
                rows={1}
                aria-label="Assistant message"
                placeholder="Ask for recommendations..."
                className="min-h-0 flex-1 rounded-md border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-black focus:outline-none focus:ring-1 focus:ring-black focus:ring-offset-0"
              />
              <ComposerPrimitive.Send asChild>
                <button
                  type="button"
                  aria-label="Send message"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-black text-white transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <SendHorizontalIcon className="size-4" aria-hidden="true" />
                </button>
              </ComposerPrimitive.Send>
            </ComposerPrimitive.Root>
          </div>
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
}

export function AssistantWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const previousUserIdRef = useRef<string | null>(userId);

  useEffect(() => {
    const previousUserId = previousUserIdRef.current;
    if (previousUserId === userId) {
      return;
    }

    previousUserIdRef.current = userId;
    rotateStoredSessionId();
    setResetToken((previous) => previous + 1);
    setIsOpen(false);
  }, [userId]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      rotateStoredSessionId();
      setResetToken((previous) => previous + 1);
    }
    setIsOpen(nextOpen);
  }, []);

  return (
    <AssistantModalPrimitive.Root open={isOpen} onOpenChange={handleOpenChange}>
      <AssistantModalPrimitive.Anchor className="fixed bottom-4 right-4 z-[70]">
        <AssistantModalPrimitive.Trigger asChild>
          <button
            type="button"
            className="relative inline-flex size-12 items-center justify-center rounded-full border border-border bg-black text-white shadow-md transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={isOpen ? 'Close assistant' : 'Open assistant'}
          >
            <BotIcon
              className={`absolute size-5 transition-all ${
                isOpen ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'
              }`}
              aria-hidden="true"
            />
            <ChevronDownIcon
              className={`absolute size-5 transition-all ${
                isOpen ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0'
              }`}
              aria-hidden="true"
            />
          </button>
        </AssistantModalPrimitive.Trigger>
      </AssistantModalPrimitive.Anchor>
      <AssistantModalPrimitive.Content
        forceMount
        sideOffset={12}
        className="z-[70] h-[min(82vh,42rem)] w-[min(94vw,28rem)] origin-bottom-right overflow-hidden rounded-lg border border-border bg-card shadow-md outline-none data-[state=closed]:pointer-events-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 md:h-[min(64vh,27rem)] md:w-[21rem]"
      >
        <AssistantModalContent resetToken={resetToken} />
      </AssistantModalPrimitive.Content>
    </AssistantModalPrimitive.Root>
  );
}
