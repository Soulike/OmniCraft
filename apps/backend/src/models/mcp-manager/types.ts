import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import type {McpServer} from '@omnicraft/settings-schema';

export interface McpToolInfo {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

export type ServerStatus = 'connecting' | 'connected' | 'error' | 'disabled';

export interface McpServerStatus {
  readonly name: string;
  readonly transportType: 'stdio' | 'http';
  readonly status: ServerStatus;
  readonly tools: {readonly name: string; readonly description: string}[];
  readonly error?: string;
}

/** Transport-agnostic handle over one connected MCP server. */
export interface McpClient {
  listTools(): Promise<McpToolInfo[]>;
  /** Invokes a tool and returns the MCP SDK's result unchanged. */
  callTool(
    name: string,
    args: unknown,
    signal: AbortSignal,
  ): Promise<CallToolResult>;
  onToolsChanged(callback: () => void): void;
  close(): Promise<void>;
}

export type McpClientFactory = (server: McpServer) => Promise<McpClient>;
