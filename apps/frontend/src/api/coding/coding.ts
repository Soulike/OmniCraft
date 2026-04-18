import {AgentType} from '@omnicraft/api-schema';

import * as agentSessionApi from '../agent-session/index.js';

/** Creates a new coding session. Returns the session ID. */
export async function createSession(
  options: {workspace?: string; extraAllowedPaths?: readonly string[]} = {},
): Promise<string> {
  return agentSessionApi.createSession(AgentType.CODING, options);
}

export async function sendMessage(
  sessionId: string,
  message: string,
  thinkingLevel: Parameters<typeof agentSessionApi.sendMessage>[3],
): Promise<void> {
  return agentSessionApi.sendMessage(
    AgentType.CODING,
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
    AgentType.CODING,
    sessionId,
    from,
    signal,
  );
}

export async function abortCompletion(sessionId: string): Promise<void> {
  return agentSessionApi.abortCompletion(AgentType.CODING, sessionId);
}

export async function submitToolResponse(
  sessionId: string,
  interactionId: string,
  result: unknown,
): Promise<void> {
  return agentSessionApi.submitToolResponse(
    AgentType.CODING,
    sessionId,
    interactionId,
    result,
  );
}

export async function listSessions(
  offset: number,
  limit: number,
): ReturnType<typeof agentSessionApi.listSessions> {
  return agentSessionApi.listSessions(AgentType.CODING, offset, limit);
}

export async function deleteSession(id: string): Promise<void> {
  return agentSessionApi.deleteSession(AgentType.CODING, id);
}
