import type {SseEvent} from '@omnicraft/sse-events';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {llmApi, type LlmConfig, type LlmEventStream} from '../llm-api/index.js';
import {LlmSession} from '../llm-session/index.js';
import {Agent} from './agent.js';
import type {AgentSnapshot} from './types.js';

const MAIN_CONFIG: LlmConfig = {
  apiFormat: 'openai',
  apiKey: 'test-key',
  baseUrl: 'https://example.test',
  model: 'main-model',
};

const LIGHT_CONFIG: LlmConfig = {
  ...MAIN_CONFIG,
  model: 'light-model',
};

class TestAgent extends Agent {}

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

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (predicate()) return;
    await delay(5);
  }
  expect(predicate()).toBe(true);
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

describe('Agent compaction lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests turn-end compaction after emitting done', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion').mockImplementation((options) => {
      if (options.config.model === LIGHT_CONFIG.model) {
        return titleCompletionStream();
      }
      return mainCompletionStream();
    });
    const compactSpy = vi
      .spyOn(LlmSession.prototype, 'compactIfNeeded')
      .mockResolvedValue(false);
    const agent = new TestAgent(() => Promise.resolve(MAIN_CONFIG), {
      ...testAgentOptions(),
    });

    const eventsPromise = collectUntilDone(agent);
    agent.handleUserMessage('Finish the task');
    const events = await eventsPromise;

    expect(events.at(-1)).toMatchObject({type: 'done', reason: 'complete'});
    await waitFor(() => compactSpy.mock.calls.length > 0);
    const [compactionOptions] = compactSpy.mock.calls[0];
    expect(compactionOptions.reason).toBe('after-turn');
    expect(compactionOptions.tools).toEqual([]);
    expect(typeof compactionOptions.systemPrompt).toBe('string');
    expect(compactionOptions.thinkingLevel).toBe('high');
  });

  it('emits a clear error when pre-call compaction fails', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(200_000);
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
          messages: Array.from({length: 12}, (_, index) => ({
            id: `old-${index.toString()}`,
            createdAt: index,
            role: 'user' as const,
            content: `old message ${index.toString()}`,
          })),
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
