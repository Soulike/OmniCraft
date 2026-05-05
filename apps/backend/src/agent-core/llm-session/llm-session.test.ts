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

function emptyUsage() {
  return {
    currentContextInputTokens: 0,
    latestCallOutputTokens: 0,
    sessionInputTokens: 0,
    sessionOutputTokens: 0,
    sessionCacheReadInputTokens: 0,
  };
}

function largeOldMessages(count: number): LlmMessage[] {
  return Array.from({length: count}, (_, index) => ({
    id: `old-${index.toString()}`,
    createdAt: index,
    role: 'user' as const,
    content: `old message ${index.toString()} ${'x'.repeat(30_000)}`,
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

async function* usageStream(usage: {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
}): LlmEventStream {
  yield {type: 'message-start', messageId: 'assistant'};
  await Promise.resolve();
  yield {type: 'text-delta', content: 'reply'};
  yield {type: 'message-end', stopReason: 'end_turn', usage};
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

async function* failingAfterUsageStream(): LlmEventStream {
  yield {type: 'message-start', messageId: 'assistant'};
  await Promise.resolve();
  yield {
    type: 'message-end',
    stopReason: 'end_turn',
    usage: {inputTokens: 100, outputTokens: 10, cacheReadInputTokens: 5},
  };
  throw new Error('provider failed after usage');
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

  it('uses latest call usage and pending input estimate to trigger pre-call compaction', async () => {
    const countSpy = vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    let mainCallCount = 0;
    const streamSpy = vi
      .spyOn(llmApi, 'streamCompletion')
      .mockImplementation((options) => {
        const isSummaryRequest =
          options.tools.length === 0 &&
          options.messages.length === 1 &&
          options.messages[0]?.role === 'user' &&
          options.messages[0].content.includes('<history_to_summarize>');

        if (isSummaryRequest) return summaryStream();

        mainCallCount++;
        if (mainCallCount === 1) {
          return usageStream({
            inputTokens: 102_399,
            outputTokens: 100,
            cacheReadInputTokens: 0,
          });
        }

        const hasSummaryMessage = options.messages.some(
          (message) =>
            message.role === 'user' &&
            message.content.includes('<conversation_summary>'),
        );
        expect(hasSummaryMessage).toBe(true);
        return normalStream();
      });

    const session = new LlmSession(() => Promise.resolve(CONFIG));

    await drain(session.sendUserMessage('first', [], '', 'none').stream);
    await drain(session.sendUserMessage('second', [], '', 'none').stream);

    expect(countSpy).not.toHaveBeenCalled();
    expect(streamSpy).toHaveBeenCalledTimes(3);
    expect(session.toSnapshot().compactions).toHaveLength(1);
  });

  it('restores usage baseline message count for compaction estimates', async () => {
    let mainCallCount = 0;
    const streamSpy = vi
      .spyOn(llmApi, 'streamCompletion')
      .mockImplementation((options) => {
        const isSummaryRequest =
          options.tools.length === 0 &&
          options.messages.length === 1 &&
          options.messages[0]?.role === 'user' &&
          options.messages[0].content.includes('<history_to_summarize>');

        if (isSummaryRequest) return summaryStream();

        mainCallCount++;
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
      messages: [
        {id: 'user-1', createdAt: 1, role: 'user', content: 'first'},
        {
          id: 'assistant-1',
          createdAt: 2,
          role: 'assistant',
          content: 'reply',
          toolCalls: [],
          thinking: [],
        },
      ],
      compactions: [],
      usageBaselineMessageCount: 1,
      usage: {
        currentContextInputTokens: 102_399,
        latestCallOutputTokens: 100,
        sessionInputTokens: 102_399,
        sessionOutputTokens: 100,
        sessionCacheReadInputTokens: 0,
      },
    });

    await drain(session.sendUserMessage('second', [], '', 'none').stream);

    expect(mainCallCount).toBe(1);
    expect(streamSpy).toHaveBeenCalledTimes(2);
    expect(session.toSnapshot().compactions).toHaveLength(1);
  });

  it('compacts before model call when local prompt estimate reaches threshold', async () => {
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
      usageBaselineMessageCount: null,
      messages: largeOldMessages(12),
      usage: emptyUsage(),
    });

    await drain(session.sendUserMessage('hello', [], '', 'none').stream);

    const snapshot = session.toSnapshot();

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
    vi.spyOn(llmApi, 'streamCompletion')
      .mockReturnValueOnce(summaryStream())
      .mockReturnValueOnce(normalStream());
    const session = new LlmSession(() => Promise.resolve(CONFIG), {
      id: 'session-1',
      compactions: [],
      usageBaselineMessageCount: null,
      messages: largeOldMessages(12),
      usage: emptyUsage(),
    });

    await drain(session.sendUserMessage('hello', [], '', 'none').stream);

    const messages = session.toSnapshot().messages;
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({role: 'user'});
    expect(messages[0]?.content).toContain('<conversation_summary>');
    expect(messages[1]).toMatchObject({role: 'assistant', content: 'reply'});
  });

  it('rolls back compaction when the provider stream fails after compaction', async () => {
    vi.spyOn(llmApi, 'streamCompletion')
      .mockReturnValueOnce(summaryStream())
      .mockReturnValueOnce(failingStream());
    const messages = largeOldMessages(12);
    const session = new LlmSession(() => Promise.resolve(CONFIG), {
      id: 'session-1',
      compactions: [],
      usageBaselineMessageCount: null,
      messages,
      usage: emptyUsage(),
    });

    await expect(
      drain(session.sendUserMessage('hello', [], '', 'none').stream),
    ).rejects.toThrow('provider failed');

    expect(session.toSnapshot()).toEqual({
      id: 'session-1',
      compactions: [],
      usageBaselineMessageCount: null,
      messages,
      usage: emptyUsage(),
    });
  });

  it('surfaces a clear error when pre-call compaction fails', async () => {
    vi.spyOn(llmApi, 'streamCompletion').mockReturnValue(failingStream());
    const messages = largeOldMessages(12);
    const session = new LlmSession(() => Promise.resolve(CONFIG), {
      id: 'session-1',
      compactions: [],
      usageBaselineMessageCount: null,
      messages,
      usage: emptyUsage(),
    });

    await expect(
      drain(session.sendUserMessage('hello', [], '', 'none').stream),
    ).rejects.toThrow('Failed to compact LLM session before model call');

    expect(session.toSnapshot()).toEqual({
      id: 'session-1',
      compactions: [],
      usageBaselineMessageCount: null,
      messages,
      usage: emptyUsage(),
    });
  });

  it('does not start the provider call when aborted during pre-call compaction', async () => {
    const controller = new AbortController();
    const streamSpy = vi
      .spyOn(llmApi, 'streamCompletion')
      .mockReturnValue(abortingSummaryStream(controller));
    const messages = largeOldMessages(12);
    const session = new LlmSession(() => Promise.resolve(CONFIG), {
      id: 'session-1',
      compactions: [],
      usageBaselineMessageCount: null,
      messages,
      usage: emptyUsage(),
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
      usageBaselineMessageCount: null,
      messages,
      usage: emptyUsage(),
    });
  });

  it('fails compaction when the generated summary is empty', async () => {
    vi.spyOn(llmApi, 'streamCompletion').mockReturnValue(emptySummaryStream());
    const messages = largeOldMessages(12);
    const session = new LlmSession(() => Promise.resolve(CONFIG), {
      id: 'session-1',
      compactions: [],
      usageBaselineMessageCount: null,
      messages,
      usage: emptyUsage(),
    });

    async function drainCompaction() {
      const events: unknown[] = [];
      for await (const event of session.compactIfNeeded({
        reason: 'after-turn',
        tools: [],
        systemPrompt: '',
        thinkingLevel: 'none',
      })) {
        events.push(event);
      }
      return events;
    }

    await expect(drainCompaction()).rejects.toThrow(
      'Compaction summary is empty',
    );

    expect(session.toSnapshot()).toEqual({
      id: 'session-1',
      compactions: [],
      usageBaselineMessageCount: null,
      messages,
      usage: emptyUsage(),
    });
  });

  it('keeps history unchanged when turn-end compaction fails', async () => {
    vi.spyOn(llmApi, 'streamCompletion').mockReturnValue(failingStream());
    const messages = largeOldMessages(12);
    const session = new LlmSession(() => Promise.resolve(CONFIG), {
      id: 'session-1',
      compactions: [],
      usageBaselineMessageCount: null,
      messages,
      usage: emptyUsage(),
    });

    async function drainCompaction() {
      const events: unknown[] = [];
      for await (const event of session.compactIfNeeded({
        reason: 'after-turn',
        tools: [],
        systemPrompt: '',
        thinkingLevel: 'none',
      })) {
        events.push(event);
      }
      return events;
    }

    await expect(drainCompaction()).rejects.toThrow('provider failed');

    expect(session.toSnapshot()).toEqual({
      id: 'session-1',
      compactions: [],
      usageBaselineMessageCount: null,
      messages,
      usage: emptyUsage(),
    });
  });

  it('yields start and end events on a successful compaction', async () => {
    vi.spyOn(llmApi, 'streamCompletion').mockReturnValue(summaryStream());
    const messages = largeOldMessages(12);
    const session = new LlmSession(() => Promise.resolve(CONFIG), {
      id: 'session-1',
      compactions: [],
      usageBaselineMessageCount: null,
      messages,
      usage: emptyUsage(),
    });

    const events: unknown[] = [];
    for await (const event of session.compactIfNeeded({
      reason: 'after-turn',
      tools: [],
      systemPrompt: '',
      thinkingLevel: 'none',
    })) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: 'context-compaction-start',
      reason: 'after-turn',
      messageCount: 12,
    });
    expect(events[1]).toMatchObject({
      type: 'context-compaction-end',
      summary: expect.any(String) as unknown,
      messageCount: 12,
    });
    expect((events[0] as {compactionId: string}).compactionId).toBe(
      (events[1] as {compactionId: string}).compactionId,
    );
  });

  it('yields nothing when the threshold is not met', async () => {
    const session = new LlmSession(() => Promise.resolve(CONFIG), {
      id: 'session-1',
      compactions: [],
      usageBaselineMessageCount: null,
      messages: [],
      usage: emptyUsage(),
    });

    const events: unknown[] = [];
    for await (const event of session.compactIfNeeded({
      reason: 'after-turn',
      tools: [],
      systemPrompt: '',
      thinkingLevel: 'none',
    })) {
      events.push(event);
    }

    expect(events).toEqual([]);
  });

  it('yields start + error then re-throws on failure', async () => {
    vi.spyOn(llmApi, 'streamCompletion').mockReturnValue(failingStream());
    const messages = largeOldMessages(12);
    const session = new LlmSession(() => Promise.resolve(CONFIG), {
      id: 'session-1',
      compactions: [],
      usageBaselineMessageCount: null,
      messages,
      usage: emptyUsage(),
    });

    const events: unknown[] = [];
    let thrown: unknown;
    try {
      for await (const event of session.compactIfNeeded({
        reason: 'after-turn',
        tools: [],
        systemPrompt: '',
        thinkingLevel: 'none',
      })) {
        events.push(event);
      }
    } catch (err: unknown) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain('provider failed');
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({type: 'context-compaction-start'});
    expect(events[1]).toMatchObject({
      type: 'context-compaction-error',
      reason: 'after-turn',
      message: expect.stringContaining('provider failed') as unknown,
    });
  });

  it('yields error with message "Aborted" when the signal trips mid-compaction', async () => {
    const controller = new AbortController();
    vi.spyOn(llmApi, 'streamCompletion').mockReturnValue(
      abortingSummaryStream(controller),
    );
    const messages = largeOldMessages(12);
    const session = new LlmSession(() => Promise.resolve(CONFIG), {
      id: 'session-1',
      compactions: [],
      usageBaselineMessageCount: null,
      messages,
      usage: emptyUsage(),
    });

    const events: unknown[] = [];
    let thrown: unknown;
    try {
      for await (const event of session.compactIfNeeded({
        reason: 'after-turn',
        tools: [],
        systemPrompt: '',
        thinkingLevel: 'none',
        signal: controller.signal,
      })) {
        events.push(event);
      }
    } catch (err: unknown) {
      thrown = err;
    }

    expect(thrown).toBeDefined();
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({type: 'context-compaction-start'});
    expect(events[1]).toMatchObject({
      type: 'context-compaction-error',
      message: 'Aborted',
    });
  });
});

describe('LlmSession usage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tracks latest context input separately from cumulative session totals', async () => {
    vi.spyOn(llmApi, 'streamCompletion')
      .mockReturnValueOnce(
        usageStream({
          inputTokens: 100,
          outputTokens: 10,
          cacheReadInputTokens: 20,
        }),
      )
      .mockReturnValueOnce(
        usageStream({
          inputTokens: 40,
          outputTokens: 8,
          cacheReadInputTokens: 5,
        }),
      );
    const session = new LlmSession(() => Promise.resolve(CONFIG));

    await drain(session.sendUserMessage('first', [], '', 'none').stream);
    await drain(session.sendUserMessage('second', [], '', 'none').stream);

    expect(session.getUsage()).toEqual({
      currentContextInputTokens: 40,
      latestCallOutputTokens: 8,
      sessionInputTokens: 140,
      sessionOutputTokens: 18,
      sessionCacheReadInputTokens: 25,
    });
  });

  it('rolls back usage when the provider stream fails after reporting usage', async () => {
    vi.spyOn(llmApi, 'streamCompletion').mockReturnValue(
      failingAfterUsageStream(),
    );
    const session = new LlmSession(() => Promise.resolve(CONFIG));

    await expect(
      drain(session.sendUserMessage('hello', [], '', 'none').stream),
    ).rejects.toThrow('provider failed after usage');

    expect(session.getUsage()).toEqual(emptyUsage());
  });
});
