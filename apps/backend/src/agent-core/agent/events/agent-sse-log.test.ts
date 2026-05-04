import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type {
  SseBaseEvent,
  SseDoneEvent,
  SseEvent,
  SseEventCursorEntry,
  SseMessageStartEvent,
  SseTextDeltaEvent,
  SseThinkingStartEvent,
} from '@omnicraft/sse-events';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {AgentSseLog} from './agent-sse-log.js';

/** Helper to create a minimal SseEvent for testing. */
function textDelta(content: string): SseTextDeltaEvent {
  return {type: 'text-delta', content};
}

function subagentOutput(agentId: string, event: SseBaseEvent): SseEvent {
  return {type: 'subagent-output', agentId, event};
}

function messageStart(messageId = 'msg-1'): SseMessageStartEvent {
  return {
    type: 'message-start',
    role: 'assistant',
    messageId,
    createdAt: 0,
    content: '',
  };
}

function thinkingStart(): SseThinkingStartEvent {
  return {type: 'thinking-start'};
}

function done(): SseDoneEvent {
  return {
    type: 'done',
    reason: 'complete',
    usage: {
      model: 'test-model',
      contextWindowTokens: 100,
      sessionInputTokens: 10,
      sessionOutputTokens: 5,
      sessionCacheReadInputTokens: 0,
      thinkingLevel: 'none',
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

async function collectEvents(
  iterable: AsyncIterable<SseEventCursorEntry>,
): Promise<SseEvent[]> {
  const entries = await collect(iterable);
  return entries.map((entry) => entry.event);
}

describe('AgentSseLog', () => {
  describe('single reader: replay and live events', () => {
    it('replays all existing events', async () => {
      const log = new AgentSseLog();
      await log.append(messageStart());
      await log.append(textDelta('a'));

      const controller = new AbortController();
      const collected = collectEvents(
        log.createReader({signal: controller.signal}),
      );

      await new Promise((r) => setTimeout(r, 10));
      controller.abort();

      const events = await collected;
      expect(events).toEqual([messageStart(), textDelta('a')]);
    });

    it('receives live events appended after reader starts', async () => {
      const log = new AgentSseLog();
      const controller = new AbortController();

      const resultPromise = collectEvents(
        log.createReader({signal: controller.signal}),
      );

      // Let the reader start waiting.
      await Promise.resolve();

      await log.append(textDelta('live-1'));
      await log.append(textDelta('live-2'));

      await new Promise((r) => setTimeout(r, 10));
      controller.abort();

      const events = await resultPromise;
      expect(events).toEqual([textDelta('live-1'), textDelta('live-2')]);
    });

    it('replays existing events then receives live events', async () => {
      const log = new AgentSseLog();
      await log.append(textDelta('existing'));
      const controller = new AbortController();

      const resultPromise = collectEvents(
        log.createReader({signal: controller.signal}),
      );

      // Let the reader replay and then wait.
      await Promise.resolve();

      await log.append(textDelta('live'));

      await new Promise((r) => setTimeout(r, 10));
      controller.abort();

      const events = await resultPromise;
      expect(events).toEqual([textDelta('existing'), textDelta('live')]);
    });
  });

  describe('reader ends only via AbortSignal', () => {
    it('reader blocks indefinitely when not aborted', async () => {
      const log = new AgentSseLog();
      await log.append(textDelta('a'));

      const reader = log.createReader();
      const iter = reader[Symbol.asyncIterator]();

      // First event is available immediately
      const first = await iter.next();
      expect(first.done).toBe(false);
      if (first.done) return;
      expect(first.value.event).toEqual(textDelta('a'));

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
      await log.append(messageStart());
      await log.append(textDelta('a'));

      const controller = new AbortController();
      const collected = collectEvents(
        log.createReader({signal: controller.signal}),
      );

      // Let the reader drain existing events, then abort
      await new Promise((r) => setTimeout(r, 10));
      controller.abort();

      const events = await collected;
      expect(events).toEqual([messageStart(), textDelta('a')]);
    });
  });

  describe('multiple readers with independent cursors', () => {
    it('two readers independently iterate the same log', async () => {
      const log = new AgentSseLog();
      await log.append(textDelta('a'));
      const controller = new AbortController();

      const reader1Promise = collectEvents(
        log.createReader({signal: controller.signal}),
      );
      const reader2Promise = collectEvents(
        log.createReader({signal: controller.signal}),
      );

      await Promise.resolve();

      await log.append(textDelta('b'));

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
      await log.append(messageStart());
      await log.append(thinkingStart());
      await log.append(textDelta('c'));
      const controller = new AbortController();

      const all = collectEvents(log.createReader({signal: controller.signal}));
      const fromOne = collectEvents(
        log.createReader({startIndex: 1, signal: controller.signal}),
      );
      const fromTwo = collectEvents(
        log.createReader({startIndex: 2, signal: controller.signal}),
      );

      await new Promise((r) => setTimeout(r, 10));
      controller.abort();

      expect(await all).toEqual([
        messageStart(),
        thinkingStart(),
        textDelta('c'),
      ]);
      expect(await fromOne).toEqual([thinkingStart(), textDelta('c')]);
      expect(await fromTwo).toEqual([textDelta('c')]);
    });
  });

  describe('AbortSignal cancels a waiting reader', () => {
    it('ends iteration silently when signal is aborted', async () => {
      const log = new AgentSseLog();
      const controller = new AbortController();

      const resultPromise = collectEvents(
        log.createReader({signal: controller.signal}),
      );

      await Promise.resolve();

      await log.append(textDelta('before-abort'));

      // Let the reader consume the event and go back to waiting.
      await Promise.resolve();

      controller.abort();

      const events = await resultPromise;
      expect(events).toEqual([textDelta('before-abort')]);
    });

    it('returns immediately when signal is already aborted', async () => {
      const log = new AgentSseLog();
      await log.append(textDelta('a'));

      const controller = new AbortController();
      controller.abort();

      const events = await collectEvents(
        log.createReader({signal: controller.signal}),
      );
      expect(events).toEqual([]);
    });

    it('does not affect other readers when one is aborted', async () => {
      const log = new AgentSseLog();
      const abortController = new AbortController();
      const normalController = new AbortController();

      const abortablePromise = collectEvents(
        log.createReader({signal: abortController.signal}),
      );
      const normalPromise = collectEvents(
        log.createReader({signal: normalController.signal}),
      );

      await Promise.resolve();

      await log.append(textDelta('shared'));
      await Promise.resolve();

      abortController.abort();

      await log.append(textDelta('after-abort'));

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
      await log.append(textDelta('0'));
      await log.append(textDelta('1'));
      await log.append(textDelta('2'));
      const controller = new AbortController();

      const collected = collectEvents(
        log.createReader({startIndex: 2, signal: controller.signal}),
      );
      await new Promise((r) => setTimeout(r, 10));
      controller.abort();

      const events = await collected;
      expect(events).toEqual([textDelta('2')]);
    });

    it('returns empty when startIndex equals length', async () => {
      const log = new AgentSseLog();
      await log.append(textDelta('a'));
      const controller = new AbortController();

      const collected = collectEvents(
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

      const resultPromise = collectEvents(
        log.createReader({startIndex: 2, signal: controller.signal}),
      );
      await Promise.resolve();

      await log.append(textDelta('0'));
      await log.append(textDelta('1'));
      await log.append(textDelta('2'));

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

    it('throws when startIndex is not an integer', () => {
      const log = new AgentSseLog();
      expect(() => log.createReader({startIndex: 1.5})).toThrow(
        'startIndex must be a safe non-negative integer',
      );
    });
  });

  describe('file-backed mode', () => {
    let tmpDir: string;
    let filePath: string;

    beforeEach(async () => {
      tmpDir = await mkdtemp(path.join(os.tmpdir(), 'asl-test-'));
      filePath = path.join(tmpDir, 'sse-events.jsonl');
    });

    afterEach(async () => {
      await rm(tmpDir, {recursive: true, force: true});
    });

    it('writes each event as a JSON line to the file', async () => {
      const log = new AgentSseLog(filePath);
      await log.append(textDelta('a'));
      await log.append(textDelta('b'));

      const content = await readFile(filePath, 'utf-8');
      const lines = content.trimEnd().split('\n');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0])).toEqual(textDelta('a'));
      expect(JSON.parse(lines[1])).toEqual(textDelta('b'));
    });

    it('creates parent directory if it does not exist', async () => {
      const nestedPath = path.join(tmpDir, 'nested', 'dir', 'sse-events.jsonl');
      const log = new AgentSseLog(nestedPath);
      await log.append(textDelta('a'));

      const content = await readFile(nestedPath, 'utf-8');
      expect(content.trimEnd()).toBe(JSON.stringify(textDelta('a')));
    });

    it('cold append does not populate in-memory array', async () => {
      const log = new AgentSseLog(filePath);
      await log.append(textDelta('a'));
      await log.append(textDelta('b'));
      expect(log.activeReaderCount).toBe(0);
    });

    it('first reader triggers ensureLoaded and can read historical events', async () => {
      const log = new AgentSseLog(filePath);
      await log.append(messageStart());
      await log.append(textDelta('a'));

      const controller = new AbortController();
      const collected = collectEvents(
        log.createReader({signal: controller.signal}),
      );

      await new Promise((r) => setTimeout(r, 10));
      controller.abort();

      const events = await collected;
      expect(events).toEqual([messageStart(), textDelta('a')]);
    });

    it('last reader leaving triggers unload', async () => {
      const log = new AgentSseLog(filePath);
      await log.append(textDelta('a'));

      const controller = new AbortController();
      const reader = collectEvents(
        log.createReader({signal: controller.signal}),
      );

      await new Promise((r) => setTimeout(r, 10));
      controller.abort();
      await reader;

      expect(log.activeReaderCount).toBe(0);
    });

    it('hot append writes to both file and memory', async () => {
      const log = new AgentSseLog(filePath);
      await log.append(textDelta('a'));

      const controller = new AbortController();
      const collected = collectEvents(
        log.createReader({signal: controller.signal}),
      );

      await new Promise((r) => setTimeout(r, 10));

      await log.append(textDelta('b'));

      await new Promise((r) => setTimeout(r, 10));
      controller.abort();

      const events = await collected;
      expect(events).toEqual([textDelta('a'), textDelta('b')]);

      const content = await readFile(filePath, 'utf-8');
      const lines = content.trimEnd().split('\n');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0])).toEqual(textDelta('a'));
      expect(JSON.parse(lines[1])).toEqual(textDelta('b'));
    });

    it('after unload, new append only writes to file', async () => {
      const log = new AgentSseLog(filePath);
      await log.append(textDelta('a'));

      const controller = new AbortController();
      const reader1 = collectEvents(
        log.createReader({signal: controller.signal}),
      );

      await new Promise((r) => setTimeout(r, 10));
      controller.abort();
      await reader1;

      await log.append(textDelta('b'));
      expect(log.activeReaderCount).toBe(0);

      const content = await readFile(filePath, 'utf-8');
      const lines = content.trimEnd().split('\n');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0])).toEqual(textDelta('a'));
      expect(JSON.parse(lines[1])).toEqual(textDelta('b'));
    });

    it('ensureLoaded discards corrupted last line and rewrites file', async () => {
      const validEvent = textDelta('valid');
      await writeFile(
        filePath,
        JSON.stringify(validEvent) + '\n' + 'corrupted-json\n',
      );

      const log = new AgentSseLog(filePath);
      const controller = new AbortController();
      const collected = collectEvents(
        log.createReader({signal: controller.signal}),
      );

      await new Promise((r) => setTimeout(r, 10));
      controller.abort();

      const events = await collected;
      expect(events).toEqual([validEvent]);

      const content = await readFile(filePath, 'utf-8');
      const lines = content.trimEnd().split('\n');
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toEqual(validEvent);
    });
  });

  describe('replay compression integration', () => {
    it('compresses top-level replay delta events', async () => {
      const log = new AgentSseLog();
      await log.append(textDelta('a'));
      await log.append(textDelta('b'));
      await log.append(textDelta('c'));

      const controller = new AbortController();
      const collected = collectEvents(
        log.createReader({signal: controller.signal}),
      );
      await new Promise((r) => setTimeout(r, 10));
      controller.abort();

      expect(await collected).toEqual([textDelta('abc')]);
    });

    it('reports the raw next index for compressed top-level replay delta events', async () => {
      const log = new AgentSseLog();
      await log.append(textDelta('a'));
      await log.append(textDelta('b'));
      await log.append(textDelta('c'));
      await log.append(done());

      const controller = new AbortController();
      const collected = collect(log.createReader({signal: controller.signal}));
      await new Promise((r) => setTimeout(r, 10));
      controller.abort();

      expect(await collected).toEqual([
        {event: textDelta('abc'), nextIndex: 3},
        {event: done(), nextIndex: 4},
      ]);
    });

    it('does not compress top-level live delta events after replay', async () => {
      const log = new AgentSseLog();
      await log.append(textDelta('replay'));

      const controller = new AbortController();
      const collected = collectEvents(
        log.createReader({signal: controller.signal}),
      );

      // Let the reader drain replay and enter live mode.
      await new Promise((r) => setTimeout(r, 10));

      await log.append(textDelta('live-1'));
      await log.append(textDelta('live-2'));

      await new Promise((r) => setTimeout(r, 10));
      controller.abort();

      expect(await collected).toEqual([
        textDelta('replay'),
        textDelta('live-1'),
        textDelta('live-2'),
      ]);
    });

    it('does not compress live delta events appended while replay is draining', async () => {
      const log = new AgentSseLog();
      await log.append(messageStart('replay-1'));

      const controller = new AbortController();
      const iterator = log
        .createReader({signal: controller.signal})
        [Symbol.asyncIterator]();

      try {
        await expect(iterator.next()).resolves.toEqual({
          done: false,
          value: {event: messageStart('replay-1'), nextIndex: 1},
        });

        await log.append(textDelta('live-1'));
        await log.append(textDelta('live-2'));

        await expect(iterator.next()).resolves.toEqual({
          done: false,
          value: {event: textDelta('live-1'), nextIndex: 2},
        });
        await expect(iterator.next()).resolves.toEqual({
          done: false,
          value: {event: textDelta('live-2'), nextIndex: 3},
        });
      } finally {
        controller.abort();
        await iterator.return?.();
      }
    });

    it('compresses nested subagent replay delta events', async () => {
      const log = new AgentSseLog();
      await log.append(subagentOutput('subagent-1', textDelta('a')));
      await log.append(subagentOutput('subagent-1', textDelta('b')));

      const controller = new AbortController();
      const collected = collectEvents(
        log.createReader({signal: controller.signal}),
      );
      await new Promise((r) => setTimeout(r, 10));
      controller.abort();

      expect(await collected).toEqual([
        subagentOutput('subagent-1', textDelta('ab')),
      ]);
    });

    it('reports the raw next index for compressed nested subagent replay delta events', async () => {
      const log = new AgentSseLog();
      await log.append(subagentOutput('subagent-1', textDelta('a')));
      await log.append(subagentOutput('subagent-1', textDelta('b')));
      await log.append({
        type: 'subagent-complete',
        agentId: 'subagent-1',
        status: 'success',
      });

      const controller = new AbortController();
      const collected = collect(log.createReader({signal: controller.signal}));
      await new Promise((r) => setTimeout(r, 10));
      controller.abort();

      expect(await collected).toEqual([
        {event: subagentOutput('subagent-1', textDelta('ab')), nextIndex: 2},
        {
          event: {
            type: 'subagent-complete',
            agentId: 'subagent-1',
            status: 'success',
          },
          nextIndex: 3,
        },
      ]);
    });

    it('does not compress nested subagent live delta events after replay', async () => {
      const log = new AgentSseLog();
      await log.append(subagentOutput('subagent-1', textDelta('replay')));

      const controller = new AbortController();
      const collected = collectEvents(
        log.createReader({signal: controller.signal}),
      );

      // Let the reader drain replay and enter live mode.
      await new Promise((r) => setTimeout(r, 10));

      await log.append(subagentOutput('subagent-1', textDelta('live-1')));
      await log.append(subagentOutput('subagent-1', textDelta('live-2')));

      await new Promise((r) => setTimeout(r, 10));
      controller.abort();

      expect(await collected).toEqual([
        subagentOutput('subagent-1', textDelta('replay')),
        subagentOutput('subagent-1', textDelta('live-1')),
        subagentOutput('subagent-1', textDelta('live-2')),
      ]);
    });
  });
});
