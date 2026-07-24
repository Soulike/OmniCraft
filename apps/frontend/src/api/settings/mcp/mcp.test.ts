import {type McpServer} from '@omnicraft/settings-schema';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {getSettingValue} from '@/api/settings/index.js';

import {getMcpConfig, putMcpConfig} from './mcp.js';

vi.mock('@/api/settings/index.js');

const mockedGet = vi.mocked(getSettingValue);

const stdioServer: McpServer = {
  name: 'fs',
  transport: {type: 'stdio', command: 'npx', args: [], env: {}},
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getMcpConfig', () => {
  it('reads and parses the three leaves', async () => {
    mockedGet.mockImplementation((path: string) => {
      if (path === 'mcp/servers') {
        return Promise.resolve([stdioServer]);
      }
      return Promise.resolve(['fs']);
    });

    const cfg = await getMcpConfig();

    expect(cfg.servers[0]?.name).toBe('fs');
    expect(cfg.enabledChat).toEqual(['fs']);
    expect(cfg.enabledCoding).toEqual(['fs']);
  });
});

describe('putMcpConfig', () => {
  it('PUTs the full config to /api/settings/mcp', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({success: true}))),
    );
    vi.stubGlobal('fetch', fetchMock);

    await putMcpConfig({
      servers: [stdioServer],
      enabledChat: ['fs'],
      enabledCoding: [],
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/settings/mcp', {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        mcp: {
          servers: [stdioServer],
          enabledByAgent: {chat: ['fs'], coding: []},
        },
      }),
    });
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('bad', {status: 400}))),
    );

    await expect(
      putMcpConfig({servers: [], enabledChat: [], enabledCoding: []}),
    ).rejects.toThrow();
  });
});
