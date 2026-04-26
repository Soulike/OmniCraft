import type {SseEvent} from '@omnicraft/sse-events';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {llmApi, type LlmConfig, type LlmEventStream} from '../llm-api/index.js';
import {Agent} from './agent.js';

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

async function collectUntilDone(agent: Agent): Promise<SseEvent[]> {
  const controller = new AbortController();
  const events: SseEvent[] = [];

  for await (const event of agent.subscribe({signal: controller.signal})) {
    events.push(event);
    if (event.type === 'done') {
      controller.abort();
      break;
    }
  }

  return events;
}

describe('Agent title generation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits the first session title after the first user message starts', async () => {
    vi.spyOn(llmApi, 'streamCompletion').mockImplementation((options) => {
      if (options.config.model === LIGHT_CONFIG.model) {
        return titleCompletionStream();
      }
      return mainCompletionStream();
    });

    const agent = new TestAgent(() => Promise.resolve(MAIN_CONFIG), {
      toolRegistries: [],
      skillRegistries: [],
      baseSystemPrompt: '',
      getMaxToolRounds: () => 1,
      getLightConfig: () => Promise.resolve(LIGHT_CONFIG),
    });

    const eventsPromise = collectUntilDone(agent);
    agent.handleUserMessage('Please help me rename a component', 'none');
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
    expect(events[titleIndex]).toEqual({
      type: 'session-title',
      title: 'Short Title',
    });
  });
});
