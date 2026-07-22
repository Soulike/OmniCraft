import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type {McpServer} from '@omnicraft/settings-schema';

import type {McpClient} from './types.js';

/**
 * Connects to an MCP server and returns the SDK client unchanged. This is the
 * only module that constructs the MCP SDK; the manager drives the client
 * directly through the {@link McpClient} view.
 */
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
  return client;
}
