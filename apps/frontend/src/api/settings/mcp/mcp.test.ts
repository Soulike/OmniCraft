import {beforeEach, describe, expect, it, vi} from 'vitest';

import {getSettingValue, putSettingValues} from '@/api/settings/index.js';

import {getMcpConfig, putMcpConfig} from './mcp.js';

vi.mock('@/api/settings/index.js');

const mockedGet = vi.mocked(getSettingValue);
const mockedPut = vi.mocked(putSettingValues);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getMcpConfig', () => {
  it('reads and parses the three leaves', async () => {
    mockedGet.mockImplementation((path: string) => {
      if (path === 'mcp/servers') {
        return Promise.resolve([
          {
            name: 'fs',
            transport: {type: 'stdio', command: 'npx', args: [], env: {}},
          },
        ]);
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
  it('writes only the provided leaf as a batch entry', async () => {
    mockedPut.mockResolvedValue(undefined);

    await putMcpConfig({enabledChat: ['fs']});

    expect(mockedPut).toHaveBeenCalledWith([
      {path: 'mcp/enabledByAgent/chat', value: ['fs']},
    ]);
  });

  it('writes servers and both arrays together (removal case)', async () => {
    mockedPut.mockResolvedValue(undefined);

    await putMcpConfig({servers: [], enabledChat: [], enabledCoding: []});

    expect(mockedPut).toHaveBeenCalledWith([
      {path: 'mcp/servers', value: []},
      {path: 'mcp/enabledByAgent/chat', value: []},
      {path: 'mcp/enabledByAgent/coding', value: []},
    ]);
  });

  it('is a no-op when nothing is provided', async () => {
    await putMcpConfig({});
    expect(mockedPut).not.toHaveBeenCalled();
  });
});
