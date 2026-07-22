import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  type CallToolResult,
  CallToolResultSchema,
  ToolListChangedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type {McpServer} from '@omnicraft/settings-schema';

import type {McpClient, McpToolInfo} from './types.js';

/** The only module in this subsystem that touches the MCP SDK directly. */
export async function createMcpClient(server: McpServer): Promise<McpClient> {
  const client = new Client({name: 'omnicraft', version: '0.0.0'});
  const transport =
    server.transport.type === 'stdio'
      ? new StdioClientTransport({
          command: server.transport.command,
          args: server.transport.args,
          env: server.transport.env,
        })
      : new StreamableHTTPClientTransport(new URL(server.transport.url), {
          requestInit: {headers: server.transport.headers},
        });
  await client.connect(transport);

  return {
    async listTools(): Promise<McpToolInfo[]> {
      const {tools} = await client.listTools();
      return tools.map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description ?? '',
        inputSchema: tool.inputSchema,
      }));
    },
    callTool(name, args, signal): Promise<CallToolResult> {
      // Pinning CallToolResultSchema makes the SDK validate the response to
      // the CallToolResult shape at runtime; the SDK's static return type
      // still widens to the legacy {toolResult} compat union, which the pin
      // rules out — so we assert to CallToolResult and hand it back unchanged
      // (rendering content is a consumer concern).
      return client.callTool(
        {name, arguments: (args ?? {}) as Record<string, unknown>},
        CallToolResultSchema,
        {signal},
      ) as Promise<CallToolResult>;
    },
    onToolsChanged(callback): void {
      client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
        callback();
      });
    },
    async close(): Promise<void> {
      await client.close();
    },
  };
}
