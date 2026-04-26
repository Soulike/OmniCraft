import {createContext} from 'react';

export interface CreateNewSessionOptions {
  workspace?: string;
}

export interface SessionIdContextValue {
  sessionId: string | null;
  createNewSessionIdError: string | null;
  createNewSessionId: (
    config?: CreateNewSessionOptions,
  ) => Promise<string | null>;
  clearSessionId: () => void;
  clearCreateNewSessionIdError: () => void;
  /** Build the full route path for a session. e.g. (id) => `/chat/${id}` */
  buildSessionRoute: (sessionId: string) => string;
  /** Route to navigate to when clearing the session. e.g. '/chat' */
  baseRoute: string;
}

export const SessionIdContext = createContext<SessionIdContextValue | null>(
  null,
);
