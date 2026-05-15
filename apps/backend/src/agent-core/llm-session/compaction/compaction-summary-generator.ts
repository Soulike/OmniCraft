import crypto from 'node:crypto';

import type {LlmConfig, LlmMessage} from '../../llm-api/index.js';
import {llmApi} from '../../llm-api/index.js';
import type {ToolDefinition} from '../../tool/types.js';
import {compactionMessageSlimmer} from './compaction-message-slimmer.js';
import {compactionPromptBuilder} from './compaction-prompt-builder.js';

export interface GenerateCompactionSummaryOptions {
  readonly config: Readonly<LlmConfig>;
  readonly messages: readonly LlmMessage[];
  readonly tools: readonly ToolDefinition[];
  readonly signal?: AbortSignal;
}

export class CompactionSummaryGenerator {
  async generate(options: GenerateCompactionSummaryOptions): Promise<string> {
    const prompt = compactionPromptBuilder.buildCompactionPrompt(
      compactionMessageSlimmer.slimMessagesForSummary(
        options.messages,
        options.tools,
      ),
    );
    const messages: LlmMessage[] = [
      {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        role: 'user',
        content: prompt,
      },
    ];
    const stream = llmApi.streamCompletion({
      config: options.config,
      messages,
      tools: [],
      thinkingLevel: 'none',
      ...(options.signal ? {signal: options.signal} : {}),
    });

    let text = '';
    for await (const event of stream) {
      if (event.type === 'text-delta') {
        text += event.content;
      }
    }

    return text.trim();
  }
}

export const compactionSummaryGenerator = new CompactionSummaryGenerator();
