import type {SessionMetadata} from '@omnicraft/api-schema';
import type {RefObject} from 'react';
import {useEffect} from 'react';

import {listSessions} from '@/api/chat/index.js';
import {useInfiniteScroll} from '@/hooks/useInfiniteScroll.js';

import type {ChatEventBus} from '../../StreamingMessageDisplay/index.js';

interface UseSessionListOptions {
  eventBus: ChatEventBus;
}

interface UseSessionListReturn {
  sessions: readonly SessionMetadata[];
  isLoadingInitial: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  sentinelRef: RefObject<HTMLDivElement | null>;
  refresh: () => void;
}

const fetchSessions = async (offset: number, limit: number) => {
  const result = await listSessions(offset, limit);
  return {items: result.sessions, total: result.total};
};

export function useSessionList({
  eventBus,
}: UseSessionListOptions): UseSessionListReturn {
  const {
    items,
    isLoadingInitial,
    isLoadingMore,
    error,
    hasMore,
    sentinelRef,
    refresh,
  } = useInfiniteScroll<SessionMetadata>({
    fetcher: fetchSessions,
    pageSize: 20,
  });

  // On session-created: refresh to pick up the newly persisted session.
  // On session-title: refresh to pick up the updated title.
  useEffect(() => {
    const handleRefresh = () => {
      refresh();
    };
    eventBus.on('session-created', handleRefresh);
    eventBus.on('session-title', handleRefresh);
    return () => {
      eventBus.off('session-created', handleRefresh);
      eventBus.off('session-title', handleRefresh);
    };
  }, [eventBus, refresh]);

  return {
    sessions: items,
    isLoadingInitial,
    isLoadingMore,
    error,
    hasMore,
    sentinelRef,
    refresh,
  };
}
