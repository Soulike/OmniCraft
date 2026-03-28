import {z} from 'zod';

import {agentSettingsSchema} from './agent/schema.js';
import {llmSettingsSchema} from './llm/schema.js';

export const settingsSchema = z.object({
  llm: llmSettingsSchema.prefault({}),
  agent: agentSettingsSchema.prefault({}),
});

export type Settings = z.infer<typeof settingsSchema>;
