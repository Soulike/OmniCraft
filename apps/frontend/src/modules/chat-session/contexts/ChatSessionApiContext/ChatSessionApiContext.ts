import type {ListSessionsResponse, ThinkingLevel} from '@omnicraft/api-schema';
import type {SseEvent} from '@omnicraft/sse-events';
import {createContext} from 'react';

export interface ChatSessionApi {
  createSession: (options?: {workspace?: string}) => Promise<string>;

  sendMessage: (
    sessionId: string,
    message: string,
    thinkingLevel: ThinkingLevel,
  ) => Promise<void>;

  subscribeEvents: (
    sessionId: string,
    from: number,
    signal?: AbortSignal,
  ) => AsyncGenerator<SseEvent, void, undefined>;

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
