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
  model: z
    .string()
    .min(1)
    .describe('Model name to use')
    .default('claude-sonnet-4-20250514'),
  lightModel: z
    .string()
    .describe(
      'Model name for lightweight tasks (e.g. title generation). Falls back to the main model if empty.',
    )
    .default(''),
  thinkingLevel: thinkingLevelSchema
    .describe('Extended-thinking effort level for this agent')
    .default('none'),
});
