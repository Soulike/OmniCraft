import {afterEach, describe, expect, it, vi} from 'vitest';

import {LlmCompactionEventFactory} from './llm-compaction-event-factory.js';
import type {
  LlmCompactionDecision,
  LlmHistoryCompactionResult,
} from './llm-compaction-types.js';

const decision: Extract<LlmCompactionDecision, {type: 'compact'}> = {
  type: 'compact',
  compactionId: 'compaction-1',
  reason: 'before-llm-call',
  beforeTokens: 123,
  coveredMessageCount: 4,
  startedAt: 1000,
};

const historyResult: LlmHistoryCompactionResult = {
  summary: 'summary text',
  replacementMessages: [
    {id: 'summary', createdAt: 2, role: 'user', content: 'compacted'},
  ],
  metadataInput: {
    recentContextMessageCount: 2,
    beforeCharCount: 100,
    afterCharCount: 50,
  },
};

describe('LlmCompactionEventFactory', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a context compaction start event from a compact decision', () => {
    const factory = new LlmCompactionEventFactory();

    expect(factory.createStartEvent(decision)).toEqual({
      type: 'context-compaction-start',
      compactionId: 'compaction-1',
      reason: 'before-llm-call',
      beforeTokens: 123,
      messageCount: 4,
    });
  });

  it('creates a context compaction end event with summary, token counts, message count, and duration', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1250);
    const factory = new LlmCompactionEventFactory();

    expect(factory.createEndEvent(decision, historyResult, 45)).toEqual({
      type: 'context-compaction-end',
      compactionId: 'compaction-1',
      summary: 'summary text',
      beforeTokens: 123,
      afterTokens: 45,
      messageCount: 4,
      durationMs: 250,
    });
  });

  it('creates a context compaction error event with a normal error message', () => {
    const factory = new LlmCompactionEventFactory();

    expect(
      factory.createErrorEvent(decision, new Error('normal error message')),
    ).toEqual({
      type: 'context-compaction-error',
      compactionId: 'compaction-1',
      reason: 'before-llm-call',
      message: 'normal error message',
      beforeTokens: 123,
      messageCount: 4,
    });
  });

  it('uses Aborted as the error message when the signal is aborted', () => {
    const factory = new LlmCompactionEventFactory();
    const controller = new AbortController();
    controller.abort();

    expect(
      factory.createErrorEvent(
        decision,
        new Error('internal abort reason'),
        controller.signal,
      ),
    ).toMatchObject({
      type: 'context-compaction-error',
      message: 'Aborted',
    });
  });
});
