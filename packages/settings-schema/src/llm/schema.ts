import {z} from 'zod';

/** Thinking/reasoning level for models that support extended thinking. */
export const thinkingLevelSchema = z.enum([
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

export type ThinkingLevel = z.infer<typeof thinkingLevelSchema>;

/** Fields shared by every model config; the `model` field is added per variant. */
const baseModelSettingsSchema = z.object({
  thinkingLevel: thinkingLevelSchema
    .describe('Extended-thinking effort level for this model')
    .default('none'),
  maxContextTokens: z
    .number()
    .int()
    .min(1)
    .describe('Full context window of the model, in tokens (prompt + output)')
    .default(200_000),
  maxOutputTokens: z
    .number()
    .int()
    .min(1)
    .describe('Maximum output tokens the model may generate per response')
    .default(32_000),
});

/** Error shown when a model reserves more output than its context allows. */
const OUTPUT_EXCEEDS_CONTEXT_MESSAGE =
  'Max output tokens must be less than max context tokens';

/** Main model: a name is required. */
export const mainModelSettingsSchema = baseModelSettingsSchema
  .extend({
    model: z
      .string()
      .min(1)
      .describe('Model name to use')
      .default('claude-sonnet-4-20250514'),
  })
  .refine((config) => config.maxContextTokens > config.maxOutputTokens, {
    error: OUTPUT_EXCEEDS_CONTEXT_MESSAGE,
    path: ['maxOutputTokens'],
  });

/** Light model: name may be empty (falls back to the main model). */
export const lightModelSettingsSchema = baseModelSettingsSchema
  .extend({
    model: z
      .string()
      .describe(
        'Model name for lightweight tasks (e.g. title generation). Falls back to the main model if empty.',
      )
      .default(''),
  })
  .refine((config) => config.maxContextTokens > config.maxOutputTokens, {
    error: OUTPUT_EXCEEDS_CONTEXT_MESSAGE,
    path: ['maxOutputTokens'],
  });

export const llmSettingsSchema = z.object({
  apiFormat: z
    .enum(['claude', 'openai-responses'])
    .describe('API protocol format')
    .default('claude'),
  apiKey: z.string().describe('API key for the LLM service').default(''),
  baseUrl: z
    .url()
    .describe('Base URL of the LLM API')
    .default('https://api.anthropic.com'),
  main: mainModelSettingsSchema.prefault({}),
  light: lightModelSettingsSchema.prefault({}),
});
