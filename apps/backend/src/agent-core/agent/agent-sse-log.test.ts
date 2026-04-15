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
  describe('append basics', () => {
    it('starts with length 0', () => {
      const log = new AgentSseLog();
      expect(log.length).toBe(0);
    });

    it('increments length on append', () => {
      const log = new AgentSseLog();
      log.append(textDelta('a'));
      expect(log.length).toBe(1);
      log.append(textDelta('b'));
      expect(log.length).toBe(2);
    });

    it('append always works (no seal)', () => {
      const log = new AgentSseLog();
      log.append(textDelta('a'));
      log.append(textDelta('b'));
      log.append(textDelta('c'));
      expect(log.length).toBe(3);
      // Can keep appending indefinitely
      log.append(doneEvent());
      expect(log.length).toBe(4);
    });
  });

  describe('single reader: replay and live events', () => {
    it('replays all existing events', async () => {
      const log = new AgentSseLog();
      log.append(textDelta('a'));
      log.append(textDelta('b'));

      const controller = new AbortController();
      const collected = collect(log.createReader({signal: controller.signal}));

      await new Promise((r) => setTimeout(r, 10));
      controller.abort();

      const events = await collected;
      expect(events).toEqual([textDelta('a'), textDelta('b')]);
    });

    it('receives live events appended after reader starts', async () => {
      const log = new AgentSseLog();
      const controller = new AbortController();

      const resultPromise = collect(
        log.createReader({signal: controller.signal}),
      );

      // Let the reader start waiting.
      await Promise.resolve();

      log.append(textDelta('live-1'));
      log.append(textDelta('live-2'));

      await new Promise((r) => setTimeout(r, 10));
      controller.abort();

      const events = await resultPromise;
      expect(events).toEqual([textDelta('live-1'), textDelta('live-2')]);
    });

    it('replays existing events then receives live events', async () => {
      const log = new AgentSseLog();
      log.append(textDelta('existing'));
      const controller = new AbortController();

      const resultPromise = collect(
        log.createReader({signal: controller.signal}),
      );

      // Let the reader replay and then wait.
      await Promise.resolve();

      log.append(textDelta('live'));

      await new Promise((r) => setTimeout(r, 10));
      controller.abort();

      const events = await resultPromise;
      expect(events).toEqual([textDelta('existing'), textDelta('live')]);
    });
  });

  describe('reader ends only via AbortSignal', () => {
    it('reader blocks indefinitely when not aborted', async () => {
      const log = new AgentSseLog();
      log.append(textDelta('a'));

      const reader = log.createReader();
      const iter = reader[Symbol.asyncIterator]();

      // First event is available immediately
      const first = await iter.next();
      expect(first.value).toEqual(textDelta('a'));

      // Next call blocks — resolve a race to prove it
      const timeout = new Promise<'timeout'>((r) =>
        setTimeout(() => {
          r('timeout');
        }, 50),
      );
      const next = iter.next().then(() => 'resolved' as const);
      expect(await Promise.race([next, timeout])).toBe('timeout');
    });

    it('reader ends when signal is aborted after draining', async () => {
      const log = new AgentSseLog();
      log.append(textDelta('a'));
      log.append(textDelta('b'));

      const controller = new AbortController();
      const collected = collect(log.createReader({signal: controller.signal}));

      // Let the reader drain existing events, then abort
      await new Promise((r) => setTimeout(r, 10));
      controller.abort();

      const events = await collected;
      expect(events).toEqual([textDelta('a'), textDelta('b')]);
    });
  });

  describe('multiple readers with independent cursors', () => {
    it('two readers independently iterate the same log', async () => {
      const log = new AgentSseLog();
      log.append(textDelta('a'));
      const controller = new AbortController();

      const reader1Promise = collect(
        log.createReader({signal: controller.signal}),
      );
      const reader2Promise = collect(
        log.createReader({signal: controller.signal}),
      );

      await Promise.resolve();

      log.append(textDelta('b'));

      await new Promise((r) => setTimeout(r, 10));
      controller.abort();

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
      const controller = new AbortController();

      const all = collect(log.createReader({signal: controller.signal}));
      const fromOne = collect(
        log.createReader({startIndex: 1, signal: controller.signal}),
      );
      const fromTwo = collect(
        log.createReader({startIndex: 2, signal: controller.signal}),
      );

      await new Promise((r) => setTimeout(r, 10));
      controller.abort();

      expect(await all).toEqual([
        textDelta('a'),
        textDelta('b'),
        textDelta('c'),
      ]);
      expect(await fromOne).toEqual([textDelta('b'), textDelta('c')]);
      expect(await fromTwo).toEqual([textDelta('c')]);
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
      const abortController = new AbortController();
      const normalController = new AbortController();

      const abortablePromise = collect(
        log.createReader({signal: abortController.signal}),
      );
      const normalPromise = collect(
        log.createReader({signal: normalController.signal}),
      );

      await Promise.resolve();

      log.append(textDelta('shared'));
      await Promise.resolve();

      abortController.abort();

      log.append(textDelta('after-abort'));

      await new Promise((r) => setTimeout(r, 10));
      normalController.abort();

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
      const controller = new AbortController();

      const collected = collect(
        log.createReader({startIndex: 2, signal: controller.signal}),
      );
      await new Promise((r) => setTimeout(r, 10));
      controller.abort();

      const events = await collected;
      expect(events).toEqual([textDelta('2')]);
    });

    it('returns empty when startIndex equals length', async () => {
      const log = new AgentSseLog();
      log.append(textDelta('a'));
      const controller = new AbortController();

      const collected = collect(
        log.createReader({startIndex: 1, signal: controller.signal}),
      );
      await new Promise((r) => setTimeout(r, 10));
      controller.abort();

      const events = await collected;
      expect(events).toEqual([]);
    });

    it('waits for events when startIndex is beyond current length', async () => {
      const log = new AgentSseLog();
      const controller = new AbortController();

      const resultPromise = collect(
        log.createReader({startIndex: 2, signal: controller.signal}),
      );
      await Promise.resolve();

      log.append(textDelta('0'));
      log.append(textDelta('1'));
      log.append(textDelta('2'));

      await new Promise((r) => setTimeout(r, 10));
      controller.abort();

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
