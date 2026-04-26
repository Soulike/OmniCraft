import type {ListSessionsResponse} from '@omnicraft/api-schema';
import type {SseEventCursorEntry} from '@omnicraft/sse-events';
import {createContext} from 'react';

import type {CreateSessionOptions} from '@/api/agent-session/index.js';

export interface ChatSessionApi {
  createSession: (options: CreateSessionOptions) => Promise<string>;

  sendMessage: (sessionId: string, message: string) => Promise<void>;

  subscribeEvents: (
    sessionId: string,
    from: number,
    signal?: AbortSignal,
  ) => AsyncGenerator<SseEventCursorEntry, void, undefined>;

  abortCompletion: (sessionId: string) => Promise<void>;

  submitToolResponse: (
    sessionId: string,
    interactionId: string,
    result: unknown,
  ) => Promise<void>;

  listSessions: (
    offset: number,
    limit: number,
  ) => Promise<ListSessionsResponse>;

  deleteSession: (id: string) => Promise<void>;
}

export const ChatSessionApiContext = createContext<ChatSessionApi | null>(null);
