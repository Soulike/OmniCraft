import type {SseContextCompactionEvent} from '@omnicraft/sse-events';

import {llmCompactionDecisionService} from './llm-compaction-decision-service.js';
import {llmCompactionEventFactory} from './llm-compaction-event-factory.js';
import {llmCompactionTokenEstimator} from './llm-compaction-token-estimator.js';
import type {
  CompactLlmSessionIfNeededInput,
  EstimateTokensFromMessagesInput,
  LlmCompactDecision,
  LlmCompactionDecision,
  LlmCompactionDecisionInput,
  LlmHistoryCompactionInput,
  LlmHistoryCompactionResult,
  LlmSessionCompactionPatch,
} from './llm-compaction-types.js';
import {llmHistoryCompactor} from './llm-history-compactor.js';

interface LlmCompactionDecisionServiceLike {
  decide(input: LlmCompactionDecisionInput): Promise<LlmCompactionDecision>;
}

interface LlmHistoryCompactorLike {
  compact(
    input: LlmHistoryCompactionInput,
  ): Promise<LlmHistoryCompactionResult>;
}

interface LlmCompactionEventFactoryLike {
  createStartEvent(decision: LlmCompactDecision): SseContextCompactionEvent;
  createEndEvent(
    decision: LlmCompactDecision,
    historyResult: LlmHistoryCompactionResult,
    afterTokens: number,
  ): SseContextCompactionEvent;
  createErrorEvent(
    decision: LlmCompactDecision,
    error: unknown,
    signal?: AbortSignal,
  ): SseContextCompactionEvent;
}

interface LlmCompactionTokenEstimatorLike {
  estimateTokensFromMessages(input: EstimateTokensFromMessagesInput): number;
}

export interface LlmSessionCompactorDependencies {
  readonly decisionService?: LlmCompactionDecisionServiceLike;
  readonly historyCompactor?: LlmHistoryCompactorLike;
  readonly eventFactory?: LlmCompactionEventFactoryLike;
  readonly tokenEstimator?: LlmCompactionTokenEstimatorLike;
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

function normalizeError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error(normalizeErrorMessage(error));
}

export class LlmSessionCompactor {
  private readonly decisionService: LlmCompactionDecisionServiceLike;
  private readonly historyCompactor: LlmHistoryCompactorLike;
  private readonly eventFactory: LlmCompactionEventFactoryLike;
  private readonly tokenEstimator: LlmCompactionTokenEstimatorLike;

  constructor(dependencies: LlmSessionCompactorDependencies = {}) {
    this.decisionService =
      dependencies.decisionService ?? llmCompactionDecisionService;
    this.historyCompactor =
      dependencies.historyCompactor ?? llmHistoryCompactor;
    this.eventFactory = dependencies.eventFactory ?? llmCompactionEventFactory;
    this.tokenEstimator =
      dependencies.tokenEstimator ?? llmCompactionTokenEstimator;
  }

  async *compactIfNeeded(
    input: CompactLlmSessionIfNeededInput,
  ): AsyncGenerator<SseContextCompactionEvent, void, undefined> {
    const decision = await this.decisionService.decide(input);
    if (decision.type === 'skip') return;

    yield this.eventFactory.createStartEvent(decision);

    try {
      const historyResult = await this.historyCompactor.compact({
        config: input.config,
        messages: input.messages,
        tools: input.options.tools,
        ...(input.options.signal ? {signal: input.options.signal} : {}),
      });
      const afterTokens = this.tokenEstimator.estimateTokensFromMessages({
        messages: historyResult.replacementMessages,
        options: input.options,
      });

      await input.commit(
        this.createPatch(input, decision, historyResult, afterTokens),
      );

      yield this.eventFactory.createEndEvent(
        decision,
        historyResult,
        afterTokens,
      );
    } catch (error: unknown) {
      yield this.eventFactory.createErrorEvent(
        decision,
        error,
        input.options.signal,
      );
      throw normalizeError(error);
    }
  }

  private createPatch(
    input: CompactLlmSessionIfNeededInput,
    decision: LlmCompactDecision,
    historyResult: LlmHistoryCompactionResult,
    afterTokens: number,
  ): LlmSessionCompactionPatch {
    return {
      messages: historyResult.replacementMessages,
      latestUsageInputMessageCount: null,
      usage: {
        ...input.usage,
        currentContextInputTokens: afterTokens,
        latestCallOutputTokens: 0,
      },
      metadata: {
        id: decision.compactionId,
        compactedAt: Date.now(),
        coveredMessageCount: decision.coveredMessageCount,
        recentContextMessageCount:
          historyResult.metadataInput.recentContextMessageCount,
        beforeCharCount: historyResult.metadataInput.beforeCharCount,
        afterCharCount: historyResult.metadataInput.afterCharCount,
      },
    };
  }
}

export const llmSessionCompactor = new LlmSessionCompactor();
