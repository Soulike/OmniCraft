import {
  AgentType,
  type McpServer,
  type McpTransport,
} from '@omnicraft/settings-schema';
import {act, renderHook, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {getMcpConfig, putMcpConfig} from '@/api/settings/mcp/index.js';

import {useMcpConfig} from './useMcpConfig.js';

vi.mock('@/api/settings/mcp/index.js');

const mockedGet = vi.mocked(getMcpConfig);
const mockedPut = vi.mocked(putMcpConfig);

const stdio: McpTransport = {type: 'stdio', command: 'npx', args: [], env: {}};

beforeEach(() => {
  vi.clearAllMocks();
  mockedGet.mockResolvedValue({
    servers: [{name: 'fs', transport: stdio}],
    enabledChat: ['fs'],
    enabledCoding: [],
  });
  mockedPut.mockResolvedValue(undefined);
});

async function mountLoaded() {
  const hook = renderHook(() => useMcpConfig());
  await waitFor(() => {
    expect(hook.result.current.isLoading).toBe(false);
  });
  return hook;
}

describe('useMcpConfig', () => {
  it('loads config on mount', async () => {
    const {result} = await mountLoaded();
    expect(result.current.config.servers).toHaveLength(1);
    expect(result.current.config.enabledChat).toEqual(['fs']);
  });

  it('appends a server on add', async () => {
    const {result} = await mountLoaded();
    await act(async () => {
      await result.current.addServer({name: 'two', transport: stdio});
    });
    expect(mockedPut).toHaveBeenCalledWith({
      servers: [
        {name: 'fs', transport: stdio},
        {name: 'two', transport: stdio},
      ],
    });
  });

  it('replaces the matching server on update', async () => {
    const {result} = await mountLoaded();
    const updated: McpServer = {
      name: 'fs',
      transport: {type: 'stdio', command: 'node', args: [], env: {}},
    };
    await act(async () => {
      await result.current.updateServer(updated);
    });
    expect(mockedPut).toHaveBeenCalledWith({servers: [updated]});
  });

  it('strips the name from servers and both arrays on remove', async () => {
    const {result} = await mountLoaded();
    await act(async () => {
      await result.current.removeServer('fs');
    });
    expect(mockedPut).toHaveBeenCalledWith({
      servers: [],
      enabledChat: [],
      enabledCoding: [],
    });
  });

  it('adds a name to the coding array on enable', async () => {
    const {result} = await mountLoaded();
    await act(async () => {
      await result.current.setEnabled('fs', AgentType.CODING, true);
    });
    expect(mockedPut).toHaveBeenCalledWith({enabledCoding: ['fs']});
  });

  it('removes a name from the chat array on disable', async () => {
    const {result} = await mountLoaded();
    await act(async () => {
      await result.current.setEnabled('fs', AgentType.CHAT, false);
    });
    expect(mockedPut).toHaveBeenCalledWith({enabledChat: []});
  });
});
