import type {SessionMetadata} from '@omnicraft/api-schema';
import {useCallback, useEffect, useRef} from 'react';

import {listSessions} from '@/api/chat/index.js';
import {useInfiniteList} from '@/hooks/useInfiniteList.js';

import type {ChatEventBus} from '../../StreamingMessageDisplay/index.js';

interface UseSessionListOptions {
  eventBus: ChatEventBus;
  sessionId: string | null;
}

interface UseSessionListReturn {
  sessions: readonly SessionMetadata[];
  isLoadingInitial: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
}

const fetchSessions = async (offset: number, limit: number) => {
  const result = await listSessions(offset, limit);
  return {items: result.sessions, total: result.total};
};

export function useSessionList({
  eventBus,
  sessionId,
}: UseSessionListOptions): UseSessionListReturn {
  const {
    items,
    isLoadingInitial,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
  } = useInfiniteList<SessionMetadata>({fetcher: fetchSessions, pageSize: 20});

  // Use a ref so the event handler always sees the latest items without
  // re-subscribing on every items change.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const refreshIfNewSession = useCallback(() => {
    if (
      sessionId !== null &&
      !itemsRef.current.some((s) => s.id === sessionId)
    ) {
      refresh();
    }
  }, [sessionId, refresh]);

  // Refresh only when a genuinely new session receives its title.
  // Replayed session-title events for existing sessions are ignored.
  useEffect(() => {
    eventBus.on('session-title', refreshIfNewSession);
    return () => {
      eventBus.off('session-title', refreshIfNewSession);
    };
  }, [eventBus, refreshIfNewSession]);

  return {
    sessions: items,
    isLoadingInitial,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
  };
}
