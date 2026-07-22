import path from 'node:path';

import {getDataDir, getVscodePort} from '@/helpers/env.js';
import {logger} from '@/logger.js';
import {CodingAgentStore, MainAgentStore} from '@/models/agent-store/index.js';
import {McpManager} from '@/models/mcp-manager/index.js';
import {SettingsManager} from '@/models/settings-manager/index.js';
import {VscodeServerManager} from '@/models/vscode-server-manager/index.js';

/** Initializes all services that require async setup before the server starts. */
export async function initServices(): Promise<void> {
  await initSettingsManager();
  await initMcpManager();
  initAgentStores();
  initVscodeServer();
}

/** Creates agent stores. */
function initAgentStores(): void {
  const dataDir = getDataDir();
  MainAgentStore.create(path.join(dataDir, 'sessions'));
  CodingAgentStore.create(path.join(dataDir, 'coding-sessions'));
}

/** Initializes the SettingsManager singleton. */
async function initSettingsManager(): Promise<void> {
  const settingsPath = path.join(getDataDir(), 'settings.json');
  const {warnings} = await SettingsManager.create(settingsPath);
  for (const warning of warnings) {
    logger.warn({warning}, 'Settings initialization warning');
  }
}

/**
 * Initializes the McpManager singleton and keeps it in sync with settings.
 * `onChange` only fires on future saves, so the current settings must also
 * be applied once here to reconcile the manager with the persisted config.
 */
async function initMcpManager(): Promise<void> {
  const manager = McpManager.create();
  const settings = SettingsManager.getInstance();
  settings.onChange((next) => {
    manager.applyConfig(next.mcp);
  });
  manager.applyConfig((await settings.getAll()).mcp);
}

/** Initializes and starts the VSCode web server. */
function initVscodeServer(): void {
  const manager = VscodeServerManager.create(getVscodePort());
  manager.start();
}
