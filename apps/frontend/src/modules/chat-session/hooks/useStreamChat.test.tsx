import type {SseEvent} from '@omnicraft/sse-events';
import {act, fireEvent, render, screen} from '@testing-library/react';
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
  vi.unstubAllGlobals();
});

describe('useStreamChat', () => {
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
