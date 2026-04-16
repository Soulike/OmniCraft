import type {SessionMetadata} from '@omnicraft/api-schema';
import {useEffect} from 'react';

import {listSessions} from '@/api/chat/index.js';
import {useInfiniteList} from '@/hooks/useInfiniteList.js';

import type {ChatEventBus} from '../../StreamingMessageDisplay/index.js';

interface UseSessionListOptions {
  eventBus: ChatEventBus;
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
}: UseSessionListOptions): UseSessionListReturn {
  const {items, isLoading, isLoadingMore, error, hasMore, loadMore, refresh} =
    useInfiniteList<SessionMetadata>(fetchSessions);

  // Refresh when a session receives its title (first completion persists the session)
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
