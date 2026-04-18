import {createContext} from 'react';

export interface SessionIdContextValue {
  sessionId: string | null;
  createNewSessionIdError: string | null;
  createNewSessionId: (config?: {
    workspace?: string;
    extraAllowedPaths?: readonly string[];
  }) => Promise<string | null>;
  clearSessionId: () => void;
  clearCreateNewSessionIdError: () => void;
}

export const SessionIdContext = createContext<SessionIdContextValue | null>(
  null,
);
