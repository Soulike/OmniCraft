import type {LlmConfig} from '../llm-api/types.js';

const DEFAULT_MAX_OUTPUT_TOKENS = 16_384;
const DEFAULT_MAX_PROMPT_TOKENS = 128_000;
const DEFAULT_MAX_CONTEXT_WINDOW_TOKENS = 128_000;

interface KnownCapacity {
  maxContextWindowTokens: number;
  maxPromptTokens: number;
  maxOutputTokens: number;
}

/**
 * Known model capacities from OpenAI-compatible providers (OpenAI, Gemini, etc.).
 * These values must be maintained manually since the OpenAI API does not expose
 * token limits programmatically.
 *
 * Field names mirror the Copilot `/v1/models` capability shape:
 * - maxContextWindowTokens: total budget (prompt + output)
 * - maxPromptTokens: max accepted input
 * - maxOutputTokens: max generation
 */
const KNOWN_MODELS = new Map<string, KnownCapacity>([
  [
    'gpt-5-mini',
    {
      maxContextWindowTokens: 264_000,
      maxPromptTokens: 128_000,
      maxOutputTokens: 64_000,
    },
  ],
  [
    'gpt-5.3-codex',
    {
      maxContextWindowTokens: 400_000,
      maxPromptTokens: 272_000,
      maxOutputTokens: 128_000,
    },
  ],
  [
    'gpt-5.4-mini',
    {
      maxContextWindowTokens: 400_000,
      maxPromptTokens: 272_000,
      maxOutputTokens: 128_000,
    },
  ],
  [
    'gpt-5.4',
    {
      maxContextWindowTokens: 1_050_000,
      maxPromptTokens: 922_000,
      maxOutputTokens: 128_000,
    },
  ],
  [
    'gpt-5.5',
    {
      maxContextWindowTokens: 1_050_000,
      maxPromptTokens: 922_000,
      maxOutputTokens: 128_000,
    },
  ],
  [
    'mai-code-1-flash-internal',
    {
      maxContextWindowTokens: 256_000,
      maxPromptTokens: 128_000,
      maxOutputTokens: 128_000,
    },
  ],
  [
    'gemini-2.5-pro',
    {
      maxContextWindowTokens: 128_000,
      maxPromptTokens: 128_000,
      maxOutputTokens: 64_000,
    },
  ],
  [
    'gemini-3-flash-preview',
    {
      maxContextWindowTokens: 128_000,
      maxPromptTokens: 128_000,
      maxOutputTokens: 64_000,
    },
  ],
  [
    'gemini-3.5-flash',
    {
      maxContextWindowTokens: 1_000_000,
      maxPromptTokens: 936_000,
      maxOutputTokens: 64_000,
    },
  ],
  [
    'gemini-3.1-pro-preview',
    {
      maxContextWindowTokens: 1_000_000,
      maxPromptTokens: 936_000,
      maxOutputTokens: 64_000,
    },
  ],
]);

/** Returns the max output tokens for an OpenAI-compatible model. */
export function getOpenAIMaxOutputTokens(config: Readonly<LlmConfig>): number {
  return (
    KNOWN_MODELS.get(config.model)?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS
  );
}

/** Returns the max prompt tokens (input budget, excluding output) for an OpenAI-compatible model. */
export function getOpenAIMaxPromptTokens(config: Readonly<LlmConfig>): number {
  return (
    KNOWN_MODELS.get(config.model)?.maxPromptTokens ?? DEFAULT_MAX_PROMPT_TOKENS
  );
}

/** Returns the max context window tokens (prompt + output) for an OpenAI-compatible model. */
export function getOpenAIMaxContextWindowTokens(
  config: Readonly<LlmConfig>,
): number {
  return (
    KNOWN_MODELS.get(config.model)?.maxContextWindowTokens ??
    DEFAULT_MAX_CONTEXT_WINDOW_TOKENS
  );
}
