import {
  createSessionResponseSchema,
  type ThinkingLevel,
} from '@omnicraft/api-schema';
import type {SseEvent} from '@omnicraft/sse-events';
import {sseEventSchema} from '@omnicraft/sse-events';

import {HttpError} from '../helpers/http-error.js';
import {parseSseStream} from '../helpers/sse.js';

const BASE = '/api/chat';

interface CreateSessionOptions {
  workspace?: string;
  extraAllowedPaths?: readonly string[];
}

/** Creates a new chat session. Returns the session ID. */
export async function createSession(
  options: CreateSessionOptions = {},
): Promise<string> {
  const res = await fetch(`${BASE}/session`, {
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
 * Sends a message to a chat session. The agent processes it in the background.
 * Use {@link subscribeEvents} to receive events.
 */
export async function sendMessage(
  sessionId: string,
  message: string,
  thinkingLevel: ThinkingLevel,
): Promise<void> {
  const res = await fetch(`${BASE}/session/${sessionId}/completions`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({message, thinkingLevel}),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Chat request failed (${res.status.toString()}): ${body}`);
  }
}

/**
 * Subscribes to SSE events from a chat session.
 * Replays from {@link from} index, then tails live events.
 */
export async function* subscribeEvents(
  sessionId: string,
  from: number,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent, void, undefined> {
  const url = `${BASE}/session/${sessionId}/events?from=${from.toString()}`;
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
export async function abortCompletion(sessionId: string): Promise<void> {
  const res = await fetch(`${BASE}/session/${sessionId}/abort`, {
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
  sessionId: string,
  interactionId: string,
  result: unknown,
): Promise<void> {
  const res = await fetch(`${BASE}/session/${sessionId}/tool-response`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({interactionId, result}),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to submit tool response (${res.status.toString()}): ${body}`,
    );
  }
}
