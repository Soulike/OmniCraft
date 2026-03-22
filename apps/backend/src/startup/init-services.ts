import path from 'node:path';

import {getDataDir} from '@/helpers/env.js';
import {logger} from '@/logger.js';
import {AgentStore} from '@/models/agent-store/index.js';
import {LlmSessionStore} from '@/models/llm-session-store/index.js';
import {SettingsManager} from '@/models/settings-manager/index.js';

/** Initializes all services that require async setup before the server starts. */
export async function initServices(): Promise<void> {
  await initSettingsManager();
  AgentStore.create();
  LlmSessionStore.create();
}

/** Initializes the SettingsManager singleton. */
async function initSettingsManager(): Promise<void> {
  const settingsPath = path.join(getDataDir(), 'settings.json');
  const {warnings} = await SettingsManager.create(settingsPath);
  for (const warning of warnings) {
    logger.warn({warning}, 'Settings initialization warning');
  }
}
