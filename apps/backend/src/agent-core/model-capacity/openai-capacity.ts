import type {LlmConfig} from '../llm-api/types.js';

const DEFAULT_MAX_OUTPUT_TOKENS = 16_384;
const DEFAULT_MAX_INPUT_TOKENS = 128_000;

/**
 * Known model capacities from OpenAI-compatible providers (OpenAI, Gemini, etc.).
 * These values must be maintained manually since the OpenAI API does not expose
 * token limits programmatically.
 */
const KNOWN_MODELS = new Map([
  ['gpt-4o', {maxOutputTokens: 4_096, maxInputTokens: 128_000}],
  ['gpt-4.1', {maxOutputTokens: 16_384, maxInputTokens: 128_000}],
  ['gpt-5-mini', {maxOutputTokens: 64_000, maxInputTokens: 264_000}],
  ['gpt-5.1', {maxOutputTokens: 64_000, maxInputTokens: 264_000}],
  ['gpt-5.2', {maxOutputTokens: 128_000, maxInputTokens: 400_000}],
  ['gpt-5.2-codex', {maxOutputTokens: 128_000, maxInputTokens: 400_000}],
  ['gpt-5.3-codex', {maxOutputTokens: 128_000, maxInputTokens: 400_000}],
  ['gpt-5.4-mini', {maxOutputTokens: 128_000, maxInputTokens: 400_000}],
  ['gpt-5.4', {maxOutputTokens: 128_000, maxInputTokens: 400_000}],
  ['gemini-2.5-pro', {maxOutputTokens: 64_000, maxInputTokens: 128_000}],
  [
    'gemini-3-flash-preview',
    {maxOutputTokens: 64_000, maxInputTokens: 128_000},
  ],
  [
    'gemini-3.1-pro-preview',
    {maxOutputTokens: 64_000, maxInputTokens: 200_000},
  ],
]);

/** Returns the max output tokens for an OpenAI-compatible model. */
export function getOpenAIMaxOutputTokens(config: Readonly<LlmConfig>): number {
  return (
    KNOWN_MODELS.get(config.model)?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS
  );
}

/** Returns the max input tokens (context window) for an OpenAI-compatible model. */
export function getOpenAIMaxInputTokens(config: Readonly<LlmConfig>): number {
  return (
    KNOWN_MODELS.get(config.model)?.maxInputTokens ?? DEFAULT_MAX_INPUT_TOKENS
  );
}
