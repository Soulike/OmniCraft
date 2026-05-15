import crypto from 'node:crypto';

import type {LlmMessage} from '../../llm-api/index.js';
import type {ToolDefinition} from '../../tool/types.js';
import {
  compactionMessageSlimmer,
  type RecentContext,
} from './compaction-message-slimmer.js';
import {compactionPromptBuilder} from './compaction-prompt-builder.js';
import {compactionSummaryGenerator} from './compaction-summary-generator.js';
import type {
  LlmHistoryCompactionInput,
  LlmHistoryCompactionResult,
} from './llm-compaction-types.js';

interface CompactionSummaryGeneratorLike {
  generate(input: LlmHistoryCompactionInput): Promise<string>;
}

interface CompactionMessageSlimmerLike {
  buildRecentContext(
    messages: readonly LlmMessage[],
    tools: readonly ToolDefinition[],
  ): RecentContext;
}

interface CompactionPromptBuilderLike {
  buildCompactedMessageContent(input: {
    readonly summary: string;
    readonly recentContext: string;
  }): string;
}

export interface LlmHistoryCompactorDependencies {
  readonly summaryGenerator?: CompactionSummaryGeneratorLike;
  readonly messageSlimmer?: CompactionMessageSlimmerLike;
  readonly promptBuilder?: CompactionPromptBuilderLike;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new Error('Aborted');
}

export class LlmHistoryCompactor {
  private readonly summaryGenerator: CompactionSummaryGeneratorLike;
  private readonly messageSlimmer: CompactionMessageSlimmerLike;
  private readonly promptBuilder: CompactionPromptBuilderLike;

  constructor(dependencies: LlmHistoryCompactorDependencies = {}) {
    this.summaryGenerator =
      dependencies.summaryGenerator ?? compactionSummaryGenerator;
    this.messageSlimmer =
      dependencies.messageSlimmer ?? compactionMessageSlimmer;
    this.promptBuilder = dependencies.promptBuilder ?? compactionPromptBuilder;
  }

  async compact(
    input: LlmHistoryCompactionInput,
  ): Promise<LlmHistoryCompactionResult> {
    const beforeCharCount = JSON.stringify(input.messages).length;
    const summary = await this.summaryGenerator.generate(input);
    throwIfAborted(input.signal);

    if (!summary) {
      throw new Error('Compaction summary is empty');
    }

    const recentContext = this.messageSlimmer.buildRecentContext(
      input.messages,
      input.tools,
    );
    const replacementMessages: LlmMessage[] = [
      {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        role: 'user',
        content: this.promptBuilder.buildCompactedMessageContent({
          summary,
          recentContext: recentContext.content,
        }),
      },
    ];

    return {
      summary,
      replacementMessages,
      metadataInput: {
        recentContextMessageCount: recentContext.sourceMessageCount,
        beforeCharCount,
        afterCharCount: JSON.stringify(replacementMessages).length,
      },
    };
  }
}

export const llmHistoryCompactor = new LlmHistoryCompactor();
