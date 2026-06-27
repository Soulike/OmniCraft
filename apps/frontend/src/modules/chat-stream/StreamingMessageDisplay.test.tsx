import {act, cleanup, render} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {ThemeProvider} from '@/contexts/theme/index.js';
import {EventBus} from '@/helpers/event-bus.js';
import type {ChatEventMap, ChatMessage} from '@/modules/chat-events/index.js';

import {StreamingMessageDisplay} from './index.js';

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

function flushRaf(): void {
  const callbacks = [...rafCallbacks.values()];
  rafCallbacks.clear();
  for (const callback of callbacks) {
    callback(0);
  }
}

beforeEach(() => {
  rafCallbacks = new Map();
  nextRafId = 1;
  vi.stubGlobal('requestAnimationFrame', mockRaf);
  vi.stubGlobal('cancelAnimationFrame', mockCancelRaf);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('StreamingMessageDisplay onMessagesChange forwarding', () => {
  it('always invokes the latest onMessagesChange with the current messages', () => {
    const bus = new EventBus<ChatEventMap>();
    const first = vi.fn<(messages: readonly ChatMessage[]) => void>();
    const second = vi.fn<(messages: readonly ChatMessage[]) => void>();

    const {rerender} = render(
      <StreamingMessageDisplay
        eventBus={bus}
        onAskUserSubmit={null}
        onMessagesChange={first}
      />,
      {wrapper: ThemeProvider},
    );

    act(() => {
      bus.emit('user-message-sent', {content: 'hello'});
      flushRaf();
    });

    expect(first).toHaveBeenCalled();
    const firstArg = first.mock.calls.at(-1)?.[0];
    expect(firstArg?.some((m) => m.role === 'user')).toBe(true);

    // Swap the callback; the new one must receive subsequent updates.
    rerender(
      <StreamingMessageDisplay
        eventBus={bus}
        onAskUserSubmit={null}
        onMessagesChange={second}
      />,
    );
    first.mockClear();

    act(() => {
      bus.emit('text-delta', {type: 'text-delta', content: 'world'});
      flushRaf();
    });

    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
  });
});
