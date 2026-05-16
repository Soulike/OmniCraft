import crypto from 'node:crypto';

import {modelCapacity} from '../../model-capacity/index.js';
import {COMPACTION_TRIGGER_INPUT_TOKEN_RATIO} from './compaction-constants.js';
import {
  LlmCompactionTokenEstimator,
  llmCompactionTokenEstimator,
} from './llm-compaction-token-estimator.js';
import type {
  LlmCompactionDecision,
  LlmCompactionDecisionInput,
} from './llm-compaction-types.js';

export class LlmCompactionDecisionService {
  constructor(
    private readonly tokenEstimator: LlmCompactionTokenEstimator = llmCompactionTokenEstimator,
  ) {}

  async decide(
    input: LlmCompactionDecisionInput,
  ): Promise<LlmCompactionDecision> {
    const maxInputTokens = await modelCapacity.getMaxInputTokens(input.config);
    const currentTokens = this.tokenEstimator.estimateCurrentTokens(input);

    if (currentTokens < maxInputTokens * COMPACTION_TRIGGER_INPUT_TOKEN_RATIO) {
      return {type: 'skip'};
    }

    if (input.messages.length === 0) return {type: 'skip'};

    return {
      type: 'compact',
      compactionId: crypto.randomUUID(),
      reason: input.options.reason,
      beforeTokens: currentTokens,
      coveredMessageCount: input.messages.length,
      startedAt: Date.now(),
    };
  }
}

export const llmCompactionDecisionService = new LlmCompactionDecisionService();
