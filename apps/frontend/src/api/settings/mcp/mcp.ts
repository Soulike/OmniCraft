import {type McpServer, mcpServerSchema} from '@omnicraft/settings-schema';
import {z} from 'zod';

import {getSettingValue, putSettingValues} from '@/api/settings/index.js';

export interface McpConfig {
  servers: McpServer[];
  enabledChat: string[];
  enabledCoding: string[];
}

export interface McpConfigUpdate {
  servers?: McpServer[];
  enabledChat?: string[];
  enabledCoding?: string[];
}

const SERVERS_PATH = 'mcp/servers';
const CHAT_PATH = 'mcp/enabledByAgent/chat';
const CODING_PATH = 'mcp/enabledByAgent/coding';

const serversSchema = z.array(mcpServerSchema);
const namesSchema = z.array(z.string());

/** Reads the three MCP settings leaves and returns the parsed config. */
export async function getMcpConfig(): Promise<McpConfig> {
  const [servers, enabledChat, enabledCoding] = await Promise.all([
    getSettingValue(SERVERS_PATH),
    getSettingValue(CHAT_PATH),
    getSettingValue(CODING_PATH),
  ]);
  return {
    servers: serversSchema.parse(servers),
    enabledChat: namesSchema.parse(enabledChat),
    enabledCoding: namesSchema.parse(enabledCoding),
  };
}

/** Atomically writes whichever MCP leaves are present in `update`. */
export async function putMcpConfig(update: McpConfigUpdate): Promise<void> {
  const entries: {path: string; value: unknown}[] = [];
  if (update.servers !== undefined) {
    entries.push({path: SERVERS_PATH, value: update.servers});
  }
  if (update.enabledChat !== undefined) {
    entries.push({path: CHAT_PATH, value: update.enabledChat});
  }
  if (update.enabledCoding !== undefined) {
    entries.push({path: CODING_PATH, value: update.enabledCoding});
  }
  if (entries.length === 0) {
    return;
  }
  await putSettingValues(entries);
}
