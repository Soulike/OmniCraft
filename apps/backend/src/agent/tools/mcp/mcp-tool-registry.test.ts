import assert from 'node:assert';

import type {Tool} from '@modelcontextprotocol/sdk/types.js';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {createMockContext} from '@/agent-core/tool/testing.js';
import type {McpClient} from '@/models/mcp-manager/index.js';
import {McpManager} from '@/models/mcp-manager/index.js';

import {McpToolRegistry} from './mcp-tool-registry.js';

const tool: Tool = {
  name: 'read',
  description: 'read a file',
  inputSchema: {type: 'object', properties: {path: {type: 'string'}}},
};
const client: McpClient = {
  listTools: () => Promise.resolve({tools: [tool]}),
  callTool: () =>
    Promise.resolve({content: [{type: 'text', text: 'hello'}], isError: false}),
  setNotificationHandler: () => undefined,
  close: () => Promise.resolve(),
};

afterEach(() => {
  McpManager.resetInstanceForTesting();
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
      callTool: () =>
        Promise.resolve({
          content: [{type: 'text', text: 'boom'}],
          isError: true,
        }),
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

  it('renders media content blocks as placeholders, not raw bytes', async () => {
    const mediaClient: McpClient = {
      ...client,
      callTool: () =>
        Promise.resolve({
          content: [
            {type: 'text', text: 'summary'},
            {type: 'image', data: 'BASE64DATA', mimeType: 'image/png'},
          ],
          isError: false,
        }),
    };
    const mgr = McpManager.create(() => Promise.resolve(mediaClient));
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
    const mcpTool = new McpToolRegistry('chat', mgr).get('mcp__fs__read');
    assert(mcpTool?.kind === 'mcp');

    const result = await mcpTool.execute({path: '/x'}, createMockContext());

    assert(result.status === 'success');
    expect(result.content).toBe('summary\n[image: image/png]');
    expect(result.content).not.toContain('BASE64DATA');
  });

  it('falls back to serialized structuredContent when there are no content blocks', async () => {
    const structuredClient: McpClient = {
      ...client,
      callTool: () =>
        Promise.resolve({
          content: [],
          structuredContent: {answer: 42},
          isError: false,
        }),
    };
    const mgr = McpManager.create(() => Promise.resolve(structuredClient));
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
    const mcpTool = new McpToolRegistry('chat', mgr).get('mcp__fs__read');
    assert(mcpTool?.kind === 'mcp');

    const result = await mcpTool.execute({}, createMockContext());

    assert(result.status === 'success');
    expect(result.content).toBe('{"answer":42}');
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
    const duplicateTool: Tool = {
      name: 'read',
      description: 'read a file, again',
      inputSchema: {type: 'object', properties: {}},
    };
    const otherTool: Tool = {
      name: 'write',
      description: 'write a file',
      inputSchema: {type: 'object', properties: {}},
    };
    const duplicatingClient: McpClient = {
      ...client,
      listTools: () =>
        Promise.resolve({tools: [tool, duplicateTool, otherTool]}),
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
