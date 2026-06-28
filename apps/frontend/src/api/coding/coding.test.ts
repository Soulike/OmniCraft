import {
  type SseEventCursorEntry,
  sseEventCursorEntrySchema,
} from '@omnicraft/sse-events';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {subscribeEvents} from './coding.js';

function createMockResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, init);
}

async function collectSubscription(): Promise<SseEventCursorEntry[]> {
  const events: SseEventCursorEntry[] = [];

  for await (const event of subscribeEvents('session-1', 0)) {
    events.push(event);
  }

  return events;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('subscribeEvents', () => {
  it('yields events with the backend-provided raw cursor as nextIndex', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        createMockResponse(
          'id: 3\ndata: {"type":"text-delta","content":"abc"}\n\n',
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const events = await collectSubscription();

    expect(events).toEqual([
      {event: {type: 'text-delta', content: 'abc'}, nextIndex: 3},
    ]);
  });

  it('validates streamed cursor entries with the shared schema', async () => {
    expect(
      sseEventCursorEntrySchema.safeParse({
        event: {type: 'text-delta', content: 123},
        nextIndex: 1,
      }).success,
    ).toBe(false);

    const fetchMock = vi.fn(() =>
      Promise.resolve(
        createMockResponse(
          'id: 1\ndata: {"type":"text-delta","content":123}\n\n',
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(collectSubscription()).rejects.toThrow();
  });

  it('rejects missing SSE cursor ids', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        createMockResponse('data: {"type":"text-delta","content":"abc"}\n\n'),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(collectSubscription()).rejects.toThrow(
      'SSE event is missing resume cursor id',
    );
  });

  it('rejects non-canonical SSE cursor ids', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        createMockResponse(
          'id: 1e3\ndata: {"type":"text-delta","content":"abc"}\n\n',
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(collectSubscription()).rejects.toThrow(
      'Invalid SSE resume cursor id: 1e3',
    );
  });
});
