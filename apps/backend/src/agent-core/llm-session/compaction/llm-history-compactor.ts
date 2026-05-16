import crypto from 'node:crypto';

import type {LlmMessage} from '../../llm-api/index.js';
import {
  CompactionMessageSlimmer,
  compactionMessageSlimmer,
} from './compaction-message-slimmer.js';
import {
  CompactionPromptBuilder,
  compactionPromptBuilder,
} from './compaction-prompt-builder.js';
import {
  CompactionSummaryGenerator,
  compactionSummaryGenerator,
} from './compaction-summary-generator.js';
import type {
  LlmHistoryCompactionInput,
  LlmHistoryCompactionResult,
} from './llm-compaction-types.js';

export interface LlmHistoryCompactorDependencies {
  readonly summaryGenerator?: CompactionSummaryGenerator;
  readonly messageSlimmer?: CompactionMessageSlimmer;
  readonly promptBuilder?: CompactionPromptBuilder;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new Error('Aborted');
}

export class LlmHistoryCompactor {
  private readonly summaryGenerator: CompactionSummaryGenerator;
  private readonly messageSlimmer: CompactionMessageSlimmer;
  private readonly promptBuilder: CompactionPromptBuilder;

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
