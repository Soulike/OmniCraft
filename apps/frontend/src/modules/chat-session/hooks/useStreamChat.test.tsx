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
    maxInputTokens: 100,
    inputTokens: 10,
    outputTokens: 5,
    cacheReadInputTokens: 0,
    thinkingLevel: 'none' as const,
  };
}

function createApi(events: readonly SseEvent[]): ChatSessionApi {
  return {
    createSession: vi.fn(() => Promise.resolve('session-1')),
    sendMessage: vi.fn(() => Promise.resolve()),
    subscribeEvents: vi.fn(async function* () {
      await Promise.resolve();
      for (const event of events) {
        yield event;
      }
    }),
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
}

function SendHarness({
  config,
  content,
  createNewSessionId,
  onResult,
  onUserMessage,
  sessionId,
}: SendHarnessProps) {
  const eventBus = useChatEventBus();
  const {sendMessage} = useStreamChat({sessionId, createNewSessionId});

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
        void sendMessage(content, config).then(
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
  vi.unstubAllGlobals();
});

describe('useStreamChat', () => {
  it('creates a session without config and sends the trimmed message', async () => {
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
      expect(onResult).toHaveBeenCalledWith({status: 'fulfilled'});
    });
    expect(createNewSessionId).toHaveBeenCalledWith();
    expect(api.sendMessage).toHaveBeenCalledWith(
      'created-session',
      'hello world',
    );
  });

  it('passes workspace config when creating a session', async () => {
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
