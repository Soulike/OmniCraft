import {
  type AgentType,
  createSessionResponseSchema,
  type ListSessionsResponse,
  listSessionsResponseSchema,
  type ThinkingLevel,
} from '@omnicraft/api-schema';
import type {SseEvent} from '@omnicraft/sse-events';
import {sseEventSchema} from '@omnicraft/sse-events';

import {HttpError} from '../helpers/http-error.js';
import {parseSseStream} from '../helpers/sse.js';

function base(agentType: AgentType): string {
  return `/api/${agentType}`;
}

export interface CreateSessionOptions {
  workspace?: string;
  extraAllowedPaths?: readonly string[];
}

/** Creates a new session. Returns the session ID. */
export async function createSession(
  agentType: AgentType,
  options: CreateSessionOptions = {},
): Promise<string> {
  const res = await fetch(`${base(agentType)}/session`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(options),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to create session (${res.status.toString()}): ${body}`,
    );
  }

  const json: unknown = await res.json();
  const {sessionId} = createSessionResponseSchema.parse(json);
  return sessionId;
}

/**
 * Sends a message to a session. The agent processes it in the background.
 * Use {@link subscribeEvents} to receive events.
 */
export async function sendMessage(
  agentType: AgentType,
  sessionId: string,
  message: string,
  thinkingLevel: ThinkingLevel,
): Promise<void> {
  const res = await fetch(
    `${base(agentType)}/session/${sessionId}/completions`,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({message, thinkingLevel}),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Request failed (${res.status.toString()}): ${body}`);
  }
}

/**
 * Subscribes to SSE events from a session.
 * Replays from {@link from} index, then tails live events.
 */
export async function* subscribeEvents(
  agentType: AgentType,
  sessionId: string,
  from: number,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent, void, undefined> {
  const url = `${base(agentType)}/session/${sessionId}/events?from=${from.toString()}`;
  const res = await fetch(url, {signal});

  if (!res.ok) {
    const body = await res.text();
    throw new HttpError(
      res.status,
      `Event subscription failed (${res.status.toString()}): ${body}`,
    );
  }

  for await (const data of parseSseStream(res)) {
    const parsed: unknown = JSON.parse(data);
    yield sseEventSchema.parse(parsed);
  }
}

/** Aborts the currently running agent turn. */
export async function abortCompletion(
  agentType: AgentType,
  sessionId: string,
): Promise<void> {
  const res = await fetch(`${base(agentType)}/session/${sessionId}/abort`, {
    method: 'POST',
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to abort completion (${res.status.toString()}): ${body}`,
    );
  }
}

/**
 * Submits a user response for a client-side tool interaction.
 *
 * The `result` is untyped — callers must construct it according to the
 * tool-specific response schema.
 */
export async function submitToolResponse(
  agentType: AgentType,
  sessionId: string,
  interactionId: string,
  result: unknown,
): Promise<void> {
  const res = await fetch(
    `${base(agentType)}/session/${sessionId}/tool-response`,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({interactionId, result}),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to submit tool response (${res.status.toString()}): ${body}`,
    );
  }
}

/** Fetches the list of past sessions. */
export async function listSessions(
  agentType: AgentType,
  offset: number,
  limit: number,
): Promise<ListSessionsResponse> {
  const params = new URLSearchParams({
    offset: offset.toString(),
    limit: limit.toString(),
  });
  const res = await fetch(`${base(agentType)}/sessions?${params.toString()}`);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to list sessions (${res.status.toString()}): ${body}`,
    );
  }

  const json: unknown = await res.json();
  return listSessionsResponseSchema.parse(json);
}

/** Deletes a session by ID. */
export async function deleteSession(
  agentType: AgentType,
  id: string,
): Promise<void> {
  const res = await fetch(`${base(agentType)}/session/${id}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to delete session (${res.status.toString()}): ${body}`,
    );
  }
}
