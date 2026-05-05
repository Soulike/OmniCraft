import type {LlmSessionUsage} from './types.js';

export function createEmptyLlmSessionUsage(): LlmSessionUsage {
  return {
    currentContextInputTokens: 0,
    latestCallOutputTokens: 0,
    sessionInputTokens: 0,
    sessionOutputTokens: 0,
    sessionCacheReadInputTokens: 0,
  };
}
