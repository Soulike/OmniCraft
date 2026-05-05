import type {SseEvent} from '@omnicraft/sse-events';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {llmApi, type LlmConfig, type LlmEventStream} from '../llm-api/index.js';
import {LlmSession} from '../llm-session/index.js';
import {Agent} from './agent.js';
import type {AgentSnapshot} from './types.js';

const MAIN_CONFIG: LlmConfig = {
  apiFormat: 'openai-responses',
  apiKey: 'test-key',
  baseUrl: 'https://example.test',
  model: 'main-model',
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
    return this.runAgentLoop(userMessage, 'high', new AbortController().signal);
  }
}

function testAgentOptions() {
  return {
    toolRegistries: [],
    skillRegistries: [],
    baseSystemPrompt: '',
    getMaxToolRounds: () => 1,
    getLightConfig: () => Promise.resolve(LIGHT_CONFIG),
    thinkingLevel: 'high' as const,
  };
}

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

    const agent = new TestAgent(() => Promise.resolve(MAIN_CONFIG), {
      ...testAgentOptions(),
    });

    const eventsPromise = collectUntilDone(agent);
    agent.handleUserMessage('Please help me rename a component');
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
    const agent = new UsageTestAgent(
      () => Promise.resolve(MAIN_CONFIG),
      testAgentOptions(),
    );

    await collectAll(agent.streamForTest('first'));
    const events = await collectAll(agent.streamForTest('second'));

    expect(events.at(-1)).toMatchObject({
      type: 'done',
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
        inputTokens: 110_000,
        outputTokens: 7,
        cacheReadInputTokens: 3,
      });
    });
    const agent = new UsageTestAgent(
      () => Promise.resolve(MAIN_CONFIG),
      testAgentOptions(),
    );

    const events = await collectAll(agent.streamForTest('compact this turn'));
    const doneEvent = events.at(-1);

    expect(doneEvent?.type).toBe('done');
    if (doneEvent?.type !== 'done') {
      throw new Error('Expected final event to be done');
    }
    expect(doneEvent.usage.currentContextInputTokens).toBeGreaterThan(0);
    expect(doneEvent.usage.currentContextInputTokens).toBeLessThan(110_000);
    expect(doneEvent.usage.sessionInputTokens).toBe(110_000);
    expect(doneEvent.usage.sessionOutputTokens).toBe(7);
    expect(doneEvent.usage.sessionCacheReadInputTokens).toBe(3);
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
    const agent = new UsageTestAgent(
      () => Promise.resolve(MAIN_CONFIG),
      testAgentOptions(),
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
    expect(compactionOptions.thinkingLevel).toBe('high');
  });

  it('emits a clear error when pre-call compaction fails', async () => {
    vi.spyOn(llmApi, 'streamCompletion').mockReturnValue(failingStream());
    const agent = new TestAgent(
      () => Promise.resolve(MAIN_CONFIG),
      testAgentOptions(),
      {
        id: 'agent-1',
        title: 'Existing Title',
        sseEventCount: 0,
        llmSession: {
          id: 'llm-session-1',
          compactions: [],
          usageBaselineMessageCount: null,
          messages: Array.from({length: 12}, (_, index) => ({
            id: `old-${index.toString()}`,
            createdAt: index,
            role: 'user' as const,
            content: `old message ${index.toString()} ${'x'.repeat(30_000)}`,
          })),
          usage: emptyUsage(),
        },
        options: {thinkingLevel: 'high'},
      },
    );

    const eventsPromise = collectUntilError(agent);
    agent.handleUserMessage('Trigger compaction');
    const events = await eventsPromise;

    const lastEvent = events.at(-1);
    expect(lastEvent?.type).toBe('error');
    if (lastEvent?.type !== 'error') {
      throw new Error('Expected final event to be an error');
    }
    expect(lastEvent.message).toContain(
      'Failed to compact LLM session before model call',
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

    const agent = new TestAgent(
      () => Promise.resolve(MAIN_CONFIG),
      testAgentOptions(),
    );
    const eventsPromise = collectUntilDone(agent);
    agent.handleUserMessage('hi');
    const events = await eventsPromise;

    const types = events.map((e) => e.type);
    const startIdx = types.indexOf('context-compaction-start');
    const endIdx = types.indexOf('context-compaction-end');
    const doneIdx = types.lastIndexOf('done');
    expect(startIdx).toBeGreaterThan(-1);
    expect(endIdx).toBe(startIdx + 1);
    expect(doneIdx).toBe(endIdx + 1);
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

    const agent = new TestAgent(
      () => Promise.resolve(MAIN_CONFIG),
      testAgentOptions(),
    );
    const eventsPromise = collectUntilDone(agent);
    agent.handleUserMessage('hi');
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
    expect(doneIdx).toBe(errorIdx + 1);
  });

  it('emits start → error → top-level error on before-llm-call failure', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion').mockImplementation(() =>
      mainCompletionStream(),
    );
    const fakeStart = {
      type: 'context-compaction-start',
      compactionId: 'cid-3',
      reason: 'before-llm-call',
      beforeTokens: 1000,
      messageCount: 5,
    } as const;
    const fakeError = {
      type: 'context-compaction-error',
      compactionId: 'cid-3',
      reason: 'before-llm-call',
      message: 'provider failed',
      beforeTokens: 1000,
      messageCount: 5,
    } as const;
    // Spy on the private method. Cast to bypass the private modifier.
    vi.spyOn(
      LlmSession.prototype as unknown as {
        compactIfNeededUnlocked: (
          options: unknown,
        ) => AsyncGenerator<unknown, void, void>;
      },
      'compactIfNeededUnlocked',
    )
      // eslint-disable-next-line @typescript-eslint/require-await
      .mockImplementation(async function* () {
        yield fakeStart;
        yield fakeError;
        throw new Error('provider failed');
      });

    const agent = new TestAgent(
      () => Promise.resolve(MAIN_CONFIG),
      testAgentOptions(),
    );
    const eventsPromise = collectUntilError(agent);
    agent.handleUserMessage('hi');
    const events = await eventsPromise;

    const types = events.map((e) => e.type);
    expect(types).toContain('context-compaction-start');
    expect(types).toContain('context-compaction-error');
    expect(types).toContain('error');
    // Wire ordering: start before error before top-level error.
    expect(types.indexOf('context-compaction-start')).toBeLessThan(
      types.indexOf('context-compaction-error'),
    );
    expect(types.indexOf('context-compaction-error')).toBeLessThan(
      types.indexOf('error'),
    );
  });
});

describe('Agent snapshot restore', () => {
  it('throws when a snapshot reaches the constructor without thinkingLevel', () => {
    const snapshot = {
      id: 'agent-with-missing-thinking-level',
      title: 'Restored Session',
      sseEventCount: 0,
      llmSession: {
        id: 'llm-session-id',
        messages: [],
        compactions: [],
        usageBaselineMessageCount: null,
        usage: emptyUsage(),
      },
      options: {
        workingDirectory: '/tmp/project',
      },
    } as unknown as AgentSnapshot;

    expect(
      () =>
        new TestAgent(
          () => Promise.resolve(MAIN_CONFIG),
          testAgentOptions(),
          snapshot,
        ),
    ).toThrow('Snapshot is missing thinkingLevel');
  });
});
