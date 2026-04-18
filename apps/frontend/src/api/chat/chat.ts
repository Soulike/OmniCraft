import {
  AgentType,
  type ListSessionsResponse,
  type ThinkingLevel,
} from '@omnicraft/api-schema';
import type {SseEvent} from '@omnicraft/sse-events';

import type {CreateSessionOptions} from '../agent-session/index.js';
import * as agentSessionApi from '../agent-session/index.js';

/** Creates a new chat session. Returns the session ID. */
export async function createSession(
  options: CreateSessionOptions = {},
): Promise<string> {
  return agentSessionApi.createSession(AgentType.CHAT, options);
}

export async function sendMessage(
  sessionId: string,
  message: string,
  thinkingLevel: ThinkingLevel,
): Promise<void> {
  return agentSessionApi.sendMessage(
    AgentType.CHAT,
    sessionId,
    message,
    thinkingLevel,
  );
}

export async function* subscribeEvents(
  sessionId: string,
  from: number,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent, void, undefined> {
  yield* agentSessionApi.subscribeEvents(
    AgentType.CHAT,
    sessionId,
    from,
    signal,
  );
}

export async function abortCompletion(sessionId: string): Promise<void> {
  return agentSessionApi.abortCompletion(AgentType.CHAT, sessionId);
}

export async function submitToolResponse(
  sessionId: string,
  interactionId: string,
  result: unknown,
): Promise<void> {
  return agentSessionApi.submitToolResponse(
    AgentType.CHAT,
    sessionId,
    interactionId,
    result,
  );
}

export async function listSessions(
  offset: number,
  limit: number,
): Promise<ListSessionsResponse> {
  return agentSessionApi.listSessions(AgentType.CHAT, offset, limit);
}

export async function deleteSession(id: string): Promise<void> {
  return agentSessionApi.deleteSession(AgentType.CHAT, id);
}
