import type {SessionMetadata} from '@omnicraft/api-schema';
import type {RefObject} from 'react';
import {useCallback, useEffect} from 'react';

import {deleteSession, listSessions} from '@/api/chat/index.js';
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
  deleteSession: (id: string) => Promise<void>;
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
    backgroundRefresh,
  } = useInfiniteScroll<SessionMetadata>({
    fetcher: fetchSessions,
    pageSize: 20,
  });

  // On session-created: refresh to pick up the newly persisted session.
  // On session-title: refresh to pick up the updated title.
  useEffect(() => {
    eventBus.on('session-created', backgroundRefresh);
    eventBus.on('session-title', backgroundRefresh);
    return () => {
      eventBus.off('session-created', backgroundRefresh);
      eventBus.off('session-title', backgroundRefresh);
    };
  }, [eventBus, backgroundRefresh]);

  const handleDeleteSession = useCallback(
    async (id: string) => {
      await deleteSession(id);
      backgroundRefresh();
    },
    [backgroundRefresh],
  );

  return {
    sessions: items,
    isLoadingInitial,
    isLoadingMore,
    error,
    hasMore,
    sentinelRef,
    deleteSession: handleDeleteSession,
  };
}
