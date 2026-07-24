import {
  AgentType,
  type McpServer,
  mcpServerSchema,
} from '@omnicraft/settings-schema';
import {z} from 'zod';

import {getSettingValue} from '@/api/settings/index.js';

export interface McpConfig {
  servers: McpServer[];
  enabledChat: string[];
  enabledCoding: string[];
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

/**
 * Writes the whole MCP config through the dedicated `/settings/mcp` endpoint.
 * The generic settings API only accepts scalar leaf values, so the array-valued
 * MCP section (servers + per-agent enablement) needs this endpoint.
 */
export async function putMcpConfig(config: McpConfig): Promise<void> {
  const res = await fetch('/api/settings/mcp', {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      mcp: {
        servers: config.servers,
        enabledByAgent: {
          [AgentType.CHAT]: config.enabledChat,
          [AgentType.CODING]: config.enabledCoding,
        },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to save MCP settings: ${res.status.toString()}`);
  }
}
