import {AgentType} from '@omnicraft/api-schema';

import * as agentSessionApi from '../agent-session/index.js';

/** Creates a new chat session. Returns the session ID. */
export async function createSession(
  options: {workspace?: string; extraAllowedPaths?: readonly string[]} = {},
): Promise<string> {
  return agentSessionApi.createSession(AgentType.CHAT, options);
}

export async function sendMessage(
  sessionId: string,
  message: string,
  thinkingLevel: Parameters<typeof agentSessionApi.sendMessage>[3],
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
): ReturnType<typeof agentSessionApi.subscribeEvents> {
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
): ReturnType<typeof agentSessionApi.listSessions> {
  return agentSessionApi.listSessions(AgentType.CHAT, offset, limit);
}

export async function deleteSession(id: string): Promise<void> {
  return agentSessionApi.deleteSession(AgentType.CHAT, id);
}
