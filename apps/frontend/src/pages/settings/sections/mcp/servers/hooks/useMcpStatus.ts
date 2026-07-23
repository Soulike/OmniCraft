import type {McpServerStatusResponse} from '@omnicraft/api-schema';
import {useCallback, useEffect, useState} from 'react';

import {getMcpServers, reconnectMcpServer} from '@/api/mcp/index.js';

const DEFAULT_POLL_MS = 4000;

export interface UseMcpStatus {
  statuses: McpServerStatusResponse[] | null;
  isLoading: boolean;
  loadError: boolean;
  reconnect: (name: string) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useMcpStatus(pollMs: number = DEFAULT_POLL_MS): UseMcpStatus {
  const [statuses, setStatuses] = useState<McpServerStatusResponse[] | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const next = await getMcpServers();
      setStatuses(next);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const initialLoad = async () => {
      await refetch();
      if (active) {
        setIsLoading(false);
      }
    };
    void initialLoad();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refetch();
      }
    }, pollMs);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refetch();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refetch, pollMs]);

  const reconnect = useCallback(
    async (name: string) => {
      await reconnectMcpServer(name);
      await refetch();
    },
    [refetch],
  );

  return {statuses, isLoading, loadError, reconnect, refetch};
}
