import {z} from 'zod';

export const searchSettingsSchema = z.object({
  tavilyApiKey: z
    .string()
    .describe('API key for Tavily search service')
    .default(''),
});
