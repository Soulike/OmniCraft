import {streamClaude} from './claude/index.js';
import {streamOpenAI} from './openai/index.js';
import {streamOpenAIResponses} from './openai-responses-adapter.js';
import type {LlmCompletionOptions, LlmEventStream} from './types.js';

/** External API layer for LLM communication. */
export const llmApi = {
  /**
   * Streams LLM events from the configured LLM.
   * Dispatches to the appropriate SDK based on `config.apiFormat`.
   */
  streamCompletion(options: LlmCompletionOptions): LlmEventStream {
    switch (options.config.apiFormat) {
      case 'claude':
        return streamClaude(options);
      case 'openai':
        return streamOpenAI(options);
      case 'openai-responses':
        return streamOpenAIResponses(options);
    }
  },
};
