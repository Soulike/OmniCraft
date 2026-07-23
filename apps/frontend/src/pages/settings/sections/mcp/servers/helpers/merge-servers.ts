import type {McpServerStatusResponse} from '@omnicraft/api-schema';
import type {McpTransport} from '@omnicraft/settings-schema';

import type {McpConfig} from '@/api/settings/mcp/index.js';

export type McpDisplayStatus =
  | 'connecting'
  | 'connected'
  | 'error'
  | 'not-enabled'
  | 'unknown';

export interface McpServerRow {
  name: string;
  transport: McpTransport;
  enabledChat: boolean;
  enabledCoding: boolean;
  status: McpDisplayStatus;
  tools: {name: string; description: string}[];
  error?: string;
}

/**
 * Joins settings config with live status by server name. Config drives the row
 * set and order. `statuses === null` means the status endpoint is unavailable —
 * an enabled server then shows `unknown` rather than a false `not-enabled`.
 */
export function mergeServers(
  config: McpConfig,
  statuses: McpServerStatusResponse[] | null,
): McpServerRow[] {
  const statusByName = new Map(
    (statuses ?? []).map((status) => [status.name, status] as const),
  );

  return config.servers.map((server) => {
    const enabledChat = config.enabledChat.includes(server.name);
    const enabledCoding = config.enabledCoding.includes(server.name);
    const enabled = enabledChat || enabledCoding;
    const live = statusByName.get(server.name);

    const status: McpDisplayStatus = live
      ? live.status
      : enabled
        ? 'unknown'
        : 'not-enabled';

    return {
      name: server.name,
      transport: server.transport,
      enabledChat,
      enabledCoding,
      status,
      tools: live?.tools ?? [],
      error: live?.error,
    };
  });
}
