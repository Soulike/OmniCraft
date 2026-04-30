import Anthropic from '@anthropic-ai/sdk';

import {estimatePromptTokens} from '../token-estimator.js';
import type {LlmTokenCountOptions} from '../types.js';
import {
  toClaudeTool,
  toOutputConfig,
  toSdkMessage,
  toThinkingConfig,
} from './helpers.js';

export async function countClaudeTokens(
  options: LlmTokenCountOptions,
): Promise<number> {
  const {config, messages, systemPrompt} = options;
  const client = new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });
  const outputConfig = toOutputConfig(options.thinkingLevel);
  const request = {
    model: config.model,
    system: systemPrompt
      ? [{type: 'text' as const, text: systemPrompt}]
      : undefined,
    messages: messages.map(toSdkMessage),
    tools: options.tools.map(toClaudeTool),
    thinking: toThinkingConfig(options.thinkingLevel),
    ...(outputConfig ? {output_config: outputConfig} : {}),
  };

  try {
    const result = await client.messages.countTokens(request);
    return result.input_tokens;
  } catch {
    return estimatePromptTokens(request);
  }
}
