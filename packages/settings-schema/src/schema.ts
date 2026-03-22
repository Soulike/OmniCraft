import {z} from 'zod';

import {llmSettingsSchema} from './llm/schema.js';

export const settingsSchema = z.object({
  llm: llmSettingsSchema.prefault({}),
});

export type Settings = z.infer<typeof settingsSchema>;
