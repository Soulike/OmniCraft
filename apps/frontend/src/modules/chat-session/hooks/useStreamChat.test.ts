import type {SseEventCursorEntry} from '@omnicraft/sse-events';
import {renderHook, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {HttpError} from '@/api/helpers/http-error.js';
import {EventBus} from '@/helpers/event-bus.js';
import type {ChatEventBus, ChatEventMap} from '@/modules/chat-events/index.js';

import {useChatEventBus} from './useChatEventBus.js';
import {useChatSessionApi} from './useChatSessionApi.js';
import {useStreamChat} from './useStreamChat.js';

vi.mock('./useChatEventBus.js');
vi.mock('./useChatSessionApi.js');

const mockedUseChatEventBus = vi.mocked(useChatEventBus);
const mockedUseChatSessionApi = vi.mocked(useChatSessionApi);

/** A generator that stays open until its abort signal fires. */
// eslint-disable-next-line require-yield
async function* blockUntilAborted(
  signal: AbortSignal | undefined,
): AsyncGenerator<SseEventCursorEntry, void, undefined> {
  await new Promise<void>((resolve) => {
    if (!signal || signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener(
      'abort',
      () => {
        resolve();
      },
      {once: true},
    );
  });
}

describe('useStreamChat stale-cursor recovery', () => {
  let bus: ChatEventBus;
  let emitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    bus = new EventBus<ChatEventMap>();
    emitSpy = vi.spyOn(bus, 'emit');
    mockedUseChatEventBus.mockReturnValue(bus);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resets the view and replays from cursor 0 when the events endpoint returns 409', async () => {
    // First connection advances the cursor to 7, then the server rolls its log
    // back and answers the reconnect with 409.
    const advancedEntry: SseEventCursorEntry = {
      event: {type: 'text-delta', content: 'partial'},
      nextIndex: 7,
    };

    const subscribeEvents = vi.fn(
      (_sessionId: string, _from: number, signal?: AbortSignal) => {
        if (subscribeEvents.mock.calls.length === 1) {
          return (async function* () {
            await Promise.resolve();
            yield advancedEntry;
            throw new HttpError(409, 'cursor_ahead_of_log');
          })();
        }
        return blockUntilAborted(signal);
      },
    );

    mockedUseChatSessionApi.mockReturnValue({
      subscribeEvents,
      sendMessage: vi.fn(),
      abortCompletion: vi.fn(),
    } as unknown as ReturnType<typeof useChatSessionApi>);

    const {result, unmount} = renderHook(() =>
      useStreamChat({sessionId: 's1', createNewSessionId: vi.fn()}),
    );

    // The hook reconnects after the 409 (a second subscription).
    await waitFor(() => {
      expect(subscribeEvents).toHaveBeenCalledTimes(2);
    });

    // The reconnect replays from the start, not from the stale cursor (7).
    expect(subscribeEvents.mock.calls[1]?.[1]).toBe(0);
    // The view was discarded via the shared reset broadcast.
    expect(emitSpy).toHaveBeenCalledWith('reset-session');
    // A 409 is recovery, never a fatal stream error.
    expect(result.current.streamError).toBeNull();

    unmount();
  });

  it('does not reset or reconnect for a non-stale error', async () => {
    const subscribeEvents = vi.fn(
      (_sessionId: string, _from: number, _signal?: AbortSignal) =>
        // Mirrors the real subscribeEvents rejecting a non-2xx response: the
        // generator throws on iteration and never yields.
        // eslint-disable-next-line require-yield
        (async function* (): AsyncGenerator<
          SseEventCursorEntry,
          void,
          undefined
        > {
          await Promise.resolve();
          throw new HttpError(500, 'server error');
        })(),
    );

    mockedUseChatSessionApi.mockReturnValue({
      subscribeEvents,
      sendMessage: vi.fn(),
      abortCompletion: vi.fn(),
    } as unknown as ReturnType<typeof useChatSessionApi>);

    const {unmount} = renderHook(() =>
      useStreamChat({sessionId: 's1', createNewSessionId: vi.fn()}),
    );

    // A 500 is retriable, so it retries with backoff — but it must never emit
    // the stale-cursor reset broadcast.
    await waitFor(() => {
      expect(subscribeEvents).toHaveBeenCalled();
    });
    expect(emitSpy).not.toHaveBeenCalledWith('reset-session');

    unmount();
  });
});
