import {z} from 'zod';

import {agentSettingsSchema} from './agent/schema.js';
import {fileAccessSettingsSchema} from './file-access/schema.js';
import {llmSettingsSchema} from './llm/schema.js';
import {searchSettingsSchema} from './search/schema.js';

export const settingsSchema = z.object({
  llm: llmSettingsSchema.prefault({}),
  agent: agentSettingsSchema.prefault({}),
  search: searchSettingsSchema.prefault({}),
  fileAccess: fileAccessSettingsSchema.prefault({}),
});

export type Settings = z.infer<typeof settingsSchema>;
