import {afterEach, describe, expect, it, vi} from 'vitest';

import {getMcpServers, reconnectMcpServer} from './mcp.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getMcpServers', () => {
  it('returns the parsed servers array', async () => {
    const body = {
      servers: [
        {
          name: 'fs',
          transportType: 'stdio',
          status: 'connected',
          tools: [{name: 'read_file', description: 'Read a file'}],
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(body)))),
    );

    const servers = await getMcpServers();

    expect(servers).toEqual(body.servers);
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('nope', {status: 500}))),
    );

    await expect(getMcpServers()).rejects.toThrow();
  });
});

describe('reconnectMcpServer', () => {
  it('POSTs to the reconnect endpoint', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({success: true}), {status: 202}),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await reconnectMcpServer('fs');

    expect(fetchMock).toHaveBeenCalledWith('/api/mcp/servers/fs/reconnect', {
      method: 'POST',
    });
  });

  it('throws when the server is unknown (404)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({error: 'x'}), {status: 404}),
        ),
      ),
    );

    await expect(reconnectMcpServer('nope')).rejects.toThrow();
  });
});
