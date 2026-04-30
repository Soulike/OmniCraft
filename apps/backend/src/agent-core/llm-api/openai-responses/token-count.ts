import OpenAIClient from 'openai';

import {estimatePromptTokens} from '../token-estimator.js';
import type {LlmTokenCountOptions} from '../types.js';
import {toFunctionTool, toInputItems, toReasoning} from './helpers.js';

export async function countOpenAIResponsesTokens(
  options: LlmTokenCountOptions,
): Promise<number> {
  const {config, messages, systemPrompt} = options;
  const client = new OpenAIClient({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });
  const reasoning = toReasoning(options.thinkingLevel);
  const request = {
    model: config.model,
    input: toInputItems(messages),
    ...(systemPrompt ? {instructions: systemPrompt} : {}),
    ...(options.tools.length > 0
      ? {tools: options.tools.map(toFunctionTool)}
      : {}),
    ...(reasoning ? {reasoning} : {}),
  };

  try {
    const result = await client.responses.inputTokens.count(request);
    return result.input_tokens;
  } catch {
    return estimatePromptTokens(request);
  }
}
