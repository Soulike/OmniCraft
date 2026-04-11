import type {LlmConfig} from '../llm-api/types.js';
import {
  getClaudeMaxInputTokens,
  getClaudeMaxOutputTokens,
} from './claude-capacity.js';
import {
  getOpenAIMaxInputTokens,
  getOpenAIMaxOutputTokens,
} from './openai-capacity.js';

/** Queries model token limits, dispatching by provider. */
export const modelCapacity = {
  /** Returns the maximum output tokens for the configured model. */
  async getMaxOutputTokens(config: Readonly<LlmConfig>): Promise<number> {
    switch (config.apiFormat) {
      case 'claude':
        return getClaudeMaxOutputTokens(config);
      case 'openai':
      case 'openai-responses':
        return getOpenAIMaxOutputTokens(config);
    }
  },

  /** Returns the maximum input tokens (context window) for the configured model. */
  async getMaxInputTokens(config: Readonly<LlmConfig>): Promise<number> {
    switch (config.apiFormat) {
      case 'claude':
        return getClaudeMaxInputTokens(config);
      case 'openai':
      case 'openai-responses':
        return getOpenAIMaxInputTokens(config);
    }
  },
};
