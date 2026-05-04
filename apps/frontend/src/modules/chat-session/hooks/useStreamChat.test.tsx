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

import {
  ChatEventBusProvider,
  type ChatSessionApi,
  ChatSessionApiContext,
  StreamingMessageDisplay,
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

function usage() {
  return {
    model: 'test-model',
    contextWindowTokens: 100,
    sessionInputTokens: 10,
    sessionOutputTokens: 5,
    sessionCacheReadInputTokens: 0,
    thinkingLevel: 'none' as const,
  };
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
    subscribeEvents,
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

  return <StreamingMessageDisplay eventBus={eventBus} sessionId='session-1' />;
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
    const terminalUsage = usage();
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
        agentId: 'subagent-1',
        task: 'Inspect the replay path',
        agentType: 'general',
        thinkingLevel: 'none',
        workingDirectory: '/tmp/project',
      },
      {
        type: 'subagent-output',
        agentId: 'subagent-1',
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
        agentId: 'subagent-1',
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
        agentId: 'subagent-1',
        event: {type: 'text-delta', content: 'Subagent replay content'},
      },
      {
        type: 'subagent-output',
        agentId: 'subagent-1',
        event: {type: 'done', reason: 'complete', usage: terminalUsage},
      },
      {type: 'subagent-complete', agentId: 'subagent-1', status: 'success'},
      {type: 'done', reason: 'complete', usage: terminalUsage},
    ];

    render(
      <ChatSessionApiContext value={createApi(events)}>
        <ChatEventBusProvider>
          <HarnessContent />
        </ChatEventBusProvider>
      </ChatSessionApiContext>,
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
});
