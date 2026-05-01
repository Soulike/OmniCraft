import crypto from 'node:crypto';

import type {LlmConfig, LlmMessage} from '../../llm-api/index.js';
import {llmApi} from '../../llm-api/index.js';
import type {ToolDefinition} from '../../tool/types.js';
import {buildCompactionPrompt} from './prompt.js';
import {slimMessagesForSummary} from './slim.js';

export interface GenerateCompactionSummaryOptions {
  readonly config: Readonly<LlmConfig>;
  readonly messages: readonly LlmMessage[];
  readonly tools: readonly ToolDefinition[];
}

export async function generateCompactionSummary(
  options: GenerateCompactionSummaryOptions,
): Promise<string> {
  const prompt = buildCompactionPrompt(
    slimMessagesForSummary(options.messages, options.tools),
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
  });

  let text = '';
  for await (const event of stream) {
    if (event.type === 'text-delta') {
      text += event.content;
    }
  }

  return text.trim();
}
