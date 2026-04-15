import {useCallback, useState} from 'react';
import {useNavigate, useParams} from 'react-router';

import {createSession} from '@/api/chat/index.js';
import {ROUTES} from '@/routes.js';

import {SessionIdContext} from './SessionIdContext.js';

interface SessionIdProviderProps {
  children: React.ReactNode;
}

export function SessionIdProvider({children}: SessionIdProviderProps) {
  const {sessionId} = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const createNewSessionId = useCallback(
    async (config?: {
      workspace?: string;
      extraAllowedPaths?: readonly string[];
    }) => {
      try {
        const id = await createSession(config);
        void navigate(`/chat/${id}`, {replace: true});
        return id;
      } catch (e: unknown) {
        const message =
          e instanceof Error ? e.message : 'Failed to create session';
        setError(message);
        return null;
      }
    },
    [navigate],
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
