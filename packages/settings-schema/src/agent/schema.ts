import {z} from 'zod';

export const agentSettingsSchema = z.object({
  maxToolRounds: z
    .number()
    .int()
    .min(1)
    .describe('Maximum tool call rounds per user message')
    .default(20),
});
