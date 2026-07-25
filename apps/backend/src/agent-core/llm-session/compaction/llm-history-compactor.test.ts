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
  thinkingLevel: 'none',
  maxContextTokens: 200_000,
  maxOutputTokens: 32_000,
};

const messages: LlmMessage[] = [
  {id: 'user-1', createdAt: 1, role: 'user', content: 'hello', attachments: []},
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
      attachmentsDirectory: null,
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
      compactor.compact({
        config,
        messages,
        tools: [],
        attachmentsDirectory: null,
      }),
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
      attachmentsDirectory: null,
    });

    expect(inputMessages).toEqual(originalMessages);
  });

  it('carries deduped attachments from the compacted history into the replacement', async () => {
    // The recent-context slimmer already projects attachments into its own
    // placeholders (covered by compaction-message-slimmer.test.ts) — stubbed
    // here, same as `createCompactor` above, so this test isolates the
    // attachment-section dedup behavior instead of re-asserting the slimmer's.
    const messageSlimmer = new CompactionMessageSlimmer();
    vi.spyOn(messageSlimmer, 'buildRecentContext').mockReturnValue({
      content: 'recent context text',
      sourceMessageCount: 2,
    });
    const compactor = new LlmHistoryCompactor({
      summaryGenerator: {generate: () => Promise.resolve('summary')},
      messageSlimmer,
    });

    const result = await compactor.compact({
      messages: [
        {
          id: 'u1',
          createdAt: 1,
          role: 'user',
          content: 'first',
          attachments: [
            {fileName: 'shot.png', mediaType: 'image/png', byteSize: 831_488},
          ],
        },
        {
          id: 'u2',
          createdAt: 2,
          role: 'user',
          content: 'again',
          attachments: [
            {fileName: 'shot.png', mediaType: 'image/png', byteSize: 831_488},
            {
              fileName: 'invoice.pdf',
              mediaType: 'application/pdf',
              byteSize: 240_640,
            },
          ],
        },
      ],
      tools: [],
      attachmentsDirectory: '/data/sessions/x/scratch/attachments',
    } as never);

    const content = (result.replacementMessages[0]?.content ?? '') as string;
    expect(content.match(/shot\.png/g)).toHaveLength(1);
    expect(content).toContain('invoice.pdf');
    // The replacement message itself carries no attachments — the model re-reads
    // from disk rather than having them re-attached.
    expect(result.replacementMessages[0]).toMatchObject({attachments: []});
  });
});
