import type {SessionMetadata} from '@omnicraft/api-schema';
import {useCallback, useEffect, useState} from 'react';

import {listSessions} from '@/api/chat/index.js';

interface UseSessionListReturn {
  sessions: readonly SessionMetadata[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Fetches the session list from the API and provides a manual refresh.
 * Re-fetches automatically on mount.
 */
export function useSessionList(): UseSessionListReturn {
  const [sessions, setSessions] = useState<readonly SessionMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchSessions() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await listSessions(0, 50);
        if (!cancelled) {
          setSessions(result.sessions);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load sessions');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchSessions();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return {sessions, isLoading, error, refresh};
}
