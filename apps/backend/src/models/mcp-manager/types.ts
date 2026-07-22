import type {Client} from '@modelcontextprotocol/sdk/client/index.js';
import type {McpServer} from '@omnicraft/settings-schema';

/**
 * The subset of the MCP SDK `Client` the manager uses. Declared as a `Pick`
 * of the real client so `createMcpClient` can return the SDK client unchanged
 * while tests supply a fake implementing only these methods.
 */
export type McpClient = Pick<
  Client,
  'listTools' | 'callTool' | 'setNotificationHandler' | 'close'
>;

export type McpClientFactory = (server: McpServer) => Promise<McpClient>;

export type ServerStatus = 'connecting' | 'connected' | 'error' | 'disabled';

/** Shape returned by the status API (`GET /api/mcp/servers`). */
export interface McpServerStatus {
  readonly name: string;
  readonly transportType: 'stdio' | 'http';
  readonly status: ServerStatus;
  readonly tools: {readonly name: string; readonly description: string}[];
  readonly error?: string;
}
