import {afterEach, describe, expect, it, vi} from 'vitest';

import {llmApi, type LlmConfig, type LlmEventStream} from '../llm-api/index.js';
import {LlmSession} from './llm-session.js';
import {llmSessionSnapshotSchema} from './types.js';

const TEST_CONFIG: LlmConfig = {
  apiFormat: 'openai-responses',
  apiKey: 'test-key',
  baseUrl: 'https://example.test',
  model: 'test-model',
  thinkingLevel: 'none',
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

async function* emptyCompletionStream(): LlmEventStream {
  yield {type: 'message-start', messageId: 'assistant-message'};
  await Promise.resolve();
  yield {
    type: 'message-end',
    stopReason: 'end_turn',
    usage: {inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0},
  };
}

async function consume(stream: AsyncIterable<unknown>): Promise<void> {
  for await (const _event of stream) {
    // Drain stream so LlmSession commits messages.
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('llmSessionSnapshotSchema', () => {
  it('requires compactions metadata', () => {
    const result = llmSessionSnapshotSchema.safeParse({
      id: 'session-1',
      messages: [],
    });

    expect(result.success).toBe(false);
  });

  it('accepts an empty compactions array', () => {
    const result = llmSessionSnapshotSchema.safeParse({
      id: 'session-1',
      messages: [],
      compactions: [],
      latestUsageInputMessageCount: null,
      usage: emptyUsage(),
    });

    expect(result.success).toBe(true);
  });

  it('requires latest usage input message count', () => {
    const result = llmSessionSnapshotSchema.safeParse({
      id: 'session-1',
      messages: [],
      compactions: [],
      usage: emptyUsage(),
    });

    expect(result.success).toBe(false);
  });

  it('requires usage metadata', () => {
    const result = llmSessionSnapshotSchema.safeParse({
      id: 'session-1',
      messages: [],
      compactions: [],
      latestUsageInputMessageCount: null,
    });

    expect(result.success).toBe(false);
  });

  it('requires status on tool result messages', () => {
    const result = llmSessionSnapshotSchema.safeParse({
      id: 'session-1',
      compactions: [],
      latestUsageInputMessageCount: null,
      usage: emptyUsage(),
      messages: [
        {
          id: 'tool-message',
          createdAt: 1,
          role: 'tool',
          callId: 'call-1',
          content: 'done',
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('accepts status on tool result messages', () => {
    const result = llmSessionSnapshotSchema.safeParse({
      id: 'session-1',
      compactions: [],
      latestUsageInputMessageCount: null,
      usage: emptyUsage(),
      messages: [
        {
          id: 'tool-message',
          createdAt: 1,
          role: 'tool',
          callId: 'call-1',
          content: 'done',
          status: 'success',
        },
      ],
    });

    expect(result.success).toBe(true);
  });
});

describe('LlmSession snapshot metadata', () => {
  it('round-trips non-empty compactions through snapshots', () => {
    const snapshot = {
      id: 'session-1',
      messages: [],
      compactions: [
        {
          id: 'compaction-1',
          compactedAt: 123,
          coveredMessageCount: 10,
          recentContextMessageCount: 10,
          beforeCharCount: 1000,
          afterCharCount: 200,
        },
      ],
      latestUsageInputMessageCount: 1,
      usage: {
        currentContextInputTokens: 40,
        latestCallOutputTokens: 8,
        sessionInputTokens: 140,
        sessionOutputTokens: 18,
        sessionCacheReadInputTokens: 25,
      },
    };

    const session = new LlmSession(
      () => Promise.resolve(TEST_CONFIG),
      snapshot,
    );

    expect(session.toSnapshot()).toEqual(snapshot);
    expect(session.getUsage()).toEqual(snapshot.usage);
  });

  it('clears compaction metadata', () => {
    const session = new LlmSession(() => Promise.resolve(TEST_CONFIG), {
      id: 'session-1',
      messages: [],
      compactions: [
        {
          id: 'compaction-1',
          compactedAt: 123,
          coveredMessageCount: 10,
          recentContextMessageCount: 10,
          beforeCharCount: 1000,
          afterCharCount: 200,
        },
      ],
      latestUsageInputMessageCount: null,
      usage: emptyUsage(),
    });

    session.clear();

    expect(session.toSnapshot().compactions).toEqual([]);
  });

  it('persists status into submitted tool result messages', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion').mockReturnValue(
      emptyCompletionStream(),
    );
    const session = new LlmSession(() => Promise.resolve(TEST_CONFIG), {
      id: 'session-1',
      messages: [],
      compactions: [],
      latestUsageInputMessageCount: null,
      usage: emptyUsage(),
    });

    await consume(
      session.submitToolResults(
        [{callId: 'call-1', content: 'done', status: 'success'}],
        [],
        '',
      ),
    );

    expect(session.getMessages()[0]).toMatchObject({
      role: 'tool',
      callId: 'call-1',
      content: 'done',
      status: 'success',
    });
  });
});
