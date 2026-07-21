import type {SessionMetadata} from '@omnicraft/api-schema';
import {useCallback, useEffect, useRef, useState} from 'react';

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

/** Unconditional background poll cadence for running/idle + recency freshness. */
const POLL_INTERVAL_MS = 3000;

interface UseAllCodingSessionsResult {
  readonly sessions: readonly SessionMetadata[];
  readonly isLoading: boolean;
  readonly error: string | null;
  /**
   * Re-fetch the session list. Pass `background: false` for a user-initiated
   * load (e.g. Retry) to show the loading spinner; `background: true` for a
   * silent refresh (event-driven / post-delete) that must not flash a spinner
   * over the visible list.
   */
  readonly reload: (background: boolean) => Promise<void>;
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

  // Bumped on every reload; a response is applied only if its generation is
  // still current, so a slow earlier load can't overwrite a newer refresh.
  const generationRef = useRef(0);

  const reload = useCallback(
    async (background: boolean) => {
      const generation = (generationRef.current += 1);
      if (!background) {
        setIsLoading(true);
      }
      try {
        const result = await listSessions(0, FETCH_ALL_LIMIT);
        if (generation !== generationRef.current) {
          return;
        }
        setSessions(result.sessions);
        setError(null);
      } catch (e) {
        if (generation !== generationRef.current) {
          return;
        }
        setError(e instanceof Error ? e.message : 'Failed to load sessions');
      } finally {
        if (generation === generationRef.current) {
          setIsLoading(false);
        }
      }
    },
    [listSessions],
  );

  useEffect(() => {
    void reload(false);
  }, [reload]);

  useEffect(() => {
    const onRefresh = () => {
      void reload(true);
    };
    eventBus.on('session-created', onRefresh);
    eventBus.on('session-title', onRefresh);
    return () => {
      eventBus.off('session-created', onRefresh);
      eventBus.off('session-title', onRefresh);
    };
  }, [eventBus, reload]);

  useEffect(() => {
    const id = setInterval(() => {
      void reload(true);
    }, POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
    };
  }, [reload]);

  const removeSession = useCallback(
    async (id: string) => {
      await deleteSession(id);
      await reload(true);
    },
    [deleteSession, reload],
  );

  return {sessions, isLoading, error, reload, removeSession};
}
