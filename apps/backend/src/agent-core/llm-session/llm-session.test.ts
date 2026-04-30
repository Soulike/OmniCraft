import {afterEach, describe, expect, it, vi} from 'vitest';

import {
  llmApi,
  type LlmConfig,
  type LlmEventStream,
  type LlmMessage,
} from '../llm-api/index.js';
import {LlmSession} from './llm-session.js';

const CONFIG: LlmConfig = {
  apiFormat: 'openai',
  apiKey: 'key',
  baseUrl: 'https://example.test',
  model: 'gpt-4.1',
};

function oldMessages(count: number): LlmMessage[] {
  return Array.from({length: count}, (_, index) => ({
    id: `old-${index.toString()}`,
    createdAt: index,
    role: 'user' as const,
    content: `old message ${index.toString()}`,
  }));
}

async function* normalStream(): LlmEventStream {
  yield {type: 'message-start', messageId: 'assistant'};
  await Promise.resolve();
  yield {type: 'text-delta', content: 'reply'};
  yield {
    type: 'message-end',
    stopReason: 'end_turn',
    usage: {inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0},
  };
}

async function* summaryStream(): LlmEventStream {
  yield {type: 'message-start', messageId: 'summary'};
  await Promise.resolve();
  yield {type: 'text-delta', content: 'summary text'};
  yield {
    type: 'message-end',
    stopReason: 'end_turn',
    usage: {inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0},
  };
}

async function* failingStream(): LlmEventStream {
  yield {type: 'message-start', messageId: 'assistant'};
  await Promise.resolve();
  throw new Error('provider failed');
}

async function drain(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const _event of stream) {
    // Drain stream.
  }
}

describe('LlmSession compaction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes snapshots with empty compactions', () => {
    const session = new LlmSession(() => Promise.resolve(CONFIG));

    expect(session.toSnapshot().compactions).toEqual([]);
  });

  it('compacts before model call when countToken reaches threshold', async () => {
    const countSpy = vi.spyOn(llmApi, 'countToken').mockResolvedValue(200_000);
    const streamSpy = vi
      .spyOn(llmApi, 'streamCompletion')
      .mockImplementation((options) => {
        const isSummaryRequest =
          options.tools.length === 0 &&
          options.messages.length === 1 &&
          options.messages[0]?.role === 'user' &&
          options.messages[0].content.includes('<history_to_summarize>');

        if (isSummaryRequest) return summaryStream();

        const hasSummaryMessage = options.messages.some(
          (message) =>
            message.role === 'user' &&
            message.content.includes('<conversation_summary>'),
        );
        expect(hasSummaryMessage).toBe(true);
        return normalStream();
      });

    const session = new LlmSession(() => Promise.resolve(CONFIG), {
      id: 'session-1',
      compactions: [],
      messages: oldMessages(12),
    });

    await drain(session.sendUserMessage('hello', [], '', 'none').stream);

    const snapshot = session.toSnapshot();

    expect(countSpy).toHaveBeenCalled();
    expect(streamSpy).toHaveBeenCalledTimes(2);
    expect(snapshot.messages[0]?.role).toBe('user');
    expect(snapshot.messages[0]?.content).toContain('<conversation_summary>');
    expect(snapshot.compactions).toHaveLength(1);
  });

  it('rolls back compaction when the provider stream fails after compaction', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(200_000);
    vi.spyOn(llmApi, 'streamCompletion')
      .mockReturnValueOnce(summaryStream())
      .mockReturnValueOnce(failingStream());
    const messages = oldMessages(12);
    const session = new LlmSession(() => Promise.resolve(CONFIG), {
      id: 'session-1',
      compactions: [],
      messages,
    });

    await expect(
      drain(session.sendUserMessage('hello', [], '', 'none').stream),
    ).rejects.toThrow('provider failed');

    expect(session.toSnapshot()).toEqual({
      id: 'session-1',
      compactions: [],
      messages,
    });
  });

  it('keeps history unchanged when turn-end compaction fails', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(200_000);
    vi.spyOn(llmApi, 'streamCompletion').mockReturnValue(failingStream());
    const messages = oldMessages(12);
    const session = new LlmSession(() => Promise.resolve(CONFIG), {
      id: 'session-1',
      compactions: [],
      messages,
    });

    await expect(
      session.compactIfNeeded({
        reason: 'after-turn',
        tools: [],
        systemPrompt: '',
        thinkingLevel: 'none',
      }),
    ).rejects.toThrow('provider failed');

    expect(session.toSnapshot()).toEqual({
      id: 'session-1',
      compactions: [],
      messages,
    });
  });
});
