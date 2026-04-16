import type {SessionMetadata} from '@omnicraft/api-schema';
import {useCallback, useEffect, useState} from 'react';

import {listSessions} from '@/api/chat/index.js';

import type {ChatEventBus} from '../../StreamingMessageDisplay/index.js';

interface UseSessionListOptions {
  eventBus: ChatEventBus;
  sessionId: string | null;
}

interface UseSessionListReturn {
  sessions: readonly SessionMetadata[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useSessionList({
  eventBus,
  sessionId,
}: UseSessionListOptions): UseSessionListReturn {
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
  }, [refreshKey, sessionId]);

  useEffect(() => {
    const handler = () => {
      refresh();
    };
    eventBus.on('session-title', handler);
    return () => {
      eventBus.off('session-title', handler);
    };
  }, [eventBus, refresh]);

  return {sessions, isLoading, error, refresh};
}
