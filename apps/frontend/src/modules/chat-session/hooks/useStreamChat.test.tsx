import type {SseEvent} from '@omnicraft/sse-events';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {useEffect} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {HttpError} from '@/api/helpers/http-error.js';
import {ThemeProvider} from '@/contexts/theme/index.js';
import {StreamingMessageDisplay} from '@/modules/chat-stream/index.js';

import {
  ChatEventBusProvider,
  type ChatSessionApi,
  ChatSessionApiContext,
  useChatEventBus,
  useStreamChat,
} from '../index.js';

let rafCallbacks: Map<number, FrameRequestCallback>;
let nextRafId: number;

function mockRaf(cb: FrameRequestCallback): number {
  const id = nextRafId++;
  rafCallbacks.set(id, cb);
  return id;
}

function mockCancelRaf(id: number): void {
  rafCallbacks.delete(id);
}

class ResizeObserverMock implements ResizeObserver {
  disconnect(): void {
    return undefined;
  }
  observe(): void {
    return undefined;
  }
  unobserve(): void {
    return undefined;
  }
}

function flushRaf(): void {
  const callbacks = [...rafCallbacks.values()];
  rafCallbacks.clear();
  for (const callback of callbacks) {
    callback(0);
  }
}

function createApi(events: readonly SseEvent[]): ChatSessionApi {
  return {
    createSession: vi.fn(() => Promise.resolve('session-1')),
    sendMessage: vi.fn(() => Promise.resolve()),
    subscribeEvents: vi.fn(async function* () {
      await Promise.resolve();
      let nextIndex = 0;
      for (const event of events) {
        nextIndex++;
        yield {event, nextIndex};
      }
    }),
    abortCompletion: vi.fn(() => Promise.resolve()),
    submitToolResponse: vi.fn(() => Promise.resolve()),
    listSessions: vi.fn(() => Promise.resolve({sessions: [], total: 0})),
    deleteSession: vi.fn(() => Promise.resolve()),
  };
}

function createApiWithSubscribeEvents(
  subscribeEvents: ChatSessionApi['subscribeEvents'],
): ChatSessionApi {
  return {
    createSession: vi.fn(() => Promise.resolve('session-1')),
    sendMessage: vi.fn(() => Promise.resolve()),
    subscribeEvents: vi.fn(subscribeEvents),
    abortCompletion: vi.fn(() => Promise.resolve()),
    submitToolResponse: vi.fn(() => Promise.resolve()),
    listSessions: vi.fn(() => Promise.resolve({sessions: [], total: 0})),
    deleteSession: vi.fn(() => Promise.resolve()),
  };
}

function HarnessContent() {
  const eventBus = useChatEventBus();
  useStreamChat({
    sessionId: 'session-1',
    createNewSessionId: () => Promise.resolve('session-1'),
  });

  return <StreamingMessageDisplay eventBus={eventBus} onAskUserSubmit={null} />;
}

type SendResult = {status: 'fulfilled'} | {error: unknown; status: 'rejected'};

interface CreateNewSessionOptions {
  workspace?: string;
}

interface SendHarnessProps {
  config?: CreateNewSessionOptions;
  content: string;
  createNewSessionId: (
    config?: CreateNewSessionOptions,
  ) => Promise<string | null>;
  onResult: (result: SendResult) => void;
  onUserMessage?: (content: string) => void;
  sessionId: string | null;
  useNewSession?: boolean;
}

function SendHarness({
  config,
  content,
  createNewSessionId,
  onResult,
  onUserMessage,
  sessionId,
  useNewSession = false,
}: SendHarnessProps) {
  const eventBus = useChatEventBus();
  const {sendMessage, sendMessageToNewSession} = useStreamChat({
    sessionId,
    createNewSessionId,
  });

  useEffect(() => {
    if (!onUserMessage) return;
    const handler = ({content}: {content: string}) => {
      onUserMessage(content);
    };
    eventBus.on('user-message-sent', handler);
    return () => {
      eventBus.off('user-message-sent', handler);
    };
  }, [eventBus, onUserMessage]);

  return (
    <button
      onClick={() => {
        const send = useNewSession
          ? sendMessageToNewSession(content, config)
          : sendMessage(content);
        void send.then(
          () => {
            onResult({status: 'fulfilled'});
          },
          (error: unknown) => {
            onResult({error, status: 'rejected'});
          },
        );
      }}
      type='button'
    >
      Send
    </button>
  );
}

function StreamOnlyHarnessContent() {
  useStreamChat({
    sessionId: 'session-1',
    createNewSessionId: () => Promise.resolve('session-1'),
  });

  return null;
}

function StreamWithResetSpy({onReset}: {onReset: () => void}) {
  const eventBus = useChatEventBus();
  useStreamChat({
    sessionId: 'session-1',
    createNewSessionId: () => Promise.resolve('session-1'),
  });

  useEffect(() => {
    eventBus.on('reset-session', onReset);
    return () => {
      eventBus.off('reset-session', onReset);
    };
  }, [eventBus, onReset]);

  return null;
}

async function flushAsyncWork(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  rafCallbacks = new Map();
  nextRafId = 1;
  vi.stubGlobal('requestAnimationFrame', mockRaf);
  vi.stubGlobal('cancelAnimationFrame', mockCancelRaf);
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useStreamChat', () => {
  it('sends the first message to a new session without config', async () => {
    const api = createApi([]);
    const createNewSessionId = vi.fn(() => Promise.resolve('created-session'));
    const onResult = vi.fn<(result: SendResult) => void>();

    render(
      <ChatSessionApiContext value={api}>
        <ChatEventBusProvider>
          <SendHarness
            content='  hello world  '
            createNewSessionId={createNewSessionId}
            onResult={onResult}
            sessionId={null}
            useNewSession
          />
        </ChatEventBusProvider>
      </ChatSessionApiContext>,
      {wrapper: ThemeProvider},
    );

    fireEvent.click(screen.getByRole('button', {name: 'Send'}));

    await waitFor(() => {
      expect(onResult).toHaveBeenCalledWith({status: 'fulfilled'});
    });
    expect(createNewSessionId).toHaveBeenCalledWith(undefined);
    expect(api.sendMessage).toHaveBeenCalledWith(
      'created-session',
      'hello world',
    );
  });

  it('passes workspace config when sending the first message to a new session', async () => {
    const api = createApi([]);
    const config = {workspace: '/repo'};
    const createNewSessionId = vi.fn(() => Promise.resolve('created-session'));
    const onResult = vi.fn<(result: SendResult) => void>();

    render(
      <ChatSessionApiContext value={api}>
        <ChatEventBusProvider>
          <SendHarness
            config={config}
            content='  hello world  '
            createNewSessionId={createNewSessionId}
            onResult={onResult}
            sessionId={null}
            useNewSession
          />
        </ChatEventBusProvider>
      </ChatSessionApiContext>,
      {wrapper: ThemeProvider},
    );

    fireEvent.click(screen.getByRole('button', {name: 'Send'}));

    await waitFor(() => {
      expect(onResult).toHaveBeenCalledWith({status: 'fulfilled'});
    });
    expect(createNewSessionId).toHaveBeenCalledWith(config);
    expect(api.sendMessage).toHaveBeenCalledWith(
      'created-session',
      'hello world',
    );
  });

  it('rejects sending a follow-up message without a session', async () => {
    const api = createApi([]);
    const createNewSessionId = vi.fn(() => Promise.resolve('created-session'));
    const onResult = vi.fn<(result: SendResult) => void>();

    render(
      <ChatSessionApiContext value={api}>
        <ChatEventBusProvider>
          <SendHarness
            content='  hello world  '
            createNewSessionId={createNewSessionId}
            onResult={onResult}
            sessionId={null}
          />
        </ChatEventBusProvider>
      </ChatSessionApiContext>,
      {wrapper: ThemeProvider},
    );

    fireEvent.click(screen.getByRole('button', {name: 'Send'}));

    await waitFor(() => {
      expect(onResult).toHaveBeenCalledWith({
        error: new Error('Cannot send a follow-up message without a session.'),
        status: 'rejected',
      });
    });
    expect(createNewSessionId).not.toHaveBeenCalled();
    expect(api.sendMessage).not.toHaveBeenCalled();
  });

  it('sends the trimmed message for an existing session without creating a session', async () => {
    const api = createApi([]);
    const createNewSessionId = vi.fn(() => Promise.resolve('created-session'));
    const onResult = vi.fn<(result: SendResult) => void>();

    render(
      <ChatSessionApiContext value={api}>
        <ChatEventBusProvider>
          <SendHarness
            content='  follow up  '
            createNewSessionId={createNewSessionId}
            onResult={onResult}
            sessionId='existing-session'
          />
        </ChatEventBusProvider>
      </ChatSessionApiContext>,
      {wrapper: ThemeProvider},
    );

    fireEvent.click(screen.getByRole('button', {name: 'Send'}));

    await waitFor(() => {
      expect(onResult).toHaveBeenCalledWith({status: 'fulfilled'});
    });
    expect(createNewSessionId).not.toHaveBeenCalled();
    expect(api.sendMessage).toHaveBeenCalledWith(
      'existing-session',
      'follow up',
    );
  });

  it('reconnects with the backend-provided raw cursor after a replay event', async () => {
    vi.useFakeTimers();
    const subscribeEvents = vi
      .fn()
      .mockImplementationOnce(async function* () {
        await Promise.resolve();
        yield {event: {type: 'text-delta', content: 'abc'}, nextIndex: 3};
      })
      .mockImplementationOnce(async function* (
        _sessionId: string,
        _from: number,
        signal?: AbortSignal,
      ) {
        yield* [];
        await new Promise<void>((resolve) => {
          signal?.addEventListener(
            'abort',
            () => {
              resolve();
            },
            {once: true},
          );
        });
      });

    const {unmount} = render(
      <ChatSessionApiContext
        value={createApiWithSubscribeEvents(
          subscribeEvents as unknown as ChatSessionApi['subscribeEvents'],
        )}
      >
        <ChatEventBusProvider>
          <StreamOnlyHarnessContent />
        </ChatEventBusProvider>
      </ChatSessionApiContext>,
      {wrapper: ThemeProvider},
    );

    await flushAsyncWork();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(subscribeEvents).toHaveBeenNthCalledWith(
      1,
      'session-1',
      0,
      expect.any(AbortSignal),
    );
    expect(subscribeEvents).toHaveBeenNthCalledWith(
      2,
      'session-1',
      3,
      expect.any(AbortSignal),
    );

    unmount();
  });

  it('preserves replayed subagent output until the subagent display mounts', async () => {
    const agentId = '11111111-1111-4111-8111-111111111111';
    const events: SseEvent[] = [
      {
        type: 'message-start',
        role: 'user',
        messageId: 'user-1',
        createdAt: 1,
        content: 'run subagent',
      },
      {
        type: 'message-start',
        role: 'assistant',
        messageId: 'assistant-1',
        createdAt: 2,
        content: '',
      },
      {
        type: 'subagent-dispatch',
        agentId,
        task: 'Inspect the replay path',
        agentType: 'general',
        thinkingLevel: 'none',
        workingDirectory: '/tmp/project',
      },
      {
        type: 'subagent-output',
        agentId,
        event: {
          type: 'message-start',
          role: 'user',
          messageId: 'subagent-user-1',
          createdAt: 3,
          content: 'Inspect the replay path',
        },
      },
      {
        type: 'subagent-output',
        agentId,
        event: {
          type: 'message-start',
          role: 'assistant',
          messageId: 'subagent-assistant-1',
          createdAt: 4,
          content: '',
        },
      },
      {
        type: 'subagent-output',
        agentId,
        event: {type: 'text-delta', content: 'Subagent replay content'},
      },
      {
        type: 'subagent-output',
        agentId,
        event: {type: 'done', reason: 'complete'},
      },
      {type: 'subagent-complete', agentId, status: 'success'},
      {type: 'done', reason: 'complete'},
    ];

    render(
      <ChatSessionApiContext value={createApi(events)}>
        <ChatEventBusProvider>
          <HarnessContent />
        </ChatEventBusProvider>
      </ChatSessionApiContext>,
      {wrapper: ThemeProvider},
    );

    await flushAsyncWork();
    act(flushRaf);

    const trigger = await screen.findByRole('button', {
      name: /Inspect the replay path/,
    });
    if (trigger.getAttribute('aria-expanded') === 'false') {
      fireEvent.click(trigger);
    }

    await flushAsyncWork();
    act(flushRaf);
    await flushAsyncWork();
    act(flushRaf);

    expect(screen.getByText('Subagent replay content')).toBeInTheDocument();
  });

  it('preserves replayed resumed subagent output until the subagent display mounts', async () => {
    const agentId = '22222222-2222-4222-8222-222222222222';
    const events: SseEvent[] = [
      {
        type: 'message-start',
        role: 'user',
        messageId: 'user-1',
        createdAt: 1,
        content: 'resume subagent',
      },
      {
        type: 'message-start',
        role: 'assistant',
        messageId: 'assistant-1',
        createdAt: 2,
        content: '',
      },
      {
        type: 'subagent-resume',
        agentId,
        task: 'Continue the replay path',
        agentType: 'general',
        thinkingLevel: 'none',
        workingDirectory: '/tmp/project',
      },
      {
        type: 'subagent-output',
        agentId,
        event: {
          type: 'message-start',
          role: 'user',
          messageId: 'subagent-user-1',
          createdAt: 3,
          content: 'Continue the replay path',
        },
      },
      {
        type: 'subagent-output',
        agentId,
        event: {
          type: 'message-start',
          role: 'assistant',
          messageId: 'subagent-assistant-1',
          createdAt: 4,
          content: '',
        },
      },
      {
        type: 'subagent-output',
        agentId,
        event: {type: 'text-delta', content: 'Resumed replay content'},
      },
      {
        type: 'subagent-output',
        agentId,
        event: {type: 'done', reason: 'complete'},
      },
      {type: 'subagent-complete', agentId, status: 'success'},
      {type: 'done', reason: 'complete'},
    ];

    render(
      <ChatSessionApiContext value={createApi(events)}>
        <ChatEventBusProvider>
          <HarnessContent />
        </ChatEventBusProvider>
      </ChatSessionApiContext>,
      {wrapper: ThemeProvider},
    );

    await flushAsyncWork();
    act(flushRaf);

    const trigger = await screen.findByRole('button', {
      name: /Continue the replay path/,
    });
    if (trigger.getAttribute('aria-expanded') === 'false') {
      fireEvent.click(trigger);
    }

    await flushAsyncWork();
    act(flushRaf);
    await flushAsyncWork();
    act(flushRaf);

    expect(screen.getByText('Resumed replay content')).toBeInTheDocument();
  });

  it('ignores stop-check-reminder events (no bubble rendered)', async () => {
    const events: SseEvent[] = [
      {
        type: 'message-start',
        role: 'user',
        messageId: 'user-1',
        createdAt: 1,
        content: 'hello there',
      },
      {
        type: 'stop-check-reminder',
        checkNames: ['incomplete-todos'],
        content: 'SECRET REMINDER TEXT',
        messageId: 'reminder-1',
        createdAt: 2,
      },
      {type: 'done', reason: 'complete'},
    ];

    render(
      <ChatSessionApiContext value={createApi(events)}>
        <ChatEventBusProvider>
          <HarnessContent />
        </ChatEventBusProvider>
      </ChatSessionApiContext>,
      {wrapper: ThemeProvider},
    );

    await flushAsyncWork();
    act(flushRaf);

    expect(screen.getByText('hello there')).toBeInTheDocument();
    expect(screen.queryByText('SECRET REMINDER TEXT')).not.toBeInTheDocument();
  });

  it('does not reconnect when the api identity changes but the session stays the same', async () => {
    const openForever = (): ChatSessionApi['subscribeEvents'] =>
      async function* (
        _sessionId: string,
        _from: number,
        signal?: AbortSignal,
      ) {
        yield* [];
        await new Promise<void>((resolve) => {
          signal?.addEventListener(
            'abort',
            () => {
              resolve();
            },
            {once: true},
          );
        });
      };

    const apiA = createApiWithSubscribeEvents(openForever());
    const apiB = createApiWithSubscribeEvents(openForever());

    const tree = (api: ChatSessionApi) => (
      <ChatSessionApiContext value={api}>
        <ChatEventBusProvider>
          <StreamOnlyHarnessContent />
        </ChatEventBusProvider>
      </ChatSessionApiContext>
    );

    const {rerender, unmount} = render(tree(apiA), {wrapper: ThemeProvider});

    await flushAsyncWork();
    expect(apiA.subscribeEvents).toHaveBeenCalledTimes(1);

    // Same sessionId, brand-new api object (new subscribeEvents identity).
    rerender(tree(apiB));
    await flushAsyncWork();

    // The connection is keyed on sessionId, so swapping the api must not
    // tear it down and reconnect.
    expect(apiB.subscribeEvents).not.toHaveBeenCalled();
    expect(apiA.subscribeEvents).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('resets the view and replays from cursor 0 when the events endpoint returns 409', async () => {
    vi.useFakeTimers();
    const onReset = vi.fn();
    const subscribeEvents = vi
      .fn()
      .mockImplementationOnce(async function* () {
        await Promise.resolve();
        // Advance the cursor past the checkpoint, then the server rolls its
        // log back (e.g. it restarted) and answers the reconnect with 409.
        yield {event: {type: 'text-delta', content: 'partial'}, nextIndex: 7};
        throw new HttpError(409, 'cursor_ahead_of_log');
      })
      .mockImplementationOnce(async function* (
        _sessionId: string,
        _from: number,
        signal?: AbortSignal,
      ) {
        yield* [];
        await new Promise<void>((resolve) => {
          signal?.addEventListener(
            'abort',
            () => {
              resolve();
            },
            {once: true},
          );
        });
      });

    const {unmount} = render(
      <ChatSessionApiContext
        value={createApiWithSubscribeEvents(
          subscribeEvents as unknown as ChatSessionApi['subscribeEvents'],
        )}
      >
        <ChatEventBusProvider>
          <StreamWithResetSpy onReset={onReset} />
        </ChatEventBusProvider>
      </ChatSessionApiContext>,
      {wrapper: ThemeProvider},
    );

    await flushAsyncWork();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(subscribeEvents).toHaveBeenCalledTimes(2);
    // Reconnected from the start, discarding the stale cursor (7).
    expect(subscribeEvents).toHaveBeenNthCalledWith(
      2,
      'session-1',
      0,
      expect.any(AbortSignal),
    );
    // The view was discarded via the shared reset broadcast.
    expect(onReset).toHaveBeenCalled();

    unmount();
  });

  it('does not reset the view for a non-stale error', async () => {
    vi.useFakeTimers();
    const onReset = vi.fn();
    const subscribeEvents = vi.fn(async function* (
      _sessionId: string,
      _from: number,
      _signal?: AbortSignal,
    ) {
      yield* [];
      await Promise.resolve();
      throw new HttpError(500, 'server error');
    });

    const {unmount} = render(
      <ChatSessionApiContext
        value={createApiWithSubscribeEvents(
          subscribeEvents as unknown as ChatSessionApi['subscribeEvents'],
        )}
      >
        <ChatEventBusProvider>
          <StreamWithResetSpy onReset={onReset} />
        </ChatEventBusProvider>
      </ChatSessionApiContext>,
      {wrapper: ThemeProvider},
    );

    await flushAsyncWork();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    // A 500 is retriable, not a stale-cursor rollback — it must never reset.
    expect(subscribeEvents).toHaveBeenCalled();
    expect(onReset).not.toHaveBeenCalled();

    unmount();
  });
});
