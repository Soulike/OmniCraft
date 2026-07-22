import crypto from 'node:crypto';
import {mkdtempSync, realpathSync, rmSync, statSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type {SseEvent} from '@omnicraft/sse-events';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {llmApi, type LlmConfig, type LlmEventStream} from '../llm-api/index.js';
import {LlmSession} from '../llm-session/index.js';
import {createMockTool} from '../tool/testing.js';
import {ToolRegistry} from '../tool/tool-registry.js';
import type {ToolDefinition} from '../tool/types.js';
import {Agent} from './agent.js';
import type {AgentSnapshot} from './types.js';

const MAIN_CONFIG: LlmConfig = {
  apiFormat: 'openai-responses',
  apiKey: 'test-key',
  baseUrl: 'https://example.test',
  model: 'main-model',
  thinkingLevel: 'high',
  // Prompt budget (context - output) intentionally matches the old
  // hardcoded default of 128_000 for an unmapped openai-responses model —
  // several tests below size their fixture content to cross that
  // compaction-trigger threshold (see the 12 x 30_000-char messages further
  // down in this file).
  maxContextTokens: 144_384,
  maxOutputTokens: 16_384,
};

const LIGHT_CONFIG: LlmConfig = {
  ...MAIN_CONFIG,
  model: 'light-model',
};

function emptyUsage() {
  return {
    currentContextInputTokens: 0,
    latestCallOutputTokens: 0,
    sessionInputTokens: 0,
    sessionOutputTokens: 0,
    sessionCacheReadInputTokens: 0,
  };
}

class TestAgent extends Agent {}

class UsageTestAgent extends Agent {
  streamForTest(userMessage: string): AsyncIterable<SseEvent> {
    return this.runAgentLoop(userMessage, new AbortController().signal);
  }
}

class TestToolRegistry extends ToolRegistry {
  static createForTest(): TestToolRegistry {
    return new TestToolRegistry();
  }

  public override register(tool: ToolDefinition): void {
    super.register(tool);
  }
}

function testAgentOptions() {
  // Provide a per-call tmp workingDirectory so the Agent constructor's
  // default path (which would mkdir under os.tmpdir() and leak a directory)
  // doesn't run. The dir is registered for cleanup by the afterEach below.
  const workingDirectory = mkdtempSync(path.join(os.tmpdir(), 'agent-test-'));
  tmpDirsToCleanup.add(workingDirectory);
  return {
    toolRegistries: [],
    skillRegistries: [],
    stopChecks: [],
    baseSystemPrompt: '',
    getMaxToolRounds: () => 1,
    getTierConfig: () => Promise.resolve(LIGHT_CONFIG),
    workingDirectory,
  };
}

function track<T extends Agent>(agent: T): T {
  tmpDirsToCleanup.add(path.dirname(agent.getScratchDirectory()));
  return agent;
}

const tmpDirsToCleanup = new Set<string>();

afterEach(() => {
  for (const dir of tmpDirsToCleanup) {
    try {
      rmSync(dir, {recursive: true, force: true});
    } catch {
      // ignore — best-effort cleanup
    }
  }
  tmpDirsToCleanup.clear();
});

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function* mainCompletionStream(): LlmEventStream {
  yield {type: 'message-start', messageId: 'assistant-message'};
  await delay(20);
  yield {type: 'text-delta', content: 'Assistant response'};
  yield {
    type: 'message-end',
    stopReason: 'end_turn',
    usage: {inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0},
  };
}

async function* usageCompletionStream(usage: {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
}): LlmEventStream {
  yield {type: 'message-start', messageId: 'assistant-message'};
  await Promise.resolve();
  yield {type: 'text-delta', content: 'Assistant response'};
  yield {type: 'message-end', stopReason: 'end_turn', usage};
}

async function* toolCallCompletionStream(
  toolName: string,
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
  },
): LlmEventStream {
  yield {type: 'message-start', messageId: 'assistant-tool-call-message'};
  await Promise.resolve();
  yield {type: 'tool-call-start', callId: 'call-1', toolName};
  yield {type: 'tool-call-delta', callId: 'call-1', argumentsDelta: '{}'};
  yield {type: 'tool-call-end', callId: 'call-1'};
  yield {type: 'message-end', stopReason: 'tool_use', usage};
}

async function* titleCompletionStream(): LlmEventStream {
  yield {type: 'message-start', messageId: 'title-message'};
  await Promise.resolve();
  yield {type: 'text-delta', content: 'Short Title'};
  yield {
    type: 'message-end',
    stopReason: 'end_turn',
    usage: {inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0},
  };
}

async function* summaryCompletionStream(): LlmEventStream {
  yield {type: 'message-start', messageId: 'summary-message'};
  await Promise.resolve();
  yield {type: 'text-delta', content: 'Compacted summary'};
  yield {
    type: 'message-end',
    stopReason: 'end_turn',
    usage: {inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0},
  };
}

async function* failingStream(): LlmEventStream {
  yield {type: 'message-start', messageId: 'failed-message'};
  await Promise.resolve();
  throw new Error('summary failed');
}

async function collectUntilDone(agent: Agent): Promise<SseEvent[]> {
  const controller = new AbortController();
  const events: SseEvent[] = [];

  for await (const entry of agent.subscribe({signal: controller.signal})) {
    const {event} = entry;
    events.push(event);
    if (event.type === 'done') {
      controller.abort();
      break;
    }
  }

  return events;
}

async function collectUntilError(agent: Agent): Promise<SseEvent[]> {
  const controller = new AbortController();
  const events: SseEvent[] = [];

  for await (const entry of agent.subscribe({signal: controller.signal})) {
    const {event} = entry;
    events.push(event);
    if (event.type === 'error') {
      controller.abort();
      break;
    }
  }

  return events;
}

async function collectAll(
  stream: AsyncIterable<SseEvent>,
): Promise<SseEvent[]> {
  const events: SseEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

async function collectUntilTerminal(
  agent: Agent,
  startIndex = 0,
): Promise<{events: SseEvent[]; nextIndex: number}> {
  const controller = new AbortController();
  const events: SseEvent[] = [];
  let nextIndex = startIndex;

  for await (const entry of agent.subscribe({
    startIndex,
    signal: controller.signal,
  })) {
    events.push(entry.event);
    nextIndex = entry.nextIndex;
    if (entry.event.type === 'done' || entry.event.type === 'error') {
      controller.abort();
      break;
    }
  }

  return {events, nextIndex};
}

async function* streamUntilAbortedThenThrow(
  signal: AbortSignal | undefined,
): LlmEventStream {
  yield {type: 'message-start', messageId: 'aborted-message'};
  await new Promise<void>((resolve) => {
    if (!signal || signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener('abort', () => {
      resolve();
    });
  });
  throw new Error('Request aborted');
}

async function* failingStreamAfterStart(): LlmEventStream {
  yield {type: 'message-start', messageId: 'failed-message'};
  await Promise.resolve();
  throw new Error('provider exploded');
}

describe('Agent title generation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits the first session title after the first user message starts', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion').mockImplementation((options) => {
      if (options.config.model === LIGHT_CONFIG.model) {
        return titleCompletionStream();
      }
      return mainCompletionStream();
    });

    const agent = track(
      new TestAgent(() => Promise.resolve(MAIN_CONFIG), {
        ...testAgentOptions(),
      }),
    );

    const eventsPromise = collectUntilDone(agent);
    agent.enqueueUserTurn('Please help me rename a component');
    const events = await eventsPromise;

    const userStartIndex = events.findIndex(
      (event) => event.type === 'message-start' && event.role === 'user',
    );
    const titleIndex = events.findIndex(
      (event) => event.type === 'session-title',
    );
    const doneIndex = events.findIndex((event) => event.type === 'done');

    expect(userStartIndex).toBeGreaterThanOrEqual(0);
    expect(titleIndex).toBeGreaterThan(userStartIndex);
    expect(titleIndex).toBeLessThan(doneIndex);
    expect(events[doneIndex]).toMatchObject({
      type: 'done',
      reason: 'complete',
    });
    const lastUsageUpdate = events.findLast(
      (event) => event.type === 'usage-update',
    );
    expect(lastUsageUpdate).toBeDefined();
    expect(lastUsageUpdate).toMatchObject({
      type: 'usage-update',
      usage: {thinkingLevel: 'high'},
    });
    expect(events[titleIndex]).toEqual({
      type: 'session-title',
      title: 'Short Title',
    });
  });
});

describe('Agent usage reporting', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits latest context input separately from cumulative session totals', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion')
      .mockReturnValueOnce(
        usageCompletionStream({
          inputTokens: 100,
          outputTokens: 10,
          cacheReadInputTokens: 20,
        }),
      )
      .mockReturnValueOnce(
        usageCompletionStream({
          inputTokens: 40,
          outputTokens: 8,
          cacheReadInputTokens: 5,
        }),
      );
    const agent = track(
      new UsageTestAgent(
        () => Promise.resolve(MAIN_CONFIG),
        testAgentOptions(),
      ),
    );

    await collectAll(agent.streamForTest('first'));
    const events = await collectAll(agent.streamForTest('second'));

    expect(events.at(-1)).toMatchObject({type: 'done', reason: 'complete'});
    const lastUsageUpdate = events.findLast(
      (event) => event.type === 'usage-update',
    );
    expect(lastUsageUpdate).toMatchObject({
      type: 'usage-update',
      usage: {
        currentContextInputTokens: 40,
        sessionInputTokens: 140,
        sessionOutputTokens: 18,
        sessionCacheReadInputTokens: 25,
      },
    });
  });

  it('emits done usage with compacted context after turn-end compaction', async () => {
    vi.spyOn(llmApi, 'streamCompletion').mockImplementation((options) => {
      const isSummaryRequest =
        options.tools.length === 0 &&
        options.messages.length === 1 &&
        options.messages[0]?.role === 'user' &&
        options.messages[0].content.includes('<history_to_summarize>');

      if (isSummaryRequest) return summaryCompletionStream();

      return usageCompletionStream({
        inputTokens: 120_000,
        outputTokens: 7,
        cacheReadInputTokens: 3,
      });
    });
    const agent = track(
      new UsageTestAgent(
        () => Promise.resolve(MAIN_CONFIG),
        testAgentOptions(),
      ),
    );

    const events = await collectAll(agent.streamForTest('compact this turn'));
    const doneEvent = events.at(-1);
    expect(doneEvent?.type).toBe('done');

    const lastUsageUpdate = events.findLast(
      (event) => event.type === 'usage-update',
    );
    if (lastUsageUpdate?.type !== 'usage-update') {
      throw new Error('Expected a usage-update event before done');
    }
    expect(lastUsageUpdate.usage.currentContextInputTokens).toBeGreaterThan(0);
    expect(lastUsageUpdate.usage.currentContextInputTokens).toBeLessThan(
      120_000,
    );
    expect(lastUsageUpdate.usage.sessionInputTokens).toBe(120_000);
    expect(lastUsageUpdate.usage.sessionOutputTokens).toBe(7);
    expect(lastUsageUpdate.usage.sessionCacheReadInputTokens).toBe(3);
  });

  it('emits a usage-update event after each LLM round', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion').mockReturnValue(
      usageCompletionStream({
        inputTokens: 100,
        outputTokens: 10,
        cacheReadInputTokens: 0,
      }),
    );
    const agent = track(
      new UsageTestAgent(
        () => Promise.resolve(MAIN_CONFIG),
        testAgentOptions(),
      ),
    );

    const events = await collectAll(agent.streamForTest('one round'));

    const usageUpdates = events.filter(
      (event) => event.type === 'usage-update',
    );
    // One usage-update after the LLM call, plus one in emitDoneAfterTurn
    // after compaction. UsageTestAgent's stream emits no tool calls, so the
    // loop body doesn't execute.
    expect(usageUpdates.length).toBe(2);

    const doneIndex = events.findIndex((event) => event.type === 'done');
    expect(doneIndex).toBeGreaterThanOrEqual(0);
    const lastEventBeforeDone = events[doneIndex - 1];
    expect(lastEventBeforeDone.type).toBe('usage-update');
  });

  it('emits a usage-update event after the in-loop submitToolResults round', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion')
      // First call: assistant requests one tool call.
      .mockReturnValueOnce(
        toolCallCompletionStream('mock_tool', {
          inputTokens: 100,
          outputTokens: 10,
          cacheReadInputTokens: 0,
        }),
      )
      // Second call: assistant responds with text after tool result, no more tool calls.
      .mockReturnValueOnce(
        usageCompletionStream({
          inputTokens: 50,
          outputTokens: 5,
          cacheReadInputTokens: 0,
        }),
      );

    const registry = TestToolRegistry.createForTest();
    registry.register(createMockTool('mock_tool'));

    const agent = track(
      new UsageTestAgent(() => Promise.resolve(MAIN_CONFIG), {
        ...testAgentOptions(),
        toolRegistries: [registry],
        getMaxToolRounds: () => 5,
      }),
    );

    const events = await collectAll(agent.streamForTest('use the tool'));

    // Three usage-update events: after the first LLM call, after
    // submitToolResults consumed the second LLM call, and the
    // post-compaction emit in emitDoneAfterTurn.
    const usageUpdates = events.filter(
      (event) => event.type === 'usage-update',
    );
    expect(usageUpdates.length).toBe(3);

    // The in-loop usage-update for the tool-result round must appear AFTER
    // the tool finishes and BEFORE the next round (which here is the
    // post-compaction final emit + done).
    const toolEndIndex = events.findIndex(
      (event) => event.type === 'tool-execute-end',
    );
    expect(toolEndIndex).toBeGreaterThanOrEqual(0);
    const usageUpdatesAfterTool = events
      .slice(toolEndIndex + 1)
      .filter((event) => event.type === 'usage-update');
    // One after submitToolResults, one after compaction.
    expect(usageUpdatesAfterTool.length).toBe(2);
  });
});

describe('Agent compaction lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests turn-end compaction before emitting done', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion').mockImplementation(() =>
      mainCompletionStream(),
    );
    const order: string[] = [];
    const compactSpy = vi
      .spyOn(LlmSession.prototype, 'compactIfNeeded')
      // eslint-disable-next-line @typescript-eslint/require-await, require-yield
      .mockImplementation(async function* () {
        order.push('compact');
      });
    const agent = track(
      new UsageTestAgent(
        () => Promise.resolve(MAIN_CONFIG),
        testAgentOptions(),
      ),
    );

    for await (const event of agent.streamForTest('Finish the task')) {
      if (event.type === 'done') {
        order.push('done');
      }
    }

    expect(order).toEqual(['compact', 'done']);
    const [compactionOptions] = compactSpy.mock.calls[0];
    expect(compactionOptions.reason).toBe('after-turn');
    expect(compactionOptions.tools).toEqual([]);
    expect(typeof compactionOptions.systemPrompt).toBe('string');
  });

  it('emits a clear error when pre-call compaction fails', async () => {
    vi.spyOn(llmApi, 'streamCompletion').mockReturnValue(failingStream());
    const agent = track(
      new TestAgent(() => Promise.resolve(MAIN_CONFIG), testAgentOptions(), {
        id: crypto.randomUUID(),
        title: 'Existing Title',
        sseEventCount: 0,
        llmSession: {
          id: 'llm-session-1',
          compactions: [],
          latestUsageInputMessageCount: null,
          messages: Array.from({length: 12}, (_, index) => ({
            id: `old-${index.toString()}`,
            createdAt: index,
            role: 'user' as const,
            content: `old message ${index.toString()} ${'x'.repeat(30_000)}`,
          })),
          usage: emptyUsage(),
        },
        todos: [],
        options: {},
      }),
    );

    const eventsPromise = collectUntilError(agent);
    agent.enqueueUserTurn('Trigger compaction');
    const events = await eventsPromise;

    const lastEvent = events.at(-1);
    expect(lastEvent?.type).toBe('error');
    if (lastEvent?.type !== 'error') {
      throw new Error('Expected final event to be an error');
    }
    expect(lastEvent.message).toContain(
      'Failed to compact LLM session before model call',
    );
    const types = events.map((e) => e.type);
    expect(types.indexOf('context-compaction-start')).toBeLessThan(
      types.indexOf('context-compaction-error'),
    );
    expect(types.indexOf('context-compaction-error')).toBeLessThan(
      types.indexOf('error'),
    );
  });

  it('emits start → end → done in that order on after-turn success', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion').mockImplementation(() =>
      mainCompletionStream(),
    );
    const fakeStart = {
      type: 'context-compaction-start',
      compactionId: 'cid-1',
      reason: 'after-turn',
      beforeTokens: 1000,
      messageCount: 5,
    } as const;
    const fakeEnd = {
      type: 'context-compaction-end',
      compactionId: 'cid-1',
      summary: 'summary',
      beforeTokens: 1000,
      afterTokens: 200,
      messageCount: 5,
      durationMs: 100,
    } as const;
    vi.spyOn(LlmSession.prototype, 'compactIfNeeded')
      // eslint-disable-next-line @typescript-eslint/require-await
      .mockImplementation(async function* () {
        yield fakeStart;
        yield fakeEnd;
      });

    const agent = track(
      new TestAgent(() => Promise.resolve(MAIN_CONFIG), testAgentOptions()),
    );
    const eventsPromise = collectUntilDone(agent);
    agent.enqueueUserTurn('hi');
    const events = await eventsPromise;

    const types = events.map((e) => e.type);
    const startIdx = types.indexOf('context-compaction-start');
    const endIdx = types.indexOf('context-compaction-end');
    const doneIdx = types.lastIndexOf('done');
    expect(startIdx).toBeGreaterThan(-1);
    expect(endIdx).toBe(startIdx + 1);
    expect(doneIdx).toBeGreaterThan(endIdx);
  });

  it('emits start → error → done on after-turn failure (no top-level error)', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion').mockImplementation(() =>
      mainCompletionStream(),
    );
    const fakeStart = {
      type: 'context-compaction-start',
      compactionId: 'cid-2',
      reason: 'after-turn',
      beforeTokens: 1000,
      messageCount: 5,
    } as const;
    const fakeError = {
      type: 'context-compaction-error',
      compactionId: 'cid-2',
      reason: 'after-turn',
      message: 'provider failed',
      beforeTokens: 1000,
      messageCount: 5,
    } as const;
    vi.spyOn(LlmSession.prototype, 'compactIfNeeded')
      // eslint-disable-next-line @typescript-eslint/require-await
      .mockImplementation(async function* () {
        yield fakeStart;
        yield fakeError;
        throw new Error('provider failed');
      });

    const agent = track(
      new TestAgent(() => Promise.resolve(MAIN_CONFIG), testAgentOptions()),
    );
    const eventsPromise = collectUntilDone(agent);
    agent.enqueueUserTurn('hi');
    const events = await eventsPromise;

    const types = events.map((e) => e.type);
    expect(types).toContain('context-compaction-start');
    expect(types).toContain('context-compaction-error');
    expect(types).toContain('done');
    // After-turn failure must NOT emit a top-level error.
    expect(types.filter((t) => t === 'error')).toHaveLength(0);
    const startIdx = types.indexOf('context-compaction-start');
    const errorIdx = types.indexOf('context-compaction-error');
    const doneIdx = types.lastIndexOf('done');
    expect(errorIdx).toBe(startIdx + 1);
    expect(doneIdx).toBeGreaterThan(errorIdx);
  });
});

describe('Agent abort flow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits done:aborted when the provider stream throws after a user abort', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion').mockImplementation((options) =>
      streamUntilAbortedThenThrow(options.signal),
    );

    const agent = track(
      new TestAgent(() => Promise.resolve(MAIN_CONFIG), testAgentOptions()),
    );

    const eventsPromise = collectUntilTerminal(agent);
    agent.enqueueUserTurn('Stop me mid-stream');
    // Wait until the user message-start has been emitted before aborting,
    // so the abort lands while the stream is being consumed.
    await delay(10);
    agent.abort();
    const {events} = await eventsPromise;

    const lastEvent = events.at(-1);
    expect(lastEvent).toMatchObject({type: 'done', reason: 'aborted'});
    expect(events.some((event) => event.type === 'error')).toBe(false);
  });

  it('still emits error when the provider stream throws without a user abort', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion').mockImplementation(() =>
      failingStreamAfterStart(),
    );

    const agent = track(
      new TestAgent(() => Promise.resolve(MAIN_CONFIG), testAgentOptions()),
    );

    const eventsPromise = collectUntilTerminal(agent);
    agent.enqueueUserTurn('Trigger a real provider error');
    const {events} = await eventsPromise;

    const lastEvent = events.at(-1);
    expect(lastEvent?.type).toBe('error');
    if (lastEvent?.type !== 'error') {
      throw new Error('Expected final event to be an error');
    }
    expect(lastEvent.message).toBe('provider exploded');
  });

  it('emits done:aborted, skips the real provider call, and releases the mutex when pre-call compaction is aborted', async () => {
    const streamSpy = vi
      .spyOn(llmApi, 'streamCompletion')
      .mockImplementation((options) => {
        const isSummaryRequest =
          options.tools.length === 0 &&
          options.messages.length === 1 &&
          options.messages[0]?.role === 'user' &&
          options.messages[0].content.includes('<history_to_summarize>');

        if (isSummaryRequest) {
          return streamUntilAbortedThenThrow(options.signal);
        }

        // The real (non-summary) completion call. If we end up here after
        // an abort, the fix is broken.
        return mainCompletionStream();
      });

    const agent = track(
      new TestAgent(() => Promise.resolve(MAIN_CONFIG), testAgentOptions(), {
        id: crypto.randomUUID(),
        title: 'Existing Title',
        sseEventCount: 0,
        llmSession: {
          id: 'llm-session-compaction-abort',
          compactions: [],
          latestUsageInputMessageCount: null,
          messages: Array.from({length: 12}, (_, index) => ({
            id: `old-${index.toString()}`,
            createdAt: index,
            role: 'user' as const,
            content: `old message ${index.toString()} ${'x'.repeat(30_000)}`,
          })),
          usage: emptyUsage(),
        },
        todos: [],
        options: {},
      }),
    );

    const firstTurn = collectUntilTerminal(agent);
    agent.enqueueUserTurn('Trigger compaction then abort');
    await delay(10);
    agent.abort();
    const {events, nextIndex} = await firstTurn;

    const lastEvent = events.at(-1);
    expect(lastEvent).toMatchObject({type: 'done', reason: 'aborted'});
    expect(events.some((event) => event.type === 'error')).toBe(false);

    // Only the compaction-summary call should have been made — the real
    // provider call must not start after the user aborted.
    const nonSummaryCalls = streamSpy.mock.calls.filter(([options]) => {
      const isSummary =
        options.tools.length === 0 &&
        options.messages.length === 1 &&
        options.messages[0]?.role === 'user' &&
        options.messages[0].content.includes('<history_to_summarize>');
      return !isSummary;
    });
    expect(nonSummaryCalls).toHaveLength(0);

    // The session mutex must have been released so a follow-up turn can run.
    streamSpy.mockReset();
    streamSpy.mockImplementation(() =>
      usageCompletionStream({
        inputTokens: 1,
        outputTokens: 1,
        cacheReadInputTokens: 0,
      }),
    );
    const followUpPromise = collectUntilTerminal(agent, nextIndex);
    agent.enqueueUserTurn('Follow-up turn');
    const {events: followUpEvents} = await followUpPromise;
    expect(followUpEvents.at(-1)).toMatchObject({
      type: 'done',
      reason: 'complete',
    });
  });

  it('emits done:aborted when the post-tool-results stream throws after a user abort', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion')
      // First call: assistant requests one tool call.
      .mockReturnValueOnce(
        toolCallCompletionStream('mock_tool', {
          inputTokens: 10,
          outputTokens: 1,
          cacheReadInputTokens: 0,
        }),
      )
      // Second call (after submitToolResults): user aborts mid-stream.
      .mockImplementation((options) =>
        streamUntilAbortedThenThrow(options.signal),
      );

    const registry = TestToolRegistry.createForTest();
    registry.register(createMockTool('mock_tool'));

    const agent = track(
      new TestAgent(() => Promise.resolve(MAIN_CONFIG), {
        ...testAgentOptions(),
        toolRegistries: [registry],
        getMaxToolRounds: () => 5,
      }),
    );

    const eventsPromise = collectUntilTerminal(agent);
    agent.enqueueUserTurn('Use the tool then abort');
    // Wait long enough for the tool round to complete and the next stream
    // to start before aborting.
    await delay(30);
    agent.abort();
    const {events} = await eventsPromise;

    const lastEvent = events.at(-1);
    expect(lastEvent).toMatchObject({type: 'done', reason: 'aborted'});
    expect(events.some((event) => event.type === 'error')).toBe(false);
  });
});

describe('Agent snapshot restore', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes working directory for live subagent events', () => {
    const options = testAgentOptions();
    const agent = track(
      new TestAgent(() => Promise.resolve(MAIN_CONFIG), options),
    );

    expect(agent.getWorkingDirectory()).toBe(options.workingDirectory);
    expect(agent.getSseEventCount()).toBe(0);
  });

  it('restores the TODO list from a snapshot', () => {
    const snapshot: AgentSnapshot = {
      id: crypto.randomUUID(),
      title: 'Restored Session',
      sseEventCount: 0,
      llmSession: {
        id: 'llm-session-id',
        messages: [],
        compactions: [],
        latestUsageInputMessageCount: null,
        usage: emptyUsage(),
      },
      todos: [
        {index: 0, subject: 'Task A', description: 'Do A', status: 'completed'},
        {index: 1, subject: 'Task B', description: 'Do B', status: 'pending'},
      ],
      options: {
        workingDirectory: realpathSync(os.tmpdir()),
      },
    };

    const agent = track(
      new TestAgent(
        () => Promise.resolve(MAIN_CONFIG),
        testAgentOptions(),
        snapshot,
      ),
    );

    expect(agent.toSnapshot().todos).toEqual(snapshot.todos);
  });

  it('round-trips an empty TODO list through toSnapshot', () => {
    const snapshot: AgentSnapshot = {
      id: crypto.randomUUID(),
      title: 'Restored Session',
      sseEventCount: 0,
      llmSession: {
        id: 'llm-session-id',
        messages: [],
        compactions: [],
        latestUsageInputMessageCount: null,
        usage: emptyUsage(),
      },
      todos: [],
      options: {
        workingDirectory: realpathSync(os.tmpdir()),
      },
    };

    const agent = track(
      new TestAgent(
        () => Promise.resolve(MAIN_CONFIG),
        testAgentOptions(),
        snapshot,
      ),
    );

    expect(agent.toSnapshot().todos).toEqual([]);
  });
});

describe('Agent scratch directory', () => {
  function defaultedOptions() {
    const {workingDirectory: _omit, ...rest} = testAgentOptions();
    return rest;
  }
  function registerAgentTmpDir(id: string): string {
    const dir = path.join(realpathSync(os.tmpdir()), id);
    tmpDirsToCleanup.add(dir);
    return dir;
  }

  it('creates a per-id scratch dir and uses it as the working directory when none is provided', () => {
    const agent = new TestAgent(
      () => Promise.resolve(MAIN_CONFIG),
      defaultedOptions(),
    );
    registerAgentTmpDir(agent.id);

    const expected = path.join(realpathSync(os.tmpdir()), agent.id, 'scratch');
    expect(agent.getScratchDirectory()).toBe(expected);
    expect(agent.getWorkingDirectory()).toBe(expected);
    expect(agent.toSnapshot().options.workingDirectory).toBeUndefined();
    expect(statSync(expected).isDirectory()).toBe(true);
    expect(statSync(expected).mode & 0o777).toBe(0o700);
  });

  it('derives scratch from a restored snapshot without a working directory', () => {
    const id = crypto.randomUUID();
    const snapshot: AgentSnapshot = {
      id,
      title: 'Restored Session',
      sseEventCount: 0,
      llmSession: {
        id: 'llm-session-id',
        messages: [],
        compactions: [],
        latestUsageInputMessageCount: null,
        usage: emptyUsage(),
      },
      todos: [],
      options: {},
    };
    const agent = new TestAgent(
      () => Promise.resolve(MAIN_CONFIG),
      defaultedOptions(),
      snapshot,
    );
    registerAgentTmpDir(id);

    const expected = path.join(realpathSync(os.tmpdir()), id, 'scratch');
    expect(agent.getScratchDirectory()).toBe(expected);
    expect(agent.getWorkingDirectory()).toBe(expected);
    expect(agent.toSnapshot().options.workingDirectory).toBeUndefined();
  });

  it('rejects snapshots whose id is not a UUID', () => {
    const snapshot = {
      id: '../escape',
      title: 'Restored Session',
      sseEventCount: 0,
      llmSession: {
        id: 'llm-session-id',
        messages: [],
        compactions: [],
        latestUsageInputMessageCount: null,
        usage: emptyUsage(),
      },
      options: {},
    } as unknown as AgentSnapshot;

    expect(
      () =>
        new TestAgent(
          () => Promise.resolve(MAIN_CONFIG),
          defaultedOptions(),
          snapshot,
        ),
    ).toThrow();
  });

  it('keeps an explicit working directory and still creates a separate scratch dir', () => {
    const explicit = realpathSync(os.tmpdir());
    const agent = new TestAgent(() => Promise.resolve(MAIN_CONFIG), {
      ...defaultedOptions(),
      workingDirectory: explicit,
    });
    registerAgentTmpDir(agent.id);

    const expectedScratch = path.join(
      realpathSync(os.tmpdir()),
      agent.id,
      'scratch',
    );
    expect(agent.getWorkingDirectory()).toBe(explicit);
    expect(agent.getScratchDirectory()).toBe(expectedScratch);
    expect(agent.toSnapshot().options.workingDirectory).toBe(explicit);
  });
});

describe('Agent turn scheduling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports isRunning synchronously once a turn is enqueued', () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion').mockImplementation(() =>
      mainCompletionStream(),
    );
    const agent = track(
      new TestAgent(() => Promise.resolve(MAIN_CONFIG), testAgentOptions()),
    );

    expect(agent.isRunning).toBe(false);
    agent.enqueueUserTurn('first');
    // No await between enqueue and this read — the turn is still queued
    // (runTurn has not acquired the mutex), yet isRunning must already be true.
    expect(agent.isRunning).toBe(true);
  });

  it('serializes multiple enqueued turns and stays busy until all drain', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion').mockImplementation(() =>
      mainCompletionStream(),
    );
    const agent = track(
      new TestAgent(() => Promise.resolve(MAIN_CONFIG), testAgentOptions()),
    );

    agent.enqueueUserTurn('first');
    agent.enqueueUserTurn('second');
    expect(agent.isRunning).toBe(true);

    // Drain both turns; the agent's log carries two done events.
    let doneCount = 0;
    const controller = new AbortController();
    for await (const entry of agent.subscribe({signal: controller.signal})) {
      if (entry.event.type === 'done') {
        doneCount++;
        if (doneCount === 2) {
          controller.abort();
          break;
        }
      }
    }

    expect(doneCount).toBe(2);
    // Allow the second turn's finally() to settle the counter.
    await delay(0);
    expect(agent.isRunning).toBe(false);
  });

  it('tryStartUserTurn returns false while a turn is queued or running', () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion').mockImplementation(() =>
      mainCompletionStream(),
    );
    const agent = track(
      new TestAgent(() => Promise.resolve(MAIN_CONFIG), testAgentOptions()),
    );

    expect(agent.tryStartUserTurn('first')).toBe(true);
    // Second claim must be rejected: the first turn is queued/running.
    expect(agent.tryStartUserTurn('second')).toBe(false);
    expect(agent.isRunning).toBe(true);
  });

  it('tryStartUserTurn returns true again once the turn completes', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion').mockImplementation(() =>
      mainCompletionStream(),
    );
    const agent = track(
      new TestAgent(() => Promise.resolve(MAIN_CONFIG), testAgentOptions()),
    );

    expect(agent.tryStartUserTurn('first')).toBe(true);
    await collectUntilDone(agent);
    await delay(0);
    expect(agent.isRunning).toBe(false);
    expect(agent.tryStartUserTurn('second')).toBe(true);
  });

  it('tryStartUserTurn returns false while title generation is in flight', async () => {
    let releaseTitle!: () => void;
    const titleBlocker = new Promise<void>((resolve) => {
      releaseTitle = resolve;
    });
    async function* blockingTitleStream(): LlmEventStream {
      yield {type: 'message-start', messageId: 'title-message'};
      await titleBlocker;
      yield {type: 'text-delta', content: 'Short Title'};
      yield {
        type: 'message-end',
        stopReason: 'end_turn',
        usage: {inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0},
      };
    }

    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion').mockImplementation((options) => {
      if (options.config.model === LIGHT_CONFIG.model) {
        return blockingTitleStream();
      }
      return mainCompletionStream();
    });
    const agent = track(
      new TestAgent(() => Promise.resolve(MAIN_CONFIG), testAgentOptions()),
    );

    agent.enqueueUserTurn('first');
    await collectUntilDone(agent);
    await delay(0);

    // The main turn has fully settled (pendingTurnCount === 0), but the
    // title stream is still blocked, so isRunning stays true and a new
    // claim must be rejected.
    expect(agent.isRunning).toBe(true);
    expect(agent.tryStartUserTurn('second')).toBe(false);

    // Unblock title generation and wait for it to settle before the test
    // ends, so the fire-and-forget title work cannot race with the
    // afterEach vi.restoreAllMocks().
    releaseTitle();
    while (agent.isRunning) {
      await delay(0);
    }
  });
});
