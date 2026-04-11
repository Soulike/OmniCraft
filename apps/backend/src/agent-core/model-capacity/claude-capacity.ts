import Anthropic from '@anthropic-ai/sdk';

import type {LlmConfig} from '../llm-api/types.js';

const DEFAULT_MAX_OUTPUT_TOKENS = 16_384;
const DEFAULT_MAX_INPUT_TOKENS = 200_000;

interface CachedCapacity {
  maxOutputTokens: number;
  maxInputTokens: number;
}

/** Module-level cache keyed by `${baseUrl}::${model}`. */
const cache = new Map<string, CachedCapacity>();

function cacheKey(config: Readonly<LlmConfig>): string {
  return `${config.baseUrl}::${config.model}`;
}

/** Queries the Anthropic Models API and caches the result. */
async function resolve(config: Readonly<LlmConfig>): Promise<CachedCapacity> {
  const key = cacheKey(config);
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    const model = await client.models.retrieve(config.model);
    const capacity: CachedCapacity = {
      maxOutputTokens: model.max_tokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      maxInputTokens: model.max_input_tokens ?? DEFAULT_MAX_INPUT_TOKENS,
    };
    cache.set(key, capacity);
    return capacity;
  } catch {
    // Proxy may not support /v1/models — fall back to safe defaults.
    const fallback: CachedCapacity = {
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
      maxInputTokens: DEFAULT_MAX_INPUT_TOKENS,
    };
    cache.set(key, fallback);
    return fallback;
  }
}

/** Returns the max output tokens for a Claude model. */
export async function getClaudeMaxOutputTokens(
  config: Readonly<LlmConfig>,
): Promise<number> {
  const capacity = await resolve(config);
  return capacity.maxOutputTokens;
}

/** Returns the max input tokens (context window) for a Claude model. */
export async function getClaudeMaxInputTokens(
  config: Readonly<LlmConfig>,
): Promise<number> {
  const capacity = await resolve(config);
  return capacity.maxInputTokens;
}
