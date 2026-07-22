import assert from 'node:assert';

import type {McpServer} from '@omnicraft/settings-schema';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {McpManager} from './mcp-manager.js';
import type {McpClient, McpToolInfo} from './types.js';

function fakeClient(tools: McpToolInfo[]): McpClient {
  return {
    listTools: () => Promise.resolve(tools),
    callTool: (name) =>
      Promise.resolve({
        content: [{type: 'text', text: `called ${name}`}],
        isError: false,
      }),
    onToolsChanged: () => undefined,
    close: () => Promise.resolve(),
  };
}

/** A promise plus its resolver, for controlling an in-flight connect. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  assert(resolve);
  return {promise, resolve};
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
      {serverName: 'fs', tools: [tool]},
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

  it('closes a superseded client when disabled while its connect is still pending, without leaking it into the snapshot', async () => {
    const close = vi.fn(() => Promise.resolve());
    const {promise, resolve} = deferred<McpClient>();
    const mgr = McpManager.create(() => promise);

    mgr.applyConfig({
      servers: [stdioServer],
      enabledByAgent: {chat: ['fs'], coding: []},
    });
    // Disable before the in-flight connect resolves; do not re-enable.
    mgr.applyConfig({servers: [], enabledByAgent: {chat: [], coding: []}});

    resolve({...fakeClient([tool]), close});
    await vi.waitFor(() => {
      expect(close).toHaveBeenCalledTimes(1);
    });

    expect(mgr.list()).toHaveLength(0);
    expect(mgr.getToolsForAgent('chat')).toEqual([]);
  });

  it('closes the superseded client when disabled then re-enabled while the first connect is pending', async () => {
    const firstTool: McpToolInfo = {...tool, name: 'first'};
    const secondTool: McpToolInfo = {...tool, name: 'second'};
    const closeFirst = vi.fn(() => Promise.resolve());
    const closeSecond = vi.fn(() => Promise.resolve());
    const pending: {resolve: (client: McpClient) => void}[] = [];
    const createClient = vi.fn(
      () =>
        new Promise<McpClient>((resolve) => {
          pending.push({resolve});
        }),
    );
    const mgr = McpManager.create(createClient);

    mgr.applyConfig({
      servers: [stdioServer],
      enabledByAgent: {chat: ['fs'], coding: []},
    });
    mgr.applyConfig({servers: [], enabledByAgent: {chat: [], coding: []}}); // disable
    mgr.applyConfig({
      servers: [stdioServer],
      enabledByAgent: {chat: ['fs'], coding: []},
    }); // re-enable, first connect still pending

    expect(pending).toHaveLength(2);
    pending[0]?.resolve({...fakeClient([firstTool]), close: closeFirst});
    pending[1]?.resolve({...fakeClient([secondTool]), close: closeSecond});

    await vi.waitFor(() => {
      expect(closeFirst).toHaveBeenCalledTimes(1);
    });
    await vi.waitFor(() => {
      expect(mgr.list()[0]?.status).toBe('connected');
    });
    expect(closeSecond).not.toHaveBeenCalled();
    expect(mgr.getToolsForAgent('chat')).toEqual([
      {serverName: 'fs', tools: [secondTool]},
    ]);
  });

  it('reconnects exactly once when the transport definition changes', async () => {
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
    const changedServer: McpServer = {
      name: 'fs',
      transport: {type: 'stdio', command: 'y', args: [], env: {}},
    };
    mgr.applyConfig({
      servers: [changedServer],
      enabledByAgent: {chat: ['fs'], coding: []},
    });
    await vi.waitFor(() => {
      expect(mgr.list()[0]?.status).toBe('connected');
    });

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith(changedServer);
  });
});
