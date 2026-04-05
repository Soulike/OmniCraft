import {useCallback, useState} from 'react';

import {createSession} from '@/api/chat/index.js';

interface SessionConfig {
  workspace?: string;
  extraAllowedPaths?: readonly string[];
}

/** Manages the chat session lifecycle. Session is created on demand via `resetSession`. */
export function useSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetSession = useCallback(async (config: SessionConfig = {}) => {
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

  const clearSessionError = useCallback(() => {
    setError(null);
  }, []);

  return {sessionId, sessionError: error, resetSession, clearSessionError};
}
