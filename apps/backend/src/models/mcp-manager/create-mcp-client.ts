import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {ToolListChangedNotificationSchema} from '@modelcontextprotocol/sdk/types.js';
import type {McpServer} from '@omnicraft/settings-schema';

import type {McpCallResult, McpClient, McpToolInfo} from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * `Array.isArray` is typed as `(arg: any) => arg is any[]` in lib.es5, so
 * narrowing through it directly on an `unknown` value leaks `any`. This
 * wrapper re-declares the guard against `unknown` so callers keep an
 * `unknown[]`.
 */
function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** Renders one MCP tool-result content block as display text. */
function textOfContentBlock(block: unknown): string {
  if (!isRecord(block) || typeof block.type !== 'string') {
    return '[unknown content]';
  }
  if (block.type === 'text' && typeof block.text === 'string') {
    return block.text;
  }
  return `[${block.type} content]`;
}

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
      return tools.map((t) => ({
        name: t.name,
        title: t.title,
        description: t.description ?? '',
        inputSchema: t.inputSchema,
      }));
    },
    async callTool(name, args, signal): Promise<McpCallResult> {
      const result: unknown = await client.callTool(
        {name, arguments: (args ?? {}) as Record<string, unknown>},
        undefined,
        {signal},
      );
      const content =
        isRecord(result) && isUnknownArray(result.content)
          ? result.content
          : [];
      const text = content.map(textOfContentBlock).join('\n');
      const isError = isRecord(result) && result.isError === true;
      return {text, isError};
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
