import Anthropic from '@anthropic-ai/sdk';

import {logger} from '@/logger.js';

import type {LlmConfig} from '../llm-api/types.js';

const DEFAULT_MAX_OUTPUT_TOKENS = 16_384;
const DEFAULT_MAX_PROMPT_TOKENS = 168_000;
const DEFAULT_MAX_CONTEXT_WINDOW_TOKENS = 200_000;

/**
 * Known Claude model capacities. Checked before the SDK call so that
 * proxies that don't implement `/v1/models/{id}` still get correct limits.
 *
 * Field names mirror the Copilot `/v1/models` capability shape:
 * - maxContextWindowTokens: total budget (prompt + output)
 * - maxPromptTokens: max accepted input
 * - maxOutputTokens: max generation
 */
const KNOWN_MODELS = new Map<string, CachedCapacity>([
  [
    'claude-opus-4.8',
    {
      maxContextWindowTokens: 1_000_000,
      maxPromptTokens: 936_000,
      maxOutputTokens: 64_000,
    },
  ],
  [
    'claude-opus-4.7',
    {
      maxContextWindowTokens: 1_000_000,
      maxPromptTokens: 936_000,
      maxOutputTokens: 64_000,
    },
  ],
  [
    'claude-opus-4.6',
    {
      maxContextWindowTokens: 1_000_000,
      maxPromptTokens: 936_000,
      maxOutputTokens: 64_000,
    },
  ],
  [
    'claude-opus-4.5',
    {
      maxContextWindowTokens: 200_000,
      maxPromptTokens: 168_000,
      maxOutputTokens: 32_000,
    },
  ],
  [
    'claude-sonnet-4.6',
    {
      maxContextWindowTokens: 1_000_000,
      maxPromptTokens: 936_000,
      maxOutputTokens: 64_000,
    },
  ],
  [
    'claude-sonnet-4.5',
    {
      maxContextWindowTokens: 200_000,
      maxPromptTokens: 168_000,
      maxOutputTokens: 32_000,
    },
  ],
  [
    'claude-haiku-4.5',
    {
      maxContextWindowTokens: 200_000,
      maxPromptTokens: 136_000,
      maxOutputTokens: 64_000,
    },
  ],
]);

interface CachedCapacity {
  maxContextWindowTokens: number;
  maxPromptTokens: number;
  maxOutputTokens: number;
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
    // The Anthropic SDK exposes `max_tokens` (output) and `max_input_tokens`
    // (prompt budget). Context window is derived: prompt + output.
    const maxOutputTokens = model.max_tokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
    const maxPromptTokens = model.max_input_tokens ?? DEFAULT_MAX_PROMPT_TOKENS;
    const capacity: CachedCapacity = {
      maxContextWindowTokens: maxPromptTokens + maxOutputTokens,
      maxPromptTokens,
      maxOutputTokens,
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
      maxContextWindowTokens: DEFAULT_MAX_CONTEXT_WINDOW_TOKENS,
      maxPromptTokens: DEFAULT_MAX_PROMPT_TOKENS,
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
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

/** Returns the max prompt tokens (input budget, excluding output) for a Claude model. */
export async function getClaudeMaxPromptTokens(
  config: Readonly<LlmConfig>,
): Promise<number> {
  const capacity = await resolve(config);
  return capacity.maxPromptTokens;
}

/** Returns the max context window tokens (prompt + output) for a Claude model. */
export async function getClaudeMaxContextWindowTokens(
  config: Readonly<LlmConfig>,
): Promise<number> {
  const capacity = await resolve(config);
  return capacity.maxContextWindowTokens;
}
