import crypto from 'node:crypto';

import type {LlmConfig, LlmMessage} from '../../llm-api/index.js';
import {llmApi} from '../../llm-api/index.js';

export interface GenerateCompactionSummaryOptions {
  readonly config: Readonly<LlmConfig>;
  readonly prompt: string;
}

export async function generateCompactionSummary(
  options: GenerateCompactionSummaryOptions,
): Promise<string> {
  const messages: LlmMessage[] = [
    {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      role: 'user',
      content: options.prompt,
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
