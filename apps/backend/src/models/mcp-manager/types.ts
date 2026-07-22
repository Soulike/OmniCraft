import type {Client} from '@modelcontextprotocol/sdk/client/index.js';
import type {McpServerStatusResponse} from '@omnicraft/api-schema';
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

/**
 * Connection lifecycle status. The source of truth is the API response schema
 * (`mcpServerStatusSchema` in `@omnicraft/api-schema`), which this mirrors.
 */
export type ServerStatus = McpServerStatusResponse['status'];
