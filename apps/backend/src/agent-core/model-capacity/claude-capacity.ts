import Anthropic from '@anthropic-ai/sdk';

import {logger} from '@/logger.js';

import type {LlmConfig} from '../llm-api/types.js';

const DEFAULT_MAX_OUTPUT_TOKENS = 16_384;
const DEFAULT_MAX_INPUT_TOKENS = 200_000;

/**
 * Known Claude model capacities. Checked before the SDK call so that
 * proxies that don't implement `/v1/models/{id}` still get correct limits.
 */
const KNOWN_MODELS = new Map([
  ['claude-opus-4.6-1m', {maxOutputTokens: 64_000, maxInputTokens: 1_000_000}],
  ['claude-opus-4.6', {maxOutputTokens: 32_000, maxInputTokens: 200_000}],
  [
    'claude-opus-4.7-1m-internal',
    {maxOutputTokens: 64_000, maxInputTokens: 1_000_000},
  ],
  ['claude-opus-4.7', {maxOutputTokens: 32_000, maxInputTokens: 200_000}],
  ['claude-opus-4.7-high', {maxOutputTokens: 32_000, maxInputTokens: 200_000}],
  ['claude-opus-4.7-xhigh', {maxOutputTokens: 32_000, maxInputTokens: 200_000}],
  ['claude-sonnet-4.6', {maxOutputTokens: 32_000, maxInputTokens: 200_000}],
  ['claude-sonnet-4', {maxOutputTokens: 16_000, maxInputTokens: 216_000}],
  ['claude-sonnet-4.5', {maxOutputTokens: 32_000, maxInputTokens: 200_000}],
  ['claude-opus-4.5', {maxOutputTokens: 32_000, maxInputTokens: 200_000}],
  ['claude-haiku-4.5', {maxOutputTokens: 64_000, maxInputTokens: 200_000}],
]);

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

  // Check the static table first — works even when the proxy doesn't
  // support the Anthropic /v1/models/{id} endpoint.
  const known = KNOWN_MODELS.get(config.model);
  if (known) {
    cache.set(key, known);
    return known;
  }

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
  } catch (error) {
    // Proxy may not support /v1/models — fall back to safe defaults.
    // Do not cache the fallback so transient failures can self-heal on retry.
    logger.warn(
      {model: config.model, baseUrl: config.baseUrl, err: error},
      'Failed to retrieve model capacity, using defaults',
    );
    return {
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
      maxInputTokens: DEFAULT_MAX_INPUT_TOKENS,
    };
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
