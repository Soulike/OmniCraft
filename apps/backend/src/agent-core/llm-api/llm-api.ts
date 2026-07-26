import {assertWithinMaterializationBudget} from './attachment-limits.js';
import {countClaudeTokens, streamClaude} from './claude/index.js';
import {
  countOpenAIResponsesTokens,
  streamOpenAIResponses,
} from './openai-responses/index.js';
import type {
  LlmCompletionOptions,
  LlmEventStream,
  LlmTokenCountOptions,
} from './types.js';

/** External API layer for LLM communication. */
export const llmApi = {
  /**
   * Streams LLM events from the configured LLM.
   * Dispatches to the appropriate SDK based on `config.apiFormat`.
   */
  streamCompletion(options: LlmCompletionOptions): LlmEventStream {
    // Before the dispatch, so it covers every adapter rather than each one
    // remembering. This is the last point at which the bytes are still ours.
    assertWithinMaterializationBudget(options.messages);
    switch (options.config.apiFormat) {
      case 'claude':
        return streamClaude(options);
      case 'openai-responses':
        return streamOpenAIResponses(options);
    }
  },

  countToken(options: LlmTokenCountOptions): Promise<number> {
    switch (options.config.apiFormat) {
      case 'claude':
        return countClaudeTokens(options);
      case 'openai-responses':
        return countOpenAIResponsesTokens(options);
    }
  },
};
