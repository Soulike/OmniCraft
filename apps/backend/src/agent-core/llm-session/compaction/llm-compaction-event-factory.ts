import type {SseContextCompactionEvent} from '@omnicraft/sse-events';

import type {
  LlmCompactDecision,
  LlmHistoryCompactionResult,
} from './llm-compaction-types.js';

export class LlmCompactionEventFactory {
  createStartEvent(decision: LlmCompactDecision): SseContextCompactionEvent {
    return {
      type: 'context-compaction-start',
      compactionId: decision.compactionId,
      reason: decision.reason,
      beforeTokens: decision.beforeTokens,
      messageCount: decision.coveredMessageCount,
    };
  }

  createEndEvent(
    decision: LlmCompactDecision,
    historyResult: LlmHistoryCompactionResult,
    afterTokens: number,
  ): SseContextCompactionEvent {
    return {
      type: 'context-compaction-end',
      compactionId: decision.compactionId,
      summary: historyResult.summary,
      beforeTokens: decision.beforeTokens,
      afterTokens,
      messageCount: decision.coveredMessageCount,
      durationMs: Date.now() - decision.startedAt,
    };
  }

  createErrorEvent(
    decision: LlmCompactDecision,
    error: unknown,
    signal?: AbortSignal,
  ): SseContextCompactionEvent {
    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Unknown error';

    return {
      type: 'context-compaction-error',
      compactionId: decision.compactionId,
      reason: decision.reason,
      message: signal?.aborted ? 'Aborted' : errorMessage,
      beforeTokens: decision.beforeTokens,
      messageCount: decision.coveredMessageCount,
    };
  }
}

export const llmCompactionEventFactory = new LlmCompactionEventFactory();
