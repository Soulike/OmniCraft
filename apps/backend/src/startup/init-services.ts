import path from 'node:path';

import {CoreSkillRegistry} from '@/agent/skills/index.js';
import {CoreToolRegistry} from '@/agent/tools/index.js';
import {AgentStore} from '@/agent-core/agent-store/index.js';
import {LlmSessionStore} from '@/agent-core/llm-session-store/index.js';
import {getDataDir} from '@/helpers/env.js';
import {logger} from '@/logger.js';
import {SettingsManager} from '@/models/settings-manager/index.js';

/** Initializes all services that require async setup before the server starts. */
export async function initServices(): Promise<void> {
  await initSettingsManager();
  AgentStore.create();
  LlmSessionStore.create();
  initToolRegistries();
  initSkillRegistries();
}

/** Initializes the SettingsManager singleton. */
async function initSettingsManager(): Promise<void> {
  const settingsPath = path.join(getDataDir(), 'settings.json');
  const {warnings} = await SettingsManager.create(settingsPath);
  for (const warning of warnings) {
    logger.warn({warning}, 'Settings initialization warning');
  }
}

/** Initializes tool registries. */
function initToolRegistries(): void {
  CoreToolRegistry.create();
}

/** Initializes skill registries and loads skill files. */
function initSkillRegistries(): void {
  CoreSkillRegistry.create();
  // No skill files to load yet — framework only.
}
