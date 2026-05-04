import {afterEach, describe, expect, it, vi} from 'vitest';

import {
  llmApi,
  type LlmConfig,
  type LlmEventStream,
  type LlmMessage,
} from '../llm-api/index.js';
import {LlmSession} from './llm-session.js';

const CONFIG: LlmConfig = {
  apiFormat: 'openai-responses',
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

async function* abortingSummaryStream(
  controller: AbortController,
): LlmEventStream {
  yield {type: 'message-start', messageId: 'summary'};
  await Promise.resolve();
  yield {type: 'text-delta', content: 'summary text'};
  controller.abort();
  yield {
    type: 'message-end',
    stopReason: 'end_turn',
    usage: {inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0},
  };
}

async function* emptySummaryStream(): LlmEventStream {
  yield {type: 'message-start', messageId: 'summary'};
  await Promise.resolve();
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
    expect(snapshot.messages[0]?.content).toContain('<recent_context>');
    expect(snapshot.messages[0]?.content).toContain(
      '<continuation_instructions>',
    );
    expect(snapshot.messages[0]?.content).toContain('summary text');
    expect(snapshot.messages[0]?.content).toContain('hello');
    expect(snapshot.compactions).toHaveLength(1);
    expect(snapshot.compactions[0]).toMatchObject({
      coveredMessageCount: 13,
      recentContextMessageCount: 13,
    });
  });

  it('replaces compacted history with a single synthetic message before the next assistant reply', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(200_000);
    vi.spyOn(llmApi, 'streamCompletion')
      .mockReturnValueOnce(summaryStream())
      .mockReturnValueOnce(normalStream());
    const session = new LlmSession(() => Promise.resolve(CONFIG), {
      id: 'session-1',
      compactions: [],
      messages: oldMessages(12),
    });

    await drain(session.sendUserMessage('hello', [], '', 'none').stream);

    const messages = session.toSnapshot().messages;
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({role: 'user'});
    expect(messages[0]?.content).toContain('<conversation_summary>');
    expect(messages[1]).toMatchObject({role: 'assistant', content: 'reply'});
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

  it('surfaces a clear error when pre-call compaction fails', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(200_000);
    vi.spyOn(llmApi, 'streamCompletion').mockReturnValue(failingStream());
    const messages = oldMessages(12);
    const session = new LlmSession(() => Promise.resolve(CONFIG), {
      id: 'session-1',
      compactions: [],
      messages,
    });

    await expect(
      drain(session.sendUserMessage('hello', [], '', 'none').stream),
    ).rejects.toThrow('Failed to compact LLM session before model call');

    expect(session.toSnapshot()).toEqual({
      id: 'session-1',
      compactions: [],
      messages,
    });
  });

  it('does not start the provider call when aborted during pre-call compaction', async () => {
    const controller = new AbortController();
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(200_000);
    const streamSpy = vi
      .spyOn(llmApi, 'streamCompletion')
      .mockReturnValue(abortingSummaryStream(controller));
    const messages = oldMessages(12);
    const session = new LlmSession(() => Promise.resolve(CONFIG), {
      id: 'session-1',
      compactions: [],
      messages,
    });

    let error: unknown;
    try {
      await drain(
        session.sendUserMessage('hello', [], '', 'none', controller.signal)
          .stream,
      );
    } catch (err: unknown) {
      error = err;
    }

    expect(error).toBe(controller.signal.reason);

    expect(streamSpy).toHaveBeenCalledTimes(1);
    expect(streamSpy.mock.calls[0]?.[0].signal).toBe(controller.signal);
    expect(session.toSnapshot()).toEqual({
      id: 'session-1',
      compactions: [],
      messages,
    });
  });

  it('fails compaction when the generated summary is empty', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(200_000);
    vi.spyOn(llmApi, 'streamCompletion').mockReturnValue(emptySummaryStream());
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
    ).rejects.toThrow('Compaction summary is empty');

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
