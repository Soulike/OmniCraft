import type OpenAI from 'openai';

import {estimatePromptTokens} from '../token-estimator.js';
import type {LlmTokenCountOptions} from '../types.js';
import {toOpenAITool, toReasoningEffort, toSdkMessage} from './helpers.js';

export function countOpenAITokens(
  options: LlmTokenCountOptions,
): Promise<number> {
  const messages: OpenAI.ChatCompletionMessageParam[] = [];
  if (options.systemPrompt) {
    messages.push({role: 'system', content: options.systemPrompt});
  }
  messages.push(...options.messages.map(toSdkMessage));

  return Promise.resolve(
    estimatePromptTokens({
      model: options.config.model,
      messages,
      tools: options.tools.map(toOpenAITool),
      reasoning_effort: toReasoningEffort(options.thinkingLevel),
    }),
  );
}
