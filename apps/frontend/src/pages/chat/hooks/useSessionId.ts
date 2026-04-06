import {useCallback, useState} from 'react';

import {createSession} from '@/api/chat/index.js';

interface SessionConfig {
  workspace?: string;
  extraAllowedPaths?: readonly string[];
}

/** Manages the session ID lifecycle. Session is created on demand via `createNewSessionId`. */
export function useSessionId() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createNewSessionId = useCallback(async (config: SessionConfig = {}) => {
    setError(null);
    try {
      const id = await createSession(config);
      setSessionId(id);
      return id;
    } catch (e) {
      console.error('Failed to create session', e);
      const message =
        e instanceof Error ? e.message : 'Failed to create session';
      setError(message);
      return null;
    }
  }, []);

  const clearSessionId = useCallback(() => {
    setSessionId(null);
    setError(null);
  }, []);

  const clearCreateNewSessionIdError = useCallback(() => {
    setError(null);
  }, []);

  return {
    sessionId,
    createNewSessionIdError: error,
    createNewSessionId,
    clearSessionId,
    clearCreateNewSessionIdError,
  };
}
