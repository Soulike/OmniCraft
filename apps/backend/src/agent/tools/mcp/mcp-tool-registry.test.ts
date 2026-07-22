import assert from 'node:assert';

import {afterEach, describe, expect, it, vi} from 'vitest';

import {createMockContext} from '@/agent-core/tool/testing.js';
import type {McpClient, McpToolInfo} from '@/models/mcp-manager/index.js';
import {McpManager} from '@/models/mcp-manager/index.js';

import {McpToolRegistry} from './mcp-tool-registry.js';

const tool: McpToolInfo = {
  name: 'read',
  description: 'read a file',
  inputSchema: {type: 'object', properties: {path: {type: 'string'}}},
};
const client: McpClient = {
  listTools: () => Promise.resolve([tool]),
  callTool: () => Promise.resolve({text: 'hello', isError: false}),
  onToolsChanged: () => undefined,
  close: () => Promise.resolve(),
};

afterEach(async () => {
  await McpManager.resetInstanceForTesting();
});

async function connectedManager(): Promise<McpManager> {
  const mgr = McpManager.create(() => Promise.resolve(client));
  mgr.applyConfig({
    servers: [
      {name: 'fs', transport: {type: 'stdio', command: 'x', args: [], env: {}}},
    ],
    enabledByAgent: {chat: ['fs'], coding: []},
  });
  await vi.waitFor(() => {
    expect(mgr.list()[0]?.status).toBe('connected');
  });
  return mgr;
}

describe('McpToolRegistry', () => {
  it('namespaces discovered tools and exposes them for its agent kind', async () => {
    const mgr = await connectedManager();
    const registry = new McpToolRegistry('chat', mgr);
    const tools = registry.getAll();
    expect(tools.map((t) => t.name)).toEqual(['mcp__fs__read']);
    expect(tools[0]?.kind).toBe('mcp');
  });

  it('is empty for an agent kind the server is not enabled for', async () => {
    const mgr = await connectedManager();
    expect(new McpToolRegistry('coding', mgr).getAll()).toEqual([]);
  });

  it('proxies execute() to the manager and maps the result', async () => {
    const mgr = await connectedManager();
    const registry = new McpToolRegistry('chat', mgr);
    const mcpTool = registry.get('mcp__fs__read');
    assert(mcpTool?.kind === 'mcp');

    const result = await mcpTool.execute({path: '/x'}, createMockContext());

    expect(result.status).toBe('success');
    assert(result.status === 'success');
    expect(result.data).toEqual({
      server: 'fs',
      toolName: 'read',
      text: 'hello',
    });
  });

  it('maps an error result to a failure', async () => {
    const failingClient: McpClient = {
      ...client,
      callTool: () => Promise.resolve({text: 'boom', isError: true}),
    };
    const mgr = McpManager.create(() => Promise.resolve(failingClient));
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
    const registry = new McpToolRegistry('chat', mgr);
    const mcpTool = registry.get('mcp__fs__read');
    assert(mcpTool?.kind === 'mcp');

    const result = await mcpTool.execute({path: '/x'}, createMockContext());

    expect(result.status).toBe('failure');
    assert(result.status === 'failure');
    expect(result.data).toEqual({message: 'boom'});
  });

  it('get() returns a tool by its namespaced name', async () => {
    const mgr = await connectedManager();
    const registry = new McpToolRegistry('chat', mgr);
    expect(registry.get('mcp__fs__read')?.name).toBe('mcp__fs__read');
    expect(registry.get('mcp__fs__missing')).toBeUndefined();
  });

  it('getSystemPromptSection() describes connected servers with tools', async () => {
    const mgr = await connectedManager();
    const section = new McpToolRegistry('chat', mgr).getSystemPromptSection();
    expect(section).toContain('fs');
    expect(new McpToolRegistry('coding', mgr).getSystemPromptSection()).toBe(
      '',
    );
  });

  it('drops duplicate tool names from a single non-compliant server', async () => {
    const duplicateTool: McpToolInfo = {
      name: 'read',
      description: 'read a file, again',
      inputSchema: {type: 'object', properties: {}},
    };
    const otherTool: McpToolInfo = {
      name: 'write',
      description: 'write a file',
      inputSchema: {type: 'object', properties: {}},
    };
    const duplicatingClient: McpClient = {
      ...client,
      listTools: () => Promise.resolve([tool, duplicateTool, otherTool]),
    };
    const mgr = McpManager.create(() => Promise.resolve(duplicatingClient));
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

    const tools = new McpToolRegistry('chat', mgr).getAll();

    expect(tools.map((t) => t.name).sort()).toEqual([
      'mcp__fs__read',
      'mcp__fs__write',
    ]);
  });
});
