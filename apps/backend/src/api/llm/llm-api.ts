import {streamClaude} from './claude-adapter.js';
import {streamOpenAI} from './openai-adapter.js';
import type {LlmConfig, LlmEventStream, LlmMessage} from './types.js';

/** External API layer for LLM communication. */
export const llmApi = {
  /**
   * Streams LLM events from the configured LLM.
   * Dispatches to the appropriate SDK based on `config.apiFormat`.
   */
  streamCompletion(config: LlmConfig, messages: LlmMessage[]): LlmEventStream {
    switch (config.apiFormat) {
      case 'claude':
        return streamClaude(config, messages);
      case 'openai':
        return streamOpenAI(config, messages);
    }
  },
};
