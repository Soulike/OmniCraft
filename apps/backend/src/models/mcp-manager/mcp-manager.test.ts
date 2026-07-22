import {afterEach, describe, expect, it, vi} from 'vitest';

import {McpManager} from './mcp-manager.js';
import type {McpClient, McpToolInfo} from './types.js';

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

afterEach(async () => {
  await McpManager.resetInstanceForTesting();
});

describe('McpManager', () => {
  it('connects enabled servers and exposes their tools per agent kind', async () => {
    const mgr = McpManager.create(() => Promise.resolve(fakeClient([tool])));
    mgr.applyConfig({
      servers: [
        {
          name: 'fs',
          transport: {type: 'stdio', command: 'x', args: [], env: {}},
        },
      ],
      enabledByAgent: {chat: ['fs'], coding: []},
    });
    await vi.waitFor(() => {
      expect(mgr.list()[0]?.status).toBe('connected');
    });

    expect(mgr.getToolsForAgent('chat')).toEqual([
      {server: 'fs', tools: [tool]},
    ]);
    expect(mgr.getToolsForAgent('coding')).toEqual([]);
  });

  it('disconnects a server removed from config', async () => {
    const mgr = McpManager.create(() => Promise.resolve(fakeClient([tool])));
    mgr.applyConfig({
      servers: [
        {
          name: 'fs',
          transport: {type: 'stdio', command: 'x', args: [], env: {}},
        },
      ],
      enabledByAgent: {chat: ['fs'], coding: []},
    });
    await vi.waitFor(() => {
      expect(mgr.list()).toHaveLength(1);
    });

    mgr.applyConfig({servers: [], enabledByAgent: {chat: [], coding: []}});
    expect(mgr.list()).toHaveLength(0);
  });

  it('marks a server errored when connection throws, without throwing', async () => {
    const mgr = McpManager.create(() => Promise.reject(new Error('nope')));
    mgr.applyConfig({
      servers: [
        {
          name: 'fs',
          transport: {type: 'stdio', command: 'x', args: [], env: {}},
        },
      ],
      enabledByAgent: {chat: ['fs'], coding: []},
    });
    await vi.waitFor(() => {
      expect(mgr.list()[0]?.status).toBe('error');
    });
    expect(mgr.list()[0]?.error).toContain('nope');
  });

  it('returns an error result when calling a tool on a disconnected server', async () => {
    const mgr = McpManager.create(() => Promise.resolve(fakeClient([tool])));
    const result = await mgr.callTool(
      'absent',
      'read',
      {},
      new AbortController().signal,
    );
    expect(result.isError).toBe(true);
  });
});
