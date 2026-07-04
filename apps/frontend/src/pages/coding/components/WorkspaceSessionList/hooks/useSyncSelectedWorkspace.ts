import type {SessionMetadata} from '@omnicraft/api-schema';
import {useEffect} from 'react';

/**
 * Binds the active workspace to the current session: whenever the active
 * session (or the loaded list) changes, syncs `selectedWorkspace` to that
 * session's `workingDirectory`. Deriving it from the session — rather than
 * setting it from a click handler — covers every navigation path (click, deep
 * link, refresh, history) uniformly. Clears it when no session is active or the
 * active one is not yet loaded.
 */
export function useSyncSelectedWorkspace(
  sessions: readonly SessionMetadata[],
  sessionId: string | null,
  setSelectedWorkspace: (workspace: string | undefined) => void,
): void {
  useEffect(() => {
    const active = sessions.find((session) => session.id === sessionId);
    setSelectedWorkspace(active?.workingDirectory);
  }, [sessions, sessionId, setSelectedWorkspace]);
}
