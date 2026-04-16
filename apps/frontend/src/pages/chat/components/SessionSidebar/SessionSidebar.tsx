import {toast} from '@heroui/react';
import {useCallback, useState} from 'react';
import {useNavigate} from 'react-router';

import {deleteSession} from '@/api/chat/index.js';

import {useChatEventBus} from '../../hooks/useChatEventBus.js';
import {useSessionId} from '../../hooks/useSessionId.js';
import {useSessionList} from './hooks/useSessionList.js';
import {SessionSidebarView} from './SessionSidebarView.js';

export function SessionSidebar() {
  const [isOpen, setIsOpen] = useState(true);
  const eventBus = useChatEventBus();
  const {sessions, isLoading, error, refresh} = useSessionList({
    eventBus,
    sessionId,
  });
  const {sessionId} = useSessionId();
  const navigate = useNavigate();

  const handleSelectSession = useCallback(
    (id: string) => {
      if (id !== sessionId) {
        void navigate(`/chat/${id}`);
      }
    },
    [navigate, sessionId],
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
      refresh();
      if (id === sessionId) {
        void navigate('/chat', {replace: true});
      }
    },
    [refresh, sessionId, navigate],
  );

  return (
    <SessionSidebarView
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      sessions={sessions}
      isLoading={isLoading}
      error={error}
      currentSessionId={sessionId}
      onSelectSession={handleSelectSession}
      onDeleteSession={handleDeleteSession}
    />
  );
}
