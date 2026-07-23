import Anthropic from '@anthropic-ai/sdk';

import {logger} from '@/logger.js';

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
  const outputConfig = toOutputConfig(options.config.thinkingLevel);
  const request = {
    model: config.model,
    system: systemPrompt
      ? [{type: 'text' as const, text: systemPrompt}]
      : undefined,
    messages: messages.map(toSdkMessage),
    tools: options.tools.map(toClaudeTool),
    thinking: toThinkingConfig(options.config.thinkingLevel),
    ...(outputConfig ? {output_config: outputConfig} : {}),
  };

  try {
    const result = await client.messages.countTokens(request);
    return result.input_tokens;
  } catch (err: unknown) {
    logger.warn(
      {err, model: config.model, baseUrl: config.baseUrl},
      'Failed to count Claude tokens, using local estimate',
    );
    // Estimate from the neutral request inputs (not the provider-shaped `request`),
    // so media is counted by bounded per-type cost rather than base64 length.
    return estimatePromptTokens({
      messages,
      ...(systemPrompt ? {systemPrompt} : {}),
      tools: options.tools,
    });
  }
}
