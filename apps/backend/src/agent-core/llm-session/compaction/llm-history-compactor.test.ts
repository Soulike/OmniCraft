import {describe, expect, it, vi} from 'vitest';

import type {LlmConfig, LlmMessage} from '../../llm-api/index.js';
import {CompactionMessageSlimmer} from './compaction-message-slimmer.js';
import {CompactionSummaryGenerator} from './compaction-summary-generator.js';
import {LlmHistoryCompactor} from './llm-history-compactor.js';

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

function createCompactor(summary: string): LlmHistoryCompactor {
  const summaryGenerator = new CompactionSummaryGenerator();
  vi.spyOn(summaryGenerator, 'generate').mockResolvedValue(summary);
  const messageSlimmer = new CompactionMessageSlimmer();
  vi.spyOn(messageSlimmer, 'buildRecentContext').mockReturnValue({
    content: 'recent context text',
    sourceMessageCount: 2,
  });

  return new LlmHistoryCompactor({
    summaryGenerator,
    messageSlimmer,
  });
}

describe('LlmHistoryCompactor', () => {
  it('builds one replacement user message with summary, recent context, and metadata input', async () => {
    const compactor = createCompactor('summary text');

    const result = await compactor.compact({
      config,
      messages,
      tools: [],
    });

    expect(result.summary).toBe('summary text');
    expect(result.replacementMessages).toHaveLength(1);
    expect(result.replacementMessages[0]).toMatchObject({role: 'user'});
    expect(result.replacementMessages[0]?.content).toContain(
      '<conversation_summary>',
    );
    expect(result.replacementMessages[0]?.content).toContain(
      '<recent_context>',
    );
    expect(result.replacementMessages[0]?.content).toContain(
      '<continuation_instructions>',
    );
    expect(result.metadataInput.beforeCharCount).toBeGreaterThan(0);
    expect(result.metadataInput.afterCharCount).toBeGreaterThan(0);
    expect(result.metadataInput.recentContextMessageCount).toBe(2);
  });

  it('rejects when the generated summary is empty', async () => {
    const compactor = createCompactor('');

    await expect(
      compactor.compact({config, messages, tools: []}),
    ).rejects.toThrow('Compaction summary is empty');
  });

  it('does not mutate the input messages array', async () => {
    const inputMessages: LlmMessage[] = structuredClone(messages);
    const originalMessages = structuredClone(inputMessages);
    const compactor = createCompactor('summary text');

    await compactor.compact({
      config,
      messages: inputMessages,
      tools: [],
    });

    expect(inputMessages).toEqual(originalMessages);
  });
});
