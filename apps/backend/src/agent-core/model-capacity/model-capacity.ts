import type {LlmConfig} from '../llm-api/types.js';
import {
  getClaudeMaxContextWindowTokens,
  getClaudeMaxOutputTokens,
  getClaudeMaxPromptTokens,
} from './claude-capacity.js';
import {
  getOpenAIMaxContextWindowTokens,
  getOpenAIMaxOutputTokens,
  getOpenAIMaxPromptTokens,
} from './openai-capacity.js';

/** Queries model token limits, dispatching by provider. */
export const modelCapacity = {
  /** Returns the maximum output tokens for the configured model. */
  async getMaxOutputTokens(config: Readonly<LlmConfig>): Promise<number> {
    switch (config.apiFormat) {
      case 'claude':
        return getClaudeMaxOutputTokens(config);
      case 'openai-responses':
        return getOpenAIMaxOutputTokens(config);
    }
  },

  /** Returns the maximum prompt tokens (input budget, excludes output) for the configured model. */
  async getMaxPromptTokens(config: Readonly<LlmConfig>): Promise<number> {
    switch (config.apiFormat) {
      case 'claude':
        return getClaudeMaxPromptTokens(config);
      case 'openai-responses':
        return getOpenAIMaxPromptTokens(config);
    }
  },

  /** Returns the maximum context window tokens (prompt + output) for the configured model. */
  async getMaxContextWindowTokens(
    config: Readonly<LlmConfig>,
  ): Promise<number> {
    switch (config.apiFormat) {
      case 'claude':
        return getClaudeMaxContextWindowTokens(config);
      case 'openai-responses':
        return getOpenAIMaxContextWindowTokens(config);
    }
  },
};
