import type {SseEvent} from '@omnicraft/sse-events';
import {describe, expect, it} from 'vitest';

import {AgentSseLog} from './agent-sse-log.js';

/** Helper to create a minimal SseEvent for testing. */
function textDelta(content: string): SseEvent {
  return {type: 'text-delta', content};
}

function doneEvent(): SseEvent {
  return {
    type: 'done',
    reason: 'complete',
    usage: {
      model: 'test',
      maxInputTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
    },
  };
}

/** Collects all values from an async iterable into an array. */
async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const value of iterable) {
    results.push(value);
  }
  return results;
}

describe('AgentSseLog', () => {
  describe('append and seal basics', () => {
    it('starts with length 0 and not sealed', () => {
      const log = new AgentSseLog();
      expect(log.length).toBe(0);
      expect(log.sealed).toBe(false);
    });

    it('increments length on append', () => {
      const log = new AgentSseLog();
      log.append(textDelta('a'));
      expect(log.length).toBe(1);
      log.append(textDelta('b'));
      expect(log.length).toBe(2);
    });

    it('marks sealed after seal()', () => {
      const log = new AgentSseLog();
      log.seal();
      expect(log.sealed).toBe(true);
    });

    it('throws when appending to a sealed log', () => {
      const log = new AgentSseLog();
      log.seal();
      expect(() => {
        log.append(textDelta('x'));
      }).toThrow('Cannot append to a sealed AgentSseLog');
    });

    it('allows sealing an already sealed log without error', () => {
      const log = new AgentSseLog();
      log.seal();
      expect(() => {
        log.seal();
      }).not.toThrow();
    });
  });

  describe('single reader: replay and live events', () => {
    it('replays all existing events then ends on seal', async () => {
      const log = new AgentSseLog();
      log.append(textDelta('a'));
      log.append(textDelta('b'));
      log.seal();

      const events = await collect(log.createReader());
      expect(events).toEqual([textDelta('a'), textDelta('b')]);
    });

    it('receives live events appended after reader starts', async () => {
      const log = new AgentSseLog();

      const resultPromise = collect(log.createReader());

      // Let the reader start waiting.
      await Promise.resolve();

      log.append(textDelta('live-1'));
      log.append(textDelta('live-2'));
      log.seal();

      const events = await resultPromise;
      expect(events).toEqual([textDelta('live-1'), textDelta('live-2')]);
    });

    it('replays existing events then receives live events', async () => {
      const log = new AgentSseLog();
      log.append(textDelta('existing'));

      const resultPromise = collect(log.createReader());

      // Let the reader replay and then wait.
      await Promise.resolve();

      log.append(textDelta('live'));
      log.seal();

      const events = await resultPromise;
      expect(events).toEqual([textDelta('existing'), textDelta('live')]);
    });
  });

  describe('reader ends when log is sealed', () => {
    it('ends iteration immediately for an already-sealed empty log', async () => {
      const log = new AgentSseLog();
      log.seal();

      const events = await collect(log.createReader());
      expect(events).toEqual([]);
    });

    it('ends iteration after draining remaining events on seal', async () => {
      const log = new AgentSseLog();

      const resultPromise = collect(log.createReader());
      await Promise.resolve();

      log.append(doneEvent());
      log.seal();

      const events = await resultPromise;
      expect(events).toEqual([doneEvent()]);
    });
  });

  describe('multiple readers with independent cursors', () => {
    it('two readers independently iterate the same log', async () => {
      const log = new AgentSseLog();
      log.append(textDelta('a'));

      const reader1Promise = collect(log.createReader());
      const reader2Promise = collect(log.createReader());

      await Promise.resolve();

      log.append(textDelta('b'));
      log.seal();

      const [result1, result2] = await Promise.all([
        reader1Promise,
        reader2Promise,
      ]);
      expect(result1).toEqual([textDelta('a'), textDelta('b')]);
      expect(result2).toEqual([textDelta('a'), textDelta('b')]);
    });

    it('readers starting at different indices see different events', async () => {
      const log = new AgentSseLog();
      log.append(textDelta('a'));
      log.append(textDelta('b'));
      log.append(textDelta('c'));
      log.seal();

      const all = await collect(log.createReader());
      const fromOne = await collect(log.createReader({startIndex: 1}));
      const fromTwo = await collect(log.createReader({startIndex: 2}));

      expect(all).toEqual([textDelta('a'), textDelta('b'), textDelta('c')]);
      expect(fromOne).toEqual([textDelta('b'), textDelta('c')]);
      expect(fromTwo).toEqual([textDelta('c')]);
    });
  });

  describe('AbortSignal cancels a waiting reader', () => {
    it('ends iteration silently when signal is aborted', async () => {
      const log = new AgentSseLog();
      const controller = new AbortController();

      const resultPromise = collect(
        log.createReader({signal: controller.signal}),
      );

      await Promise.resolve();

      log.append(textDelta('before-abort'));

      // Let the reader consume the event and go back to waiting.
      await Promise.resolve();

      controller.abort();

      const events = await resultPromise;
      expect(events).toEqual([textDelta('before-abort')]);
    });

    it('returns immediately when signal is already aborted', async () => {
      const log = new AgentSseLog();
      log.append(textDelta('a'));

      const controller = new AbortController();
      controller.abort();

      const events = await collect(
        log.createReader({signal: controller.signal}),
      );
      expect(events).toEqual([]);
    });

    it('does not affect other readers when one is aborted', async () => {
      const log = new AgentSseLog();
      const controller = new AbortController();

      const abortablePromise = collect(
        log.createReader({signal: controller.signal}),
      );
      const normalPromise = collect(log.createReader());

      await Promise.resolve();

      log.append(textDelta('shared'));
      await Promise.resolve();

      controller.abort();

      log.append(textDelta('after-abort'));
      log.seal();

      const [abortableResult, normalResult] = await Promise.all([
        abortablePromise,
        normalPromise,
      ]);

      expect(abortableResult).toEqual([textDelta('shared')]);
      expect(normalResult).toEqual([
        textDelta('shared'),
        textDelta('after-abort'),
      ]);
    });
  });

  describe('startIndex', () => {
    it('skips events before startIndex', async () => {
      const log = new AgentSseLog();
      log.append(textDelta('0'));
      log.append(textDelta('1'));
      log.append(textDelta('2'));
      log.seal();

      const events = await collect(log.createReader({startIndex: 2}));
      expect(events).toEqual([textDelta('2')]);
    });

    it('returns empty when startIndex equals length on a sealed log', async () => {
      const log = new AgentSseLog();
      log.append(textDelta('a'));
      log.seal();

      const events = await collect(log.createReader({startIndex: 1}));
      expect(events).toEqual([]);
    });

    it('waits for events when startIndex is beyond current length', async () => {
      const log = new AgentSseLog();

      const resultPromise = collect(log.createReader({startIndex: 2}));
      await Promise.resolve();

      log.append(textDelta('0'));
      log.append(textDelta('1'));
      log.append(textDelta('2'));
      log.seal();

      const events = await resultPromise;
      expect(events).toEqual([textDelta('2')]);
    });
    it('throws when startIndex is negative', () => {
      const log = new AgentSseLog();
      expect(() => log.createReader({startIndex: -1})).toThrow(
        'startIndex must be non-negative',
      );
    });
  });
});
