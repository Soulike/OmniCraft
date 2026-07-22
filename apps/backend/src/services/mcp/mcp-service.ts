import type {McpServerStatus} from '@/models/mcp-manager/index.js';
import {McpManager} from '@/models/mcp-manager/index.js';

/** Service layer for MCP server operations. */
export const mcpService = {
  /** Returns connection status and discovered tools for each configured server. */
  listServers(): McpServerStatus[] {
    return McpManager.getInstance().list();
  },

  /**
   * Forces a reconnect of the named server.
   * @param name - The configured server name.
   * @returns `true` if the server exists (reconnect started), `false` if unknown.
   */
  async reconnectServer(name: string): Promise<boolean> {
    return McpManager.getInstance().reconnect(name);
  },
};
