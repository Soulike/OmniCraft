import type {SessionMetadata} from '@omnicraft/api-schema';
import type {RefObject} from 'react';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import {listSessions} from '@/api/chat/index.js';
import {useInfiniteScroll} from '@/hooks/useInfiniteScroll.js';

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
  sentinelRef: RefObject<HTMLDivElement | null>;
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
    sentinelRef,
    refresh,
  } = useInfiniteScroll<SessionMetadata>({
    fetcher: fetchSessions,
    pageSize: 20,
  });

  // Placeholder for a just-created session that hasn't been titled yet.
  const [pendingSession, setPendingSession] = useState<SessionMetadata | null>(
    null,
  );

  // Use a ref so the event handler always sees the latest items without
  // re-subscribing on every items change.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // On session-created: set a placeholder entry.
  useEffect(() => {
    const handleSessionCreated = ({sessionId}: {sessionId: string}) => {
      setPendingSession({id: sessionId, title: 'New Session'});
    };
    eventBus.on('session-created', handleSessionCreated);
    return () => {
      eventBus.off('session-created', handleSessionCreated);
    };
  }, [eventBus]);

  // On session-title: refresh the list and clear the placeholder.
  const handleSessionTitle = useCallback(() => {
    if (
      sessionId !== null &&
      !itemsRef.current.some((s) => s.id === sessionId)
    ) {
      refresh();
    }
    setPendingSession(null);
  }, [sessionId, refresh]);

  useEffect(() => {
    eventBus.on('session-title', handleSessionTitle);
    return () => {
      eventBus.off('session-title', handleSessionTitle);
    };
  }, [eventBus, handleSessionTitle]);

  // On reset-session: clear the placeholder (user started another new session).
  useEffect(() => {
    const handleResetSession = () => {
      setPendingSession(null);
    };
    eventBus.on('reset-session', handleResetSession);
    return () => {
      eventBus.off('reset-session', handleResetSession);
    };
  }, [eventBus]);

  // Merge: prepend pending session if it's not already in the fetched list.
  const sessions = useMemo(() => {
    if (
      pendingSession === null ||
      items.some((s) => s.id === pendingSession.id)
    ) {
      return items;
    }
    return [pendingSession, ...items];
  }, [items, pendingSession]);

  return {
    sessions,
    isLoadingInitial,
    isLoadingMore,
    error,
    hasMore,
    sentinelRef,
    refresh,
  };
}
