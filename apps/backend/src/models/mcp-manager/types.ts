import type {McpServer} from '@omnicraft/settings-schema';

export interface McpToolInfo {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

export interface McpCallResult {
  readonly text: string;
  readonly isError: boolean;
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
  callTool(
    name: string,
    args: unknown,
    signal: AbortSignal,
  ): Promise<McpCallResult>;
  onToolsChanged(callback: () => void): void;
  close(): Promise<void>;
}

export type McpClientFactory = (server: McpServer) => Promise<McpClient>;
