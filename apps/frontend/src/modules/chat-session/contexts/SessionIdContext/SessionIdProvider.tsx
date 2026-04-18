import {useCallback, useEffect, useRef, useState} from 'react';
import {useNavigate, useParams} from 'react-router';

import {createSession} from '@/api/chat/index.js';
import {ROUTES} from '@/routes.js';

import {useChatEventBus} from '../../hooks/useChatEventBus.js';
import {SessionIdContext} from './SessionIdContext.js';

interface SessionIdProviderProps {
  children: React.ReactNode;
}

export function SessionIdProvider({children}: SessionIdProviderProps) {
  const {sessionId} = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const eventBus = useChatEventBus();

  // Emit reset-session when sessionId changes, except for null → id
  // (session just created — display is already empty).
  const prevSessionIdRef = useRef(sessionId ?? null);
  useEffect(() => {
    const prev = prevSessionIdRef.current;
    const curr = sessionId ?? null;
    prevSessionIdRef.current = curr;

    if (prev === null || prev === curr) return;

    eventBus.emit('reset-session');
  }, [sessionId, eventBus]);

  const createNewSessionId = useCallback(
    async (config?: {
      workspace?: string;
      extraAllowedPaths?: readonly string[];
    }) => {
      try {
        const id = await createSession(config);
        eventBus.emit('session-created', {sessionId: id});
        void navigate(`/chat/${id}`, {replace: true});
        return id;
      } catch (e: unknown) {
        const message =
          e instanceof Error ? e.message : 'Failed to create session';
        setError(message);
        return null;
      }
    },
    [navigate, eventBus],
  );

  const clearSessionId = useCallback(() => {
    setError(null);
    void navigate(ROUTES.chat(), {replace: true});
  }, [navigate]);

  const clearCreateNewSessionIdError = useCallback(() => {
    setError(null);
  }, []);

  return (
    <SessionIdContext
      value={{
        sessionId: sessionId ?? null,
        createNewSessionIdError: error,
        createNewSessionId,
        clearSessionId,
        clearCreateNewSessionIdError,
      }}
    >
      {children}
    </SessionIdContext>
  );
}
