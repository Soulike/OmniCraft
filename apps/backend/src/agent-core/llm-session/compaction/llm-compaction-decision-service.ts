import crypto from 'node:crypto';

import type {LlmMessage, LlmUserMessage} from '../../llm-api/index.js';
import {modelCapacity} from '../../model-capacity/index.js';
import {
  COMPACTION_TRIGGER_ATTACHMENT_BYTES,
  COMPACTION_TRIGGER_PROMPT_TOKEN_RATIO,
} from './compaction-constants.js';
import {
  LlmCompactionTokenEstimator,
  llmCompactionTokenEstimator,
} from './llm-compaction-token-estimator.js';
import type {
  LlmCompactionDecision,
  LlmCompactionDecisionInput,
} from './llm-compaction-types.js';

function isUserMessage(message: LlmMessage): message is LlmUserMessage {
  return message.role === 'user';
}

/**
 * Sums attachment bytes across `role: 'user'` messages only. A compacted
 * history is a single synthetic user message carrying `attachments: []`, so
 * it contributes zero — that is what lets compaction actually relieve the
 * pressure it was triggered by.
 */
function sumUserAttachmentBytes(messages: readonly LlmMessage[]): number {
  return messages
    .filter(isUserMessage)
    .reduce(
      (total, message) =>
        total +
        message.attachments.reduce(
          (attachmentTotal, attachment) =>
            attachmentTotal + attachment.byteSize,
          0,
        ),
      0,
    );
}

export class LlmCompactionDecisionService {
  constructor(
    private readonly tokenEstimator: LlmCompactionTokenEstimator = llmCompactionTokenEstimator,
  ) {}

  decide(input: LlmCompactionDecisionInput): LlmCompactionDecision {
    const maxPromptTokens = modelCapacity.getMaxPromptTokens(input.config);
    const currentTokens = this.tokenEstimator.estimateCurrentTokens(input);
    const attachmentBytes = sumUserAttachmentBytes(input.messages);

    const underTokenRatio =
      currentTokens < maxPromptTokens * COMPACTION_TRIGGER_PROMPT_TOKEN_RATIO;
    const underAttachmentTrigger =
      attachmentBytes < COMPACTION_TRIGGER_ATTACHMENT_BYTES;

    if (underTokenRatio && underAttachmentTrigger) {
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
