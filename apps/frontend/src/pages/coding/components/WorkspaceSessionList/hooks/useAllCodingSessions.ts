import type {SessionMetadata} from '@omnicraft/api-schema';
import {useCallback, useEffect, useState} from 'react';

import {deleteSession, listAllSessions} from '@/api/coding/index.js';
import {useChatEventBus} from '@/modules/chat-session/index.js';

interface UseAllCodingSessionsResult {
  readonly sessions: readonly SessionMetadata[];
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly removeSession: (id: string) => Promise<void>;
}

/**
 * Loads every coding session (no pagination) and keeps it fresh: re-fetches on
 * session-created / session-title events from the chat event bus.
 */
export function useAllCodingSessions(): UseAllCodingSessionsResult {
  const eventBus = useChatEventBus();
  const [sessions, setSessions] = useState<readonly SessionMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const result = await listAllSessions();
      setSessions(result.sessions);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sessions');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onRefresh = () => {
      void reload();
    };
    eventBus.on('session-created', onRefresh);
    eventBus.on('session-title', onRefresh);
    return () => {
      eventBus.off('session-created', onRefresh);
      eventBus.off('session-title', onRefresh);
    };
  }, [eventBus, reload]);

  const removeSession = useCallback(
    async (id: string) => {
      await deleteSession(id);
      await reload();
    },
    [reload],
  );

  return {sessions, isLoading, error, removeSession};
}
