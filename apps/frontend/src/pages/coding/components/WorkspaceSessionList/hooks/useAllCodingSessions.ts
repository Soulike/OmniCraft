import type {SessionMetadata} from '@omnicraft/api-schema';
import {useCallback, useEffect, useState} from 'react';

import {
  useChatEventBus,
  useChatSessionApi,
} from '@/modules/chat-session/index.js';

/**
 * A page size large enough to return every session in a single request. The
 * coding session list is small (finished sessions are deleted), so fetching it
 * all at once — by asking the shared paginated API for one unbounded page — is
 * cheaper and simpler than client-side paging.
 */
const FETCH_ALL_LIMIT = Number.MAX_SAFE_INTEGER;

interface UseAllCodingSessionsResult {
  readonly sessions: readonly SessionMetadata[];
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly reload: () => Promise<void>;
  readonly removeSession: (id: string) => Promise<void>;
}

/**
 * Loads every coding session in a single request (one unbounded page through
 * the shared session API) and keeps it fresh: re-fetches on session-created /
 * session-title events from the chat event bus.
 */
export function useAllCodingSessions(): UseAllCodingSessionsResult {
  const eventBus = useChatEventBus();
  const {listSessions, deleteSession} = useChatSessionApi();
  const [sessions, setSessions] = useState<readonly SessionMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const result = await listSessions(0, FETCH_ALL_LIMIT);
      setSessions(result.sessions);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sessions');
    } finally {
      setIsLoading(false);
    }
  }, [listSessions]);

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
    [deleteSession, reload],
  );

  return {sessions, isLoading, error, reload, removeSession};
}
