import type {LlmConfig, LlmMessage} from '../../llm-api/index.js';
import type {
  LlmCompactionMetadata,
  LlmCompactionOptions,
  LlmSessionUsage,
} from '../types.js';

export interface EstimateTokensFromMessagesInput {
  readonly messages: readonly LlmMessage[];
  readonly options: LlmCompactionOptions;
}

export interface EstimateCurrentTokensInput extends EstimateTokensFromMessagesInput {
  readonly usage: LlmSessionUsage;
  readonly latestUsageInputMessageCount: number | null;
}

export interface LlmCompactionDecisionInput extends EstimateCurrentTokensInput {
  readonly config: Readonly<LlmConfig>;
}

export type LlmCompactionDecision =
  | {readonly type: 'skip'}
  | {
      readonly type: 'compact';
      readonly compactionId: string;
      readonly reason: LlmCompactionOptions['reason'];
      readonly beforeTokens: number;
      readonly coveredMessageCount: number;
      readonly startedAt: number;
    };

export interface LlmSessionCompactionPatch {
  readonly messages: readonly LlmMessage[];
  readonly latestUsageInputMessageCount: number | null;
  readonly usage: LlmSessionUsage;
  readonly compaction?: LlmCompactionMetadata;
}

export type CompactLlmSessionIfNeededInput = LlmCompactionDecisionInput;
