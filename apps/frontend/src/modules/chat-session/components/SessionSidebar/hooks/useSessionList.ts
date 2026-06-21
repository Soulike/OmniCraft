import type {SessionMetadata} from '@omnicraft/api-schema';
import type {RefObject} from 'react';
import {useCallback, useEffect} from 'react';

import {useInfiniteScroll} from '@/hooks/useInfiniteScroll.js';
import type {ChatEventBus} from '@/modules/chat-events/index.js';

import {useChatSessionApi} from '../../../hooks/useChatSessionApi.js';

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

export function useSessionList({
  eventBus,
}: UseSessionListOptions): UseSessionListReturn {
  const {listSessions, deleteSession: apiDeleteSession} = useChatSessionApi();

  const {
    items,
    isLoadingInitial,
    isLoadingMore,
    error,
    hasMore,
    sentinelRef,
    backgroundRefresh,
  } = useInfiniteScroll<SessionMetadata>({
    fetcher: async (offset: number, limit: number) => {
      const result = await listSessions(offset, limit);
      return {items: result.sessions, total: result.total};
    },
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
      await apiDeleteSession(id);
      backgroundRefresh();
    },
    [backgroundRefresh, apiDeleteSession],
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
