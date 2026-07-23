import {
  getMcpServersResponseSchema,
  type McpServerStatusResponse,
} from '@omnicraft/api-schema';

const BASE = '/api/mcp';

/** Fetches per-server connection status and discovered tools. */
export async function getMcpServers(): Promise<McpServerStatusResponse[]> {
  const res = await fetch(`${BASE}/servers`);
  if (!res.ok) {
    throw new Error(`Failed to fetch MCP servers: ${res.status.toString()}`);
  }
  const json: unknown = await res.json();
  return getMcpServersResponseSchema.parse(json).servers;
}

/** Forces a reconnect of the named server. Rejects if the server is unknown. */
export async function reconnectMcpServer(name: string): Promise<void> {
  const res = await fetch(
    `${BASE}/servers/${encodeURIComponent(name)}/reconnect`,
    {method: 'POST'},
  );
  if (!res.ok) {
    throw new Error(
      `Failed to reconnect MCP server ${name}: ${res.status.toString()}`,
    );
  }
}
