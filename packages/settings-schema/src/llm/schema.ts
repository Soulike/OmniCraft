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

/** Model capability tiers, ordered from cheapest/lowest to most capable. */
export const MODEL_TIER_LADDER = [
  'lightweight',
  'versatile',
  'powerful',
] as const;

export const modelTierSchema = z.enum(MODEL_TIER_LADDER);

export type ModelTier = (typeof MODEL_TIER_LADDER)[number];

/** A single tier's model config. Blank `model` inherits the default tier. */
export const tierModelSettingsSchema = baseModelSettingsSchema
  .extend({
    model: z
      .string()
      .describe(
        'Model name for this tier. Leave empty to inherit the default tier.',
      )
      .default(''),
  })
  .refine((config) => config.maxContextTokens > config.maxOutputTokens, {
    error: OUTPUT_EXCEEDS_CONTEXT_MESSAGE,
    path: ['maxOutputTokens'],
  });

export const llmSettingsSchema = z
  .object({
    apiFormat: z
      .enum(['claude', 'openai-responses'])
      .describe('API protocol format')
      .default('claude'),
    apiKey: z.string().describe('API key for the LLM service').default(''),
    baseUrl: z
      .url()
      .describe('Base URL of the LLM API')
      .default('https://api.anthropic.com'),
    defaultTier: modelTierSchema
      .describe('Tier the agent runs on; also the fallback for blank tiers')
      .default('powerful'),
    powerful: tierModelSettingsSchema.prefault({
      model: 'claude-sonnet-4-20250514',
    }),
    versatile: tierModelSettingsSchema.prefault({}),
    lightweight: tierModelSettingsSchema.prefault({}),
  })
  .check((ctx) => {
    const settings = ctx.value;
    if (settings[settings.defaultTier].model.trim().length === 0) {
      ctx.issues.push({
        code: 'custom',
        message: 'The default tier must have a model',
        path: [settings.defaultTier, 'model'],
        input: settings,
      });
    }
  });

export type LlmSettings = z.infer<typeof llmSettingsSchema>;
