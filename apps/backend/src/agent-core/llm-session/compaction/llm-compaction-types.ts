import type {LlmAttachment} from '@omnicraft/tool-schemas';

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
  /** Attachments recorded by earlier compactions of this session. The
   *  replacement message they produced carries `attachments: []`, so without
   *  this a second compaction would find no structured record of files the
   *  model has already seen and drop them from the path list. */
  readonly carriedAttachments: readonly LlmAttachment[];

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
  /** Every attachment the compacted history had seen, for the metadata to
   *  carry forward. */
  readonly attachments: readonly LlmAttachment[];
  readonly metadataInput: LlmHistoryCompactionMetadataInput;
}

export interface LlmSessionCompactionPatch {
  readonly messages: readonly LlmMessage[];
  readonly latestUsageInputMessageCount: number | null;
  readonly usage: LlmSessionUsage;
  readonly metadata: LlmCompactionMetadata;
}

export interface CompactLlmSessionIfNeededInput extends LlmCompactionDecisionInput {
  /** Attachments recorded by earlier compactions of this session; see
   *  {@link LlmHistoryCompactionInput.carriedAttachments}. */
  readonly carriedAttachments: readonly LlmAttachment[];
  /** Absolute attachments directory, or null when the session has no store. */
  readonly attachmentsDirectory: string | null;
  commit(patch: LlmSessionCompactionPatch): void | Promise<void>;
}
