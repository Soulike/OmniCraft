import {useCallback, useEffect, useRef, useState} from 'react';

import {createSession} from '@/api/chat/index.js';

/** Manages the chat session lifecycle. Creates a session on mount. */
export function useSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initRef = useRef(false);

  const resetSession = useCallback(async () => {
    setError(null);
    try {
      const id = await createSession();
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

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    void resetSession();
  }, [resetSession]);

  return {sessionId, sessionError: error, resetSession};
}
