import {toast} from '@heroui/react';
import {useCallback} from 'react';
import {useNavigate} from 'react-router';

import {useChatEventBus} from '../../hooks/useChatEventBus.js';
import {useSessionId} from '../../hooks/useSessionId.js';
import {useSessionList} from './hooks/useSessionList.js';
import {SessionListView} from './SessionListView.js';

export function SessionList() {
  const eventBus = useChatEventBus();
  const {sessionId, buildSessionRoute, baseRoute} = useSessionId();
  const {
    sessions,
    isLoadingInitial,
    isLoadingMore,
    error,
    hasMore,
    sentinelRef,
    deleteSession,
  } = useSessionList({
    eventBus,
  });
  const navigate = useNavigate();

  const handleSelectSession = useCallback(
    (id: string) => {
      if (id !== sessionId) {
        void navigate(buildSessionRoute(id));
      }
    },
    [navigate, sessionId, buildSessionRoute],
  );

  const handleDeleteSession = useCallback(
    async (id: string) => {
      try {
        await deleteSession(id);
      } catch (e: unknown) {
        console.error('Failed to delete session:', e);
        toast.danger('Failed to delete session');
        return;
      }
      toast.success('Session deleted');
      if (id === sessionId) {
        void navigate(baseRoute, {replace: true});
      }
    },
    [deleteSession, sessionId, navigate, baseRoute],
  );

  return (
    <SessionListView
      sessions={sessions}
      isLoadingInitial={isLoadingInitial}
      isLoadingMore={isLoadingMore}
      error={error}
      hasMore={hasMore}
      sentinelRef={sentinelRef}
      currentSessionId={sessionId}
      onSelectSession={handleSelectSession}
      onDeleteSession={handleDeleteSession}
    />
  );
}
