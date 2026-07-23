import {act, renderHook, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {getMcpServers, reconnectMcpServer} from '@/api/mcp/index.js';

import {useMcpStatus} from './useMcpStatus.js';

vi.mock('@/api/mcp/index.js');

const mockedGet = vi.mocked(getMcpServers);
const mockedReconnect = vi.mocked(reconnectMcpServer);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useMcpStatus', () => {
  it('loads statuses on mount', async () => {
    mockedGet.mockResolvedValue([
      {name: 'fs', transportType: 'stdio', status: 'connected', tools: []},
    ]);

    const {result} = renderHook(() => useMcpStatus());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.statuses).toHaveLength(1);
    expect(result.current.loadError).toBe(false);
  });

  it('sets loadError when the fetch fails and keeps statuses null', async () => {
    mockedGet.mockRejectedValue(new Error('down'));

    const {result} = renderHook(() => useMcpStatus());

    await waitFor(() => {
      expect(result.current.loadError).toBe(true);
    });
    expect(result.current.statuses).toBeNull();
  });

  it('reconnects then refetches', async () => {
    mockedGet.mockResolvedValue([]);
    mockedReconnect.mockResolvedValue(undefined);

    const {result} = renderHook(() => useMcpStatus());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    mockedGet.mockClear();

    await act(async () => {
      await result.current.reconnect('fs');
    });

    expect(mockedReconnect).toHaveBeenCalledWith('fs');
    expect(mockedGet).toHaveBeenCalled();
  });
});
