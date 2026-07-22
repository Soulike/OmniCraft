import {getMcpServersResponseSchema} from '@omnicraft/api-schema';
import type {McpServer} from '@omnicraft/settings-schema';
import {afterEach, describe, expect, it, vi} from 'vitest';

import type {McpClient, McpToolInfo} from '@/models/mcp-manager/index.js';
import {McpManager} from '@/models/mcp-manager/index.js';
import {mcpService} from '@/services/mcp/index.js';

function fakeClient(tools: McpToolInfo[]): McpClient {
  return {
    listTools: () => Promise.resolve(tools),
    callTool: (name) =>
      Promise.resolve({text: `called ${name}`, isError: false}),
    onToolsChanged: () => undefined,
    close: () => Promise.resolve(),
  };
}

const tool: McpToolInfo = {
  name: 'read',
  description: 'r',
  inputSchema: {type: 'object'},
};

const stdioServer: McpServer = {
  name: 'fs',
  transport: {type: 'stdio', command: 'x', args: [], env: {}},
};

afterEach(async () => {
  await McpManager.resetInstanceForTesting();
});

// The repo has no dispatcher HTTP-test harness (only helper tests), so these
// exercise the service the router delegates to (`mcpService`) and validate the
// data against the response schema the router promises, rather than standing up
// a Koa server.
describe('GET /mcp/servers contract', () => {
  it('produces a list() snapshot that round-trips getMcpServersResponseSchema', async () => {
    const mgr = McpManager.create(() => Promise.resolve(fakeClient([tool])));
    mgr.applyConfig({
      servers: [stdioServer],
      enabledByAgent: {chat: ['fs'], coding: []},
    });
    await vi.waitFor(() => {
      expect(mgr.list()[0]?.status).toBe('connected');
    });

    const body = {servers: mcpService.listServers()};
    expect(body).toEqual({
      servers: [
        {
          name: 'fs',
          transportType: 'stdio',
          status: 'connected',
          tools: [{name: 'read', description: 'r'}],
        },
      ],
    });
    expect(() => getMcpServersResponseSchema.parse(body)).not.toThrow();
  });

  it('round-trips an errored server through the response schema', async () => {
    const mgr = McpManager.create(() => Promise.reject(new Error('nope')));
    mgr.applyConfig({
      servers: [stdioServer],
      enabledByAgent: {chat: ['fs'], coding: []},
    });
    await vi.waitFor(() => {
      expect(mgr.list()[0]?.status).toBe('error');
    });

    const body = {servers: mcpService.listServers()};
    expect(() => getMcpServersResponseSchema.parse(body)).not.toThrow();
    expect(body.servers[0]?.error).toContain('nope');
  });
});

describe('POST /mcp/servers/:name/reconnect contract', () => {
  it('tears down and reconnects the named server, reporting success', async () => {
    const createClient = vi.fn(() => Promise.resolve(fakeClient([tool])));
    const mgr = McpManager.create(createClient);
    mgr.applyConfig({
      servers: [stdioServer],
      enabledByAgent: {chat: ['fs'], coding: []},
    });
    await vi.waitFor(() => {
      expect(mgr.list()[0]?.status).toBe('connected');
    });

    createClient.mockClear();
    const reconnected = await mcpService.reconnectServer('fs');

    expect(reconnected).toBe(true);
    expect(createClient).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(mgr.list()[0]?.status).toBe('connected');
    });
  });

  it('reports false for an unknown server (router maps this to 404)', async () => {
    McpManager.create(() => Promise.resolve(fakeClient([tool])));
    expect(await mcpService.reconnectServer('absent')).toBe(false);
  });
});
