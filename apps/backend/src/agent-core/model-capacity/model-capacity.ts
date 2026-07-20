import type {LlmConfig} from '../llm-api/types.js';

/**
 * Resolves model token limits from the user-provided LLM configuration.
 * The full context window and max output are hand-configured in settings;
 * the input budget is derived as (window - output).
 */
export const modelCapacity = {
  /** Maximum output tokens the model may generate per response. */
  getMaxOutputTokens(config: Readonly<LlmConfig>): number {
    return config.maxOutputTokens;
  },

  /**
   * Maximum prompt (input) tokens: the full context window minus reserved
   * output. Clamped to >= 1 so a misconfigured pair (output >= context)
   * degrades to aggressive compaction rather than a non-positive budget.
   */
  getMaxPromptTokens(config: Readonly<LlmConfig>): number {
    return Math.max(1, config.maxContextTokens - config.maxOutputTokens);
  },
};
