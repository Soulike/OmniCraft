import type {LlmConfig, LlmMessage} from '../../llm-api/index.js';
import type {AnyToolDefinition} from '../../tool/types.js';
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

export type LlmCompactDecision = Extract<
  LlmCompactionDecision,
  {readonly type: 'compact'}
>;

export interface LlmHistoryCompactionInput {
  readonly config: Readonly<LlmConfig>;
  readonly messages: readonly LlmMessage[];
  readonly tools: readonly AnyToolDefinition[];
  /** Absolute attachments directory, or null when the session has no store. */
  readonly attachmentsDirectory: string | null;
  readonly signal?: AbortSignal;
}

export interface LlmHistoryCompactionMetadataInput {
  readonly recentContextMessageCount: number;
  readonly beforeCharCount: number;
  readonly afterCharCount: number;
}

export interface LlmHistoryCompactionResult {
  readonly summary: string;
  readonly replacementMessages: readonly LlmMessage[];
  readonly metadataInput: LlmHistoryCompactionMetadataInput;
}

export interface LlmSessionCompactionPatch {
  readonly messages: readonly LlmMessage[];
  readonly latestUsageInputMessageCount: number | null;
  readonly usage: LlmSessionUsage;
  readonly metadata: LlmCompactionMetadata;
}

export interface CompactLlmSessionIfNeededInput extends LlmCompactionDecisionInput {
  /** Absolute attachments directory, or null when the session has no store. */
  readonly attachmentsDirectory: string | null;
  commit(patch: LlmSessionCompactionPatch): void | Promise<void>;
}
