import assert from 'node:assert';

import type {Tool} from '@modelcontextprotocol/sdk/types.js';
import type {McpServer} from '@omnicraft/settings-schema';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {McpManager} from './mcp-manager.js';
import type {McpClient} from './types.js';

function fakeClient(tools: Tool[]): McpClient {
  return {
    listTools: () => Promise.resolve({tools}),
    callTool: (params) =>
      Promise.resolve({
        content: [{type: 'text', text: `called ${params.name}`}],
        isError: false,
      }),
    setNotificationHandler: () => undefined,
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

const tool: Tool = {
  name: 'read',
  description: 'r',
  inputSchema: {type: 'object'},
};

const stdioServer: McpServer = {
  name: 'fs',
  transport: {type: 'stdio', command: 'x', args: [], env: {}},
};

afterEach(() => {
  McpManager.resetInstanceForTesting();
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

  it('reads every page of a paginated tool list', async () => {
    const pageOneTool: Tool = {name: 'a', inputSchema: {type: 'object'}};
    const pageTwoTool: Tool = {name: 'b', inputSchema: {type: 'object'}};
    const paginatedClient: McpClient = {
      ...fakeClient([]),
      listTools: (params) =>
        Promise.resolve(
          params?.cursor === 'page2'
            ? {tools: [pageTwoTool]}
            : {tools: [pageOneTool], nextCursor: 'page2'},
        ),
    };
    const mgr = McpManager.create(() => Promise.resolve(paginatedClient));
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

    expect(mgr.getToolsForAgent('chat')[0]?.tools).toEqual([
      pageOneTool,
      pageTwoTool,
    ]);
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
    const firstTool: Tool = {...tool, name: 'first'};
    const secondTool: Tool = {...tool, name: 'second'};
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

  it('does not resurrect a server removed during a transport-change reconnect', async () => {
    const mgr = McpManager.create(() => Promise.resolve(fakeClient([tool])));
    mgr.applyConfig({
      servers: [stdioServer],
      enabledByAgent: {chat: ['fs'], coding: []},
    });
    await vi.waitFor(() => {
      expect(mgr.list()[0]?.status).toBe('connected');
    });

    // A transport change starts a reconnect; the very next reconciliation
    // removes the server before that reconnect can settle.
    const changedServer: McpServer = {
      name: 'fs',
      transport: {type: 'stdio', command: 'y', args: [], env: {}},
    };
    mgr.applyConfig({
      servers: [changedServer],
      enabledByAgent: {chat: ['fs'], coding: []},
    });
    mgr.applyConfig({servers: [], enabledByAgent: {chat: [], coding: []}});

    // Let every pending reconnect microtask settle, then confirm the removed
    // server did not come back.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mgr.list()).toHaveLength(0);
    expect(mgr.getToolsForAgent('chat')).toEqual([]);
  });

  it('closes the client when initial tool discovery fails', async () => {
    const close = vi.fn(() => Promise.resolve());
    const client: McpClient = {
      ...fakeClient([]),
      listTools: () => Promise.reject(new Error('discovery boom')),
      close,
    };
    const mgr = McpManager.create(() => Promise.resolve(client));
    mgr.applyConfig({
      servers: [stdioServer],
      enabledByAgent: {chat: ['fs'], coding: []},
    });
    await vi.waitFor(() => {
      expect(mgr.list()[0]?.status).toBe('error');
    });

    expect(close).toHaveBeenCalledTimes(1);
    expect(mgr.list()[0]?.error).toContain('discovery boom');
  });

  it('serializes tool refreshes so a slow earlier refresh cannot clobber a newer one', async () => {
    const staleRefresh = deferred<{tools: Tool[]}>();
    let notify: () => void = () => undefined;
    let listCall = 0;
    const client: McpClient = {
      listTools: () => {
        listCall += 1;
        if (listCall === 1) {
          return Promise.resolve({tools: [{...tool, name: 'initial'}]});
        }
        // The first refresh (call 2) is slow and carries older data; the
        // second (call 3) is fast and carries the newest data.
        if (listCall === 2) return staleRefresh.promise;
        return Promise.resolve({tools: [{...tool, name: 'newest'}]});
      },
      callTool: () => Promise.resolve({content: [], isError: false}),
      setNotificationHandler: (_schema, handler) => {
        notify = handler as () => void;
      },
      close: () => Promise.resolve(),
    };
    const mgr = McpManager.create(() => Promise.resolve(client));
    mgr.applyConfig({
      servers: [stdioServer],
      enabledByAgent: {chat: ['fs'], coding: []},
    });
    await vi.waitFor(() => {
      expect(mgr.list()[0]?.status).toBe('connected');
    });

    // Two notifications arrive back to back; the earlier refresh resolves last
    // with stale data. Serialization must still leave the newest snapshot.
    notify();
    notify();
    staleRefresh.resolve({tools: [{...tool, name: 'stale'}]});
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mgr.getToolsForAgent('chat')[0]?.tools.map((t) => t.name)).toEqual([
      'newest',
    ]);
  });
});
