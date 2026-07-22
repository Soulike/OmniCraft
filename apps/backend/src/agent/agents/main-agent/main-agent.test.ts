import {AgentType} from '@omnicraft/settings-schema';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {getMcpToolRegistry} from '@/agent/tools/mcp/index.js';
import {McpManager} from '@/models/mcp-manager/index.js';

afterEach(async () => {
  await McpManager.resetInstanceForTesting();
});

describe('MCP wiring', () => {
  it('exposes connected MCP tools to the chat registry singleton', async () => {
    const mgr = McpManager.create(() =>
      Promise.resolve({
        listTools: () =>
          Promise.resolve([
            {name: 'ping', description: 'p', inputSchema: {type: 'object'}},
          ]),
        callTool: () => Promise.resolve({text: 'pong', isError: false}),
        onToolsChanged: () => undefined,
        close: () => Promise.resolve(),
      }),
    );
    mgr.applyConfig({
      servers: [
        {
          name: 'demo',
          transport: {type: 'stdio', command: 'x', args: [], env: {}},
        },
      ],
      enabledByAgent: {chat: ['demo'], coding: []},
    });
    await vi.waitFor(() => {
      expect(mgr.list()[0]?.status).toBe('connected');
    });

    const names = getMcpToolRegistry(AgentType.CHAT)
      .getAll()
      .map((t) => t.name);
    expect(names).toContain('mcp__demo__ping');
  });
});
