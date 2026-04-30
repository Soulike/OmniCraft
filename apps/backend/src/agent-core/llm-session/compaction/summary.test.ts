import {afterEach, describe, expect, it, vi} from 'vitest';

import {
  llmApi,
  type LlmConfig,
  type LlmEventStream,
} from '../../llm-api/index.js';
import {generateCompactionSummary} from './summary.js';

const CONFIG: LlmConfig = {
  apiFormat: 'openai',
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

describe('generateCompactionSummary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('aggregates text deltas from llmApi', async () => {
    const streamSpy = vi
      .spyOn(llmApi, 'streamCompletion')
      .mockReturnValue(summaryStream());

    const summary = await generateCompactionSummary({
      config: CONFIG,
      prompt: 'summarize this',
    });

    expect(summary).toBe('summary text');
    expect(streamSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        config: CONFIG,
        tools: [],
        thinkingLevel: 'none',
      }),
    );
  });
});
