import type {SseContextCompactionEvent} from '@omnicraft/sse-events';
import {afterEach, describe, expect, it, vi} from 'vitest';

import type {LlmConfig, LlmMessage} from '../../llm-api/index.js';
import type {LlmSessionUsage} from '../types.js';
import type {
  LlmCompactionDecision,
  LlmHistoryCompactionResult,
  LlmSessionCompactionPatch,
} from './llm-compaction-types.js';
import {LlmSessionCompactor} from './llm-session-compactor.js';

const config: LlmConfig = {
  apiFormat: 'openai-responses',
  apiKey: 'key',
  baseUrl: 'https://example.test',
  model: 'test-model',
};

const messages: LlmMessage[] = [
  {id: 'user-1', createdAt: 1, role: 'user', content: 'hello'},
  {
    id: 'assistant-1',
    createdAt: 2,
    role: 'assistant',
    content: 'assistant reply',
    toolCalls: [],
    thinking: [],
  },
];

const replacementMessages: LlmMessage[] = [
  {id: 'summary-1', createdAt: 3, role: 'user', content: 'compacted'},
];

const usage: LlmSessionUsage = {
  currentContextInputTokens: 111,
  latestCallOutputTokens: 22,
  sessionInputTokens: 333,
  sessionOutputTokens: 44,
  sessionCacheReadInputTokens: 5,
};

const options = {
  reason: 'before-llm-call' as const,
  tools: [],
  systemPrompt: 'system prompt',
  thinkingLevel: 'none' as const,
};

const compactDecision: Extract<LlmCompactionDecision, {type: 'compact'}> = {
  type: 'compact',
  compactionId: 'compaction-1',
  reason: 'before-llm-call',
  beforeTokens: 999,
  coveredMessageCount: 2,
  startedAt: 1000,
};

const historyResult: LlmHistoryCompactionResult = {
  summary: 'summary text',
  replacementMessages,
  metadataInput: {
    recentContextMessageCount: 1,
    beforeCharCount: 456,
    afterCharCount: 78,
  },
};

const startEvent: SseContextCompactionEvent = {
  type: 'context-compaction-start',
  compactionId: 'compaction-1',
  reason: 'before-llm-call',
  beforeTokens: 999,
  messageCount: 2,
};

const endEvent: SseContextCompactionEvent = {
  type: 'context-compaction-end',
  compactionId: 'compaction-1',
  summary: 'summary text',
  beforeTokens: 999,
  afterTokens: 42,
  messageCount: 2,
  durationMs: 234,
};

const errorEvent: SseContextCompactionEvent = {
  type: 'context-compaction-error',
  compactionId: 'compaction-1',
  reason: 'before-llm-call',
  message: 'history exploded',
  beforeTokens: 999,
  messageCount: 2,
};

async function collectEvents(
  stream: AsyncGenerator<SseContextCompactionEvent, void, undefined>,
): Promise<SseContextCompactionEvent[]> {
  const events: SseContextCompactionEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

function createInput(commit = vi.fn()) {
  return {
    config,
    messages,
    usage,
    latestUsageInputMessageCount: 2,
    options,
    commit,
  };
}

describe('LlmSessionCompactor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('yields no events and does not commit when the decision is skip', async () => {
    const commit = vi.fn();
    const historyCompactor = {compact: vi.fn()};
    const compactor = new LlmSessionCompactor({
      decisionService: {decide: vi.fn().mockResolvedValue({type: 'skip'})},
      historyCompactor,
      eventFactory: {
        createStartEvent: vi.fn(),
        createEndEvent: vi.fn(),
        createErrorEvent: vi.fn(),
      },
      tokenEstimator: {estimateTokensFromMessages: vi.fn()},
    });

    await expect(
      collectEvents(compactor.compactIfNeeded(createInput(commit))),
    ).resolves.toEqual([]);

    expect(commit).not.toHaveBeenCalled();
    expect(historyCompactor.compact).not.toHaveBeenCalled();
  });

  it('yields start, compacts history, estimates after tokens, commits, then yields end', async () => {
    const controller = new AbortController();
    const commit = vi.fn().mockResolvedValue(undefined);
    const eventFactory = {
      createStartEvent: vi.fn(() => startEvent),
      createEndEvent: vi.fn(() => {
        expect(commit).toHaveBeenCalledTimes(1);
        return endEvent;
      }),
      createErrorEvent: vi.fn(),
    };
    const historyCompactor = {
      compact: vi.fn().mockResolvedValue(historyResult),
    };
    const tokenEstimator = {
      estimateTokensFromMessages: vi.fn(() => 42),
    };
    const compactor = new LlmSessionCompactor({
      decisionService: {decide: vi.fn().mockResolvedValue(compactDecision)},
      historyCompactor,
      eventFactory,
      tokenEstimator,
    });

    const events = await collectEvents(
      compactor.compactIfNeeded({
        ...createInput(commit),
        options: {...options, signal: controller.signal},
      }),
    );

    expect(events).toEqual([startEvent, endEvent]);
    expect(historyCompactor.compact).toHaveBeenCalledWith({
      config,
      messages,
      tools: options.tools,
      signal: controller.signal,
    });
    expect(tokenEstimator.estimateTokensFromMessages).toHaveBeenCalledWith({
      messages: replacementMessages,
      options: {...options, signal: controller.signal},
    });
    expect(eventFactory.createEndEvent).toHaveBeenCalledWith(
      compactDecision,
      historyResult,
      42,
    );
  });

  it('yields error and rethrows when history compaction fails', async () => {
    const error = new Error('history exploded');
    const commit = vi.fn();
    const compactor = new LlmSessionCompactor({
      decisionService: {decide: vi.fn().mockResolvedValue(compactDecision)},
      historyCompactor: {compact: vi.fn().mockRejectedValue(error)},
      eventFactory: {
        createStartEvent: vi.fn(() => startEvent),
        createEndEvent: vi.fn(),
        createErrorEvent: vi.fn(() => errorEvent),
      },
      tokenEstimator: {estimateTokensFromMessages: vi.fn()},
    });
    const iterator = compactor.compactIfNeeded(createInput(commit));

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: startEvent,
    });
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: errorEvent,
    });
    await expect(iterator.next()).rejects.toBe(error);
  });

  it('does not commit when history compaction fails', async () => {
    const commit = vi.fn();
    const compactor = new LlmSessionCompactor({
      decisionService: {decide: vi.fn().mockResolvedValue(compactDecision)},
      historyCompactor: {
        compact: vi.fn().mockRejectedValue(new Error('history exploded')),
      },
      eventFactory: {
        createStartEvent: vi.fn(() => startEvent),
        createEndEvent: vi.fn(),
        createErrorEvent: vi.fn(() => errorEvent),
      },
      tokenEstimator: {estimateTokensFromMessages: vi.fn()},
    });
    const iterator = compactor.compactIfNeeded(createInput(commit));

    await iterator.next();
    await iterator.next();
    await expect(iterator.next()).rejects.toThrow('history exploded');

    expect(commit).not.toHaveBeenCalled();
  });

  it('commits replacement messages, updated usage, and compaction metadata', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(12345);
    let committedPatch: LlmSessionCompactionPatch | null = null;
    const commit = vi.fn((patch: LlmSessionCompactionPatch) => {
      committedPatch = patch;
    });
    const compactor = new LlmSessionCompactor({
      decisionService: {decide: vi.fn().mockResolvedValue(compactDecision)},
      historyCompactor: {compact: vi.fn().mockResolvedValue(historyResult)},
      eventFactory: {
        createStartEvent: vi.fn(() => startEvent),
        createEndEvent: vi.fn(() => endEvent),
        createErrorEvent: vi.fn(),
      },
      tokenEstimator: {estimateTokensFromMessages: vi.fn(() => 42)},
    });

    await collectEvents(compactor.compactIfNeeded(createInput(commit)));

    expect(committedPatch).toEqual({
      messages: replacementMessages,
      latestUsageInputMessageCount: null,
      usage: {
        ...usage,
        currentContextInputTokens: 42,
        latestCallOutputTokens: 0,
      },
      metadata: {
        id: 'compaction-1',
        compactedAt: 12345,
        coveredMessageCount: 2,
        recentContextMessageCount: 1,
        beforeCharCount: 456,
        afterCharCount: 78,
      },
    });
  });
});
