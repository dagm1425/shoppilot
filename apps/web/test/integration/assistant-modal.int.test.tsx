import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TextDecoder, TextEncoder } from 'node:util';

process.env.NEXT_PUBLIC_API_BASE_URL = 'http://127.0.0.1:4000';

Object.defineProperty(globalThis, 'TextDecoder', {
  value: TextDecoder,
  writable: true,
});
Object.defineProperty(globalThis, 'TextEncoder', {
  value: TextEncoder,
  writable: true,
});

jest.mock('../../components/customer-nav-header', () => ({
  CustomerNavHeader: () => <div data-testid="customer-nav-header">Customer Nav</div>,
}));

jest.mock('@assistant-ui/react', () => {
  const ReactModule = require('react') as typeof React;

  const RuntimeContext = ReactModule.createContext<unknown>(null);
  const ModalContext = ReactModule.createContext<{
    open: boolean;
    setOpen: (value: boolean) => void;
  } | null>(null);
  const MessageContext = ReactModule.createContext<{
    role: 'user' | 'assistant';
    content: string;
  } | null>(null);
  const ComposerContext = ReactModule.createContext<{
    value: string;
    setValue: (value: string) => void;
  } | null>(null);

  function AssistantModalRoot(props: {
    open?: boolean;
    onOpenChange?: (value: boolean) => void;
    children: React.ReactNode;
  }) {
    const [internalOpen, setInternalOpen] = ReactModule.useState(false);
    const controlled = typeof props.open === 'boolean' && typeof props.onOpenChange === 'function';
    const open = controlled ? Boolean(props.open) : internalOpen;

    const setOpen = (value: boolean) => {
      if (controlled) {
        props.onOpenChange?.(value);
        return;
      }
      setInternalOpen(value);
    };

    return (
      <ModalContext.Provider value={{ open, setOpen }}>{props.children}</ModalContext.Provider>
    );
  }

  function AssistantModalTrigger(props: {
    asChild?: boolean;
    children: React.ReactNode;
  }) {
    const modal = ReactModule.useContext(ModalContext);

    const onClick = () => {
      if (!modal) {
        return;
      }
      modal.setOpen(!modal.open);
    };

    if (props.asChild && ReactModule.isValidElement(props.children)) {
      const child = props.children as React.ReactElement<{
        onClick?: (event: React.MouseEvent) => void;
      }>;
      const childProps = child.props;

      return ReactModule.cloneElement(child, {
        onClick: (event: React.MouseEvent) => {
          childProps.onClick?.(event);
          onClick();
        },
      });
    }

    return (
      <button type="button" onClick={onClick}>
        {props.children}
      </button>
    );
  }

  function AssistantModalContent(props: {
    children: React.ReactNode;
  }) {
    const modal = ReactModule.useContext(ModalContext);
    if (!modal?.open) {
      return null;
    }

    return <div>{props.children}</div>;
  }

  function AssistantRuntimeProvider(props: {
    runtime: unknown;
    children: React.ReactNode;
  }) {
    return <RuntimeContext.Provider value={props.runtime}>{props.children}</RuntimeContext.Provider>;
  }

  function ThreadMessages(props: {
    components?: {
      Message?: React.ComponentType;
    };
  }) {
    const runtime = ReactModule.useContext(RuntimeContext) as {
      messages?: Array<{ id: string; role: 'user' | 'assistant'; content: string }>;
    } | null;

    const messages = runtime?.messages ?? [];

    return (
      <>
        {messages.map((message) => (
          <MessageContext.Provider
            key={message.id}
            value={{ role: message.role, content: message.content }}
          >
            {props.components?.Message
              ? ReactModule.createElement(props.components.Message)
              : message.content}
          </MessageContext.Provider>
        ))}
      </>
    );
  }

  function MessageIf(props: {
    user?: boolean;
    assistant?: boolean;
    children: React.ReactNode;
  }) {
    const message = ReactModule.useContext(MessageContext);
    if (!message) {
      return null;
    }

    if (props.user && message.role === 'user') {
      return <>{props.children}</>;
    }

    if (props.assistant && message.role === 'assistant') {
      return <>{props.children}</>;
    }

    return null;
  }

  function MessageParts(props: {
    components?: {
      Text?: React.ComponentType;
    };
    children?: ((input: { part: { type: 'text'; text: string } }) => React.ReactNode) | React.ReactNode;
  }) {
    const message = ReactModule.useContext(MessageContext);
    if (!message) {
      return null;
    }

    if (props.components?.Text) {
      return ReactModule.createElement(props.components.Text);
    }

    if (typeof props.children === 'function') {
      return (
        <>{props.children({ part: { type: 'text', text: message.content } })}</>
      );
    }

    return <>{props.children ?? message.content}</>;
  }

  function MessagePartText(props: {
    className?: string;
  }) {
    const message = ReactModule.useContext(MessageContext);
    return <span className={props.className}>{message?.content ?? ''}</span>;
  }

  function ComposerRoot(props: {
    className?: string;
    children: React.ReactNode;
  }) {
    const [value, setValue] = ReactModule.useState('');

    return (
      <ComposerContext.Provider value={{ value, setValue }}>
        <div className={props.className}>{props.children}</div>
      </ComposerContext.Provider>
    );
  }

  function ComposerInput(props: {
    rows?: number;
    'aria-label'?: string;
    placeholder?: string;
    className?: string;
  }) {
    const composer = ReactModule.useContext(ComposerContext);

    return (
      <textarea
        rows={props.rows}
        aria-label={props['aria-label']}
        placeholder={props.placeholder}
        className={props.className}
        value={composer?.value ?? ''}
        onChange={(event) => {
          composer?.setValue(event.target.value);
        }}
      />
    );
  }

  function ComposerSend(props: {
    asChild?: boolean;
    children: React.ReactNode;
  }) {
    const runtime = ReactModule.useContext(RuntimeContext) as {
      isSendDisabled?: boolean;
      onNew?: (message: { content: Array<{ type: 'text'; text: string }> }) => Promise<void>;
    } | null;
    const composer = ReactModule.useContext(ComposerContext);

    const disabled = Boolean(runtime?.isSendDisabled) || !(composer?.value.trim().length);

    const onClick = async () => {
      if (disabled || !runtime?.onNew || !composer) {
        return;
      }

      const currentValue = composer.value;
      composer.setValue('');
      await runtime.onNew({
        content: [{ type: 'text', text: currentValue }],
      });
    };

    if (props.asChild && ReactModule.isValidElement(props.children)) {
      const child = props.children as React.ReactElement<{
        onClick?: (event: React.MouseEvent) => void;
        disabled?: boolean;
      }>;
      const childProps = child.props;

      return ReactModule.cloneElement(child, {
        disabled,
        onClick: (event: React.MouseEvent) => {
          childProps.onClick?.(event);
          void onClick();
        },
      });
    }

    return (
      <button type="button" disabled={disabled} onClick={() => void onClick()}>
        {props.children}
      </button>
    );
  }

  return {
    AssistantModalPrimitive: {
      Root: AssistantModalRoot,
      Trigger: AssistantModalTrigger,
      Anchor: ({ children, className }: { children: React.ReactNode; className?: string }) => (
        <div className={className}>{children}</div>
      ),
      Content: AssistantModalContent,
    },
    AssistantRuntimeProvider,
    ComposerPrimitive: {
      Root: ComposerRoot,
      Input: ComposerInput,
      Send: ComposerSend,
    },
    ThreadPrimitive: {
      Root: ({ children, className }: { children: React.ReactNode; className?: string }) => (
        <div className={className}>{children}</div>
      ),
      Messages: ThreadMessages,
    },
    MessagePrimitive: {
      Root: ({ children, className }: { children: React.ReactNode; className?: string }) => (
        <div className={className}>{children}</div>
      ),
      If: MessageIf,
      Parts: MessageParts,
    },
    MessagePartPrimitive: {
      Text: MessagePartText,
      InProgress: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    },
    useExternalStoreRuntime: <T extends unknown>(adapter: T) => adapter,
  };
});

import CustomerLayout from '../../app/(customer)/layout';
import { AssistantWidget } from '../../components/assistant/assistant-widget';
import { useAuthStore } from '../../lib/auth-store';

type AssistantSnapshotInput = {
  requestId?: string;
  sessionId?: string;
  assistantMessage: string;
  followUpPrompts?: string[];
  comparisonSummary?: string | null;
};

function buildSnapshot(input: AssistantSnapshotInput) {
  return {
    requestId: input.requestId ?? 'request-1',
    sessionId: input.sessionId ?? 'session-1',
    assistantMessage: input.assistantMessage,
    recommendations: [
      {
        summary: 'Best matches',
        recommendedProducts: [
          {
            productId: 'runner-pro',
            name: 'Runner Pro',
            category: 'shoes',
            priceCents: 8900,
            currency: 'USD',
            available: true,
            rating: 4.6,
            shortDescription: 'Breathable trainer for daily runs.',
            primaryImageUrl: 'https://cdn.example.com/runner-pro.jpg',
          },
        ],
        comparisonSummary: input.comparisonSummary ?? null,
        followUpPrompts: input.followUpPrompts ?? [],
      },
    ],
    recommendedProductIds: ['runner-pro'],
    retrievalMode: 'semantic' as const,
    followUpPrompts: input.followUpPrompts ?? [],
    model: 'gpt-4.1-mini',
    placeholder: false,
  };
}

function buildFrames(snapshot: ReturnType<typeof buildSnapshot>): string[] {
  return [
    'event: RUN_STARTED\ndata: {"type":"RUN_STARTED","runId":"run-1","threadId":"thread-1"}\n\n',
    'event: TEXT_MESSAGE_START\ndata: {"type":"TEXT_MESSAGE_START","messageId":"msg-1","role":"assistant"}\n\n',
    'event: TEXT_MESSAGE_CONTENT\ndata: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg-1","delta":"hello"}\n\n',
    'event: TEXT_MESSAGE_END\ndata: {"type":"TEXT_MESSAGE_END","messageId":"msg-1"}\n\n',
    `event: STATE_SNAPSHOT\ndata: ${JSON.stringify({
      type: 'STATE_SNAPSHOT',
      state: {
        chatResponse: snapshot,
      },
    })}\n\n`,
    'event: RUN_FINISHED\ndata: {"type":"RUN_FINISHED","runId":"run-1","threadId":"thread-1"}\n\n',
  ];
}

function buildSseResponse(
  frames: string[],
  options?: {
    delayMs?: number;
    status?: number;
  },
): Response {
  const status = options?.status ?? 200;
  const delayMs = options?.delayMs ?? 0;
  const encodedFrames = frames.map((frame) => Uint8Array.from(Buffer.from(frame, 'utf8')));
  let cursor = 0;

  const body = {
    getReader: () => ({
      read: async (): Promise<{ done: boolean; value?: Uint8Array }> => {
        if (cursor >= encodedFrames.length) {
          return {
            done: true,
          };
        }

        if (delayMs > 0) {
          await new Promise((resolve) => {
            setTimeout(resolve, delayMs);
          });
        }

        const value = encodedFrames[cursor];
        cursor += 1;

        return {
          done: false,
          value,
        };
      },
    }),
  } as unknown as ReadableStream<Uint8Array>;

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({
      'content-type': 'text/event-stream',
    }),
    body,
    json: async () => ({}),
  } as Response;
}

function buildJsonResponse<T>(payload: T, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({
      'content-type': 'application/json',
    }),
    json: async () => payload,
  } as Response;
}

describe('Assistant modal integration', () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    Object.defineProperty(globalThis, 'fetch', {
      value: fetchMock,
      writable: true,
    });
    window.localStorage.clear();
    act(() => {
      useAuthStore.getState().clearUser();
      useAuthStore.getState().setSessionChecked(false);
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', {
      value: originalFetch,
      writable: true,
    });
  });

  it('mounts the assistant FAB on customer layout and supports open-close flow', async () => {
    render(
      <CustomerLayout>
        <main>Customer content</main>
      </CustomerLayout>,
    );

    expect(screen.getByRole('button', { name: 'Open assistant' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open assistant' }));

    expect(await screen.findByLabelText('Assistant message')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close assistant' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close assistant' }));

    await waitFor(() => {
      expect(screen.queryByLabelText('Assistant message')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Open assistant' })).toBeInTheDocument();
    });
  }, 15_000);

  it('omits attachment/edit/starter suggestion UI and keeps send disabled for blank input', async () => {
    render(React.createElement(AssistantWidget));

    fireEvent.click(screen.getByRole('button', { name: 'Open assistant' }));

    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /attach/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/try: running shoes/i)).not.toBeInTheDocument();
  });

  it('shows Thinking during stream and commits snapshot-driven UI on completion', async () => {
    const snapshot = buildSnapshot({
      assistantMessage: 'I found two good options for your budget.',
      followUpPrompts: ['Show lighter options'],
      comparisonSummary: 'Runner Pro is lighter than Trail Max.',
    });

    fetchMock.mockResolvedValueOnce(buildSseResponse(buildFrames(snapshot), { delayMs: 20 }));

    render(React.createElement(AssistantWidget));

    fireEvent.click(screen.getByRole('button', { name: 'Open assistant' }));
    fireEvent.change(screen.getByLabelText('Assistant message'), {
      target: { value: 'Recommend running shoes under $100' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByText('Thinking...')).toBeInTheDocument();

    expect(
      await screen.findByText('I found two good options for your budget.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Runner Pro')).toBeInTheDocument();
    expect(screen.getByText('Runner Pro is lighter than Trail Max.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show lighter options' })).not.toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0];
    expect(String(request?.[0])).toContain('/ai/chat/stream');

    const requestBody = JSON.parse(
      String((request?.[1] as RequestInit | undefined)?.body ?? '{}'),
    ) as { message?: string; sessionId?: string };
    expect(requestBody.message).toBe('Recommend running shoes under $100');
    expect(requestBody.sessionId).toBeTruthy();
  });

  it('shows recoverable stream error and retries last prompt successfully', async () => {
    fetchMock
      .mockResolvedValueOnce(
        buildJsonResponse(
          {
            error: {
              code: 'AI_UPSTREAM_TIMEOUT',
              message: 'Assistant request timed out. Please try again.',
            },
          },
          504,
        ),
      )
      .mockResolvedValueOnce(
        buildSseResponse(
          buildFrames(
            buildSnapshot({
              assistantMessage: 'I found recovery recommendations after retry.',
              followUpPrompts: ['Show cheaper options'],
              comparisonSummary: null,
            }),
          ),
        ),
      );

    render(React.createElement(AssistantWidget));

    fireEvent.click(screen.getByRole('button', { name: 'Open assistant' }));
    fireEvent.change(screen.getByLabelText('Assistant message'), {
      target: { value: 'Recommend trail shoes' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByText('Assistant request failed')).toBeInTheDocument();
    expect(
      screen.getByText('Assistant request timed out. Please try again.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry last message' }));

    await waitFor(() => {
      expect(
        screen.getByText('I found recovery recommendations after retry.'),
      ).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rotates session id on close and starts a clean chat on reopen', async () => {
    const firstSnapshot = buildSnapshot({
      assistantMessage: 'First chat response.',
    });
    const secondSnapshot = buildSnapshot({
      requestId: 'request-2',
      assistantMessage: 'Second chat response.',
    });

    fetchMock
      .mockResolvedValueOnce(buildSseResponse(buildFrames(firstSnapshot)))
      .mockResolvedValueOnce(buildSseResponse(buildFrames(secondSnapshot)));

    render(React.createElement(AssistantWidget));

    fireEvent.click(screen.getByRole('button', { name: 'Open assistant' }));
    fireEvent.change(screen.getByLabelText('Assistant message'), {
      target: { value: 'First prompt' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByText('First chat response.')).toBeInTheDocument();

    const firstRequest = fetchMock.mock.calls[0];
    const firstBody = JSON.parse(
      String((firstRequest?.[1] as RequestInit | undefined)?.body ?? '{}'),
    ) as { sessionId?: string };
    expect(firstBody.sessionId).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close assistant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open assistant' }));

    expect(screen.queryByText('First chat response.')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Assistant message'), {
      target: { value: 'Second prompt' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByText('Second chat response.')).toBeInTheDocument();

    const secondRequest = fetchMock.mock.calls[1];
    const secondBody = JSON.parse(
      String((secondRequest?.[1] as RequestInit | undefined)?.body ?? '{}'),
    ) as { sessionId?: string };
    expect(secondBody.sessionId).toBeTruthy();
    expect(secondBody.sessionId).not.toBe(firstBody.sessionId);
  });

  it('aborts in-flight request and rotates session when auth user switches', async () => {
    let aborted = false;

    act(() => {
      useAuthStore.getState().setUser({
        id: 'user-1',
        username: 'user1',
        email: 'user1@example.com',
        role: 'CUSTOMER',
      });
    });

    fetchMock.mockImplementationOnce(async (_input, init) => {
      const signal = (init as RequestInit | undefined)?.signal as AbortSignal | undefined;

      return await new Promise<Response>((resolve) => {
        if (!signal) {
          resolve(
            buildJsonResponse(
              {
                error: {
                  code: 'AI_STREAM_SIGNAL_MISSING',
                  message: 'Missing request signal.',
                },
              },
              500,
            ),
          );
          return;
        }

        if (signal.aborted) {
          aborted = true;
          resolve(
            buildJsonResponse(
              {
                error: {
                  code: 'AI_ABORTED',
                  message: 'Aborted',
                },
              },
              499,
            ),
          );
          return;
        }

        signal.addEventListener(
          'abort',
          () => {
            aborted = true;
            resolve(
              buildJsonResponse(
                {
                  error: {
                    code: 'AI_ABORTED',
                    message: 'Aborted',
                  },
                },
                499,
              ),
            );
          },
          { once: true },
        );
      });
    });

    fetchMock.mockResolvedValueOnce(
      buildSseResponse(
        buildFrames(
          buildSnapshot({
            requestId: 'request-after-switch',
            assistantMessage: 'Fresh response after user switch.',
          }),
        ),
      ),
    );

    render(React.createElement(AssistantWidget));

    fireEvent.click(screen.getByRole('button', { name: 'Open assistant' }));
    fireEvent.change(screen.getByLabelText('Assistant message'), {
      target: { value: 'Prompt before switch' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    const firstRequest = fetchMock.mock.calls[0];
    const firstBody = JSON.parse(
      String((firstRequest?.[1] as RequestInit | undefined)?.body ?? '{}'),
    ) as { sessionId?: string };
    expect(firstBody.sessionId).toBeTruthy();

    act(() => {
      useAuthStore.getState().setUser({
        id: 'user-2',
        username: 'user2',
        email: 'user2@example.com',
        role: 'CUSTOMER',
      });
    });

    await waitFor(() => {
      expect(aborted).toBe(true);
      expect(screen.getByRole('button', { name: 'Open assistant' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open assistant' }));
    fireEvent.change(screen.getByLabelText('Assistant message'), {
      target: { value: 'Prompt after switch' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByText('Fresh response after user switch.')).toBeInTheDocument();

    const secondRequest = fetchMock.mock.calls[1];
    const secondBody = JSON.parse(
      String((secondRequest?.[1] as RequestInit | undefined)?.body ?? '{}'),
    ) as { sessionId?: string };
    expect(secondBody.sessionId).toBeTruthy();
    expect(secondBody.sessionId).not.toBe(firstBody.sessionId);
  });
});
