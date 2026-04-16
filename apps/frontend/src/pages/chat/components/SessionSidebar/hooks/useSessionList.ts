import type {SessionMetadata} from '@omnicraft/api-schema';
import {useEffect, useRef} from 'react';

import {listSessions} from '@/api/chat/index.js';
import {useInfiniteList} from '@/hooks/useInfiniteList.js';

import type {ChatEventBus} from '../../StreamingMessageDisplay/index.js';

interface UseSessionListOptions {
  eventBus: ChatEventBus;
  sessionId: string | null;
}

interface UseSessionListReturn {
  sessions: readonly SessionMetadata[];
  isLoading: boolean;
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
  const {items, isLoading, isLoadingMore, error, hasMore, loadMore, refresh} =
    useInfiniteList<SessionMetadata>(fetchSessions);

  // Refresh when a new session is created (sessionId transitions from null to a value)
  const prevSessionIdRef = useRef(sessionId);
  useEffect(() => {
    const prev = prevSessionIdRef.current;
    prevSessionIdRef.current = sessionId;
    if (prev === null && sessionId !== null) {
      refresh();
    }
  }, [sessionId, refresh]);

  // Refresh when a session receives its title
  useEffect(() => {
    const handler = () => {
      refresh();
    };
    eventBus.on('session-title', handler);
    return () => {
      eventBus.off('session-title', handler);
    };
  }, [eventBus, refresh]);

  return {
    sessions: items,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
  };
}
