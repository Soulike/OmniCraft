import path from 'node:path';

import {CoreSkillRegistry} from '@/agent/skills/index.js';
import {
  BashToolRegistry,
  ClientToolRegistry,
  CoreToolRegistry,
  FileToolRegistry,
  SubAgentToolRegistry,
  WebToolRegistry,
} from '@/agent/tools/index.js';
import {getDataDir, getVscodePort} from '@/helpers/env.js';
import {logger} from '@/logger.js';
import {CodingAgentStore, MainAgentStore} from '@/models/agent-store/index.js';
import {SettingsManager} from '@/models/settings-manager/index.js';
import {VscodeServerManager} from '@/models/vscode-server-manager/index.js';

/** Initializes all services that require async setup before the server starts. */
export async function initServices(): Promise<void> {
  await initSettingsManager();
  const sessionsDir = path.join(getDataDir(), 'sessions');
  MainAgentStore.create(sessionsDir);
  const codingSessionsDir = path.join(getDataDir(), 'coding-sessions');
  CodingAgentStore.create(codingSessionsDir);
  initToolRegistries();
  initSkillRegistries();
  initVscodeServer();
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
  FileToolRegistry.create();
  WebToolRegistry.create();
  BashToolRegistry.create();
  SubAgentToolRegistry.create();
  ClientToolRegistry.create();
}

/** Initializes skill registries and loads skill files. */
function initSkillRegistries(): void {
  CoreSkillRegistry.create();
  // No skill files to load yet — framework only.
}

/** Initializes and starts the VSCode web server. */
function initVscodeServer(): void {
  const manager = VscodeServerManager.create(getVscodePort());
  manager.start();
}
