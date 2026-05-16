import {afterEach, describe, expect, it, vi} from 'vitest';

import {
  llmApi,
  type LlmConfig,
  type LlmEventStream,
  type LlmMessage,
} from '../../llm-api/index.js';
import {compactionSummaryGenerator} from './compaction-summary-generator.js';

const CONFIG: LlmConfig = {
  apiFormat: 'openai-responses',
  apiKey: 'key',
  baseUrl: 'https://example.test',
  model: 'model',
};

async function* summaryStream(): LlmEventStream {
  yield {type: 'message-start', messageId: 'summary'};
  await Promise.resolve();
  yield {type: 'text-delta', content: 'summary '};
  yield {type: 'text-delta', content: 'text'};
  yield {
    type: 'message-end',
    stopReason: 'end_turn',
    usage: {inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0},
  };
}

describe('compactionSummaryGenerator', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('aggregates text deltas from llmApi', async () => {
    const streamSpy = vi
      .spyOn(llmApi, 'streamCompletion')
      .mockReturnValue(summaryStream());

    const summary = await compactionSummaryGenerator.generate({
      config: CONFIG,
      messages: [{id: 'user', createdAt: 1, role: 'user', content: 'hello'}],
      tools: [],
    });

    expect(summary).toBe('summary text');
    expect(streamSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        config: CONFIG,
        tools: [],
        thinkingLevel: 'none',
      }),
    );
    expect(streamSpy.mock.calls[0]?.[0].messages[0]?.content).toContain(
      '<history_to_summarize>',
    );
    expect(streamSpy.mock.calls[0]?.[0].messages[0]?.content).toContain(
      'hello',
    );
  });

  it('passes the abort signal to the summary LLM call', async () => {
    const controller = new AbortController();
    const streamSpy = vi
      .spyOn(llmApi, 'streamCompletion')
      .mockReturnValue(summaryStream());

    await compactionSummaryGenerator.generate({
      config: CONFIG,
      messages: [{id: 'user', createdAt: 1, role: 'user', content: 'hello'}],
      tools: [],
      signal: controller.signal,
    });

    expect(streamSpy).toHaveBeenCalledWith(
      expect.objectContaining({signal: controller.signal}),
    );
  });

  it('builds the summary prompt from messages internally', async () => {
    const streamSpy = vi
      .spyOn(llmApi, 'streamCompletion')
      .mockReturnValue(summaryStream());
    const messages: LlmMessage[] = [
      {
        id: 'assistant',
        createdAt: 1,
        role: 'assistant',
        content: 'assistant text',
        thinking: [{content: ['private thinking'], signature: 'sig'}],
        toolCalls: [],
      },
    ];

    await compactionSummaryGenerator.generate({
      config: CONFIG,
      messages,
      tools: [],
    });

    const prompt = streamSpy.mock.calls[0]?.[0].messages[0]?.content ?? '';
    expect(prompt).toContain('assistant text');
    expect(prompt).not.toContain('private thinking');
  });
});
