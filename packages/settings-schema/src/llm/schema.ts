import {z} from 'zod';

export const llmSettingsSchema = z.object({
  apiFormat: z
    .enum(['claude', 'openai'])
    .describe('API protocol format')
    .default('claude'),
  apiKey: z.string().describe('API key for the LLM service').default(''),
  baseUrl: z
    .url()
    .describe('Base URL of the LLM API')
    .default('https://api.anthropic.com'),
  model: z.string().describe('Model name to use').default(''),
});
