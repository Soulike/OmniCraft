import {z} from 'zod';

import {estimatePromptTokens} from '../../llm-api/token-estimator.js';
import type {
  EstimateCurrentTokensInput,
  EstimateTokensFromMessagesInput,
} from './llm-compaction-types.js';

export class LlmCompactionTokenEstimator {
  estimateCurrentTokens(input: EstimateCurrentTokensInput): number {
    const latestUsageEstimate = this.estimateTokensFromLatestUsage(input);
    if (latestUsageEstimate !== null) return latestUsageEstimate;

    return this.estimateTokensFromMessages(input);
  }

  estimateTokensFromMessages(input: EstimateTokensFromMessagesInput): number {
    const {messages, options} = input;

    return estimatePromptTokens({
      messages,
      ...(options.systemPrompt ? {systemPrompt: options.systemPrompt} : {}),
      tools: options.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters:
          tool.kind === 'mcp'
            ? tool.inputJsonSchema
            : z.toJSONSchema(tool.parameters),
      })),
    });
  }

  private estimateTokensFromLatestUsage(
    input: EstimateCurrentTokensInput,
  ): number | null {
    const {latestUsageInputMessageCount, messages, usage} = input;
    if (latestUsageInputMessageCount === null) return null;
    if (usage.currentContextInputTokens <= 0) return null;

    const pendingStart = latestUsageInputMessageCount + 1;
    if (pendingStart > messages.length) return null;

    const pendingMessages = messages.slice(pendingStart);
    const pendingInputTokens =
      pendingMessages.length > 0 ? estimatePromptTokens(pendingMessages) : 0;

    return (
      usage.currentContextInputTokens +
      usage.latestCallOutputTokens +
      pendingInputTokens
    );
  }
}

export const llmCompactionTokenEstimator = new LlmCompactionTokenEstimator();
