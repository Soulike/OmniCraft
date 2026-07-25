import crypto from 'node:crypto';

import type {LlmAttachment} from '@omnicraft/tool-schemas';

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

/** Every attachment referenced by the history being compacted, first occurrence
 *  wins, deduped by file name. */
function collectAttachments(messages: readonly LlmMessage[]): LlmAttachment[] {
  const byName = new Map<string, LlmAttachment>();
  for (const message of messages) {
    if (message.role !== 'user') continue;
    for (const attachment of message.attachments) {
      if (byName.has(attachment.fileName)) continue;
      byName.set(attachment.fileName, attachment);
    }
  }
  return [...byName.values()];
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
          attachments: collectAttachments(input.messages),
          attachmentsDirectory: input.attachmentsDirectory,
        }),
        attachments: [],
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
