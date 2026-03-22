import type {SseEvent} from '@omnicraft/sse-events';

import {parseSseStream} from '../helpers/sse.js';
import {createSessionResponse, sseEventSchema} from './validator.js';

const BASE = '/api/chat';

/** Creates a new chat session. Returns the session ID. */
export async function createSession(): Promise<string> {
  const res = await fetch(`${BASE}/session`, {method: 'POST'});

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to create session (${res.status.toString()}): ${body}`,
    );
  }

  const json: unknown = await res.json();
  const {sessionId} = createSessionResponse.parse(json);
  return sessionId;
}

/**
 * Sends a message to a chat session and yields SSE events.
 * Uses fetch() + ReadableStream since EventSource does not support POST.
 */
export async function* streamChatCompletion(
  sessionId: string,
  message: string,
): AsyncGenerator<SseEvent, void, undefined> {
  const res = await fetch(`${BASE}/session/${sessionId}/completions`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({message}),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Chat request failed (${res.status.toString()}): ${body}`);
  }

  for await (const data of parseSseStream(res)) {
    const parsed: unknown = JSON.parse(data);
    yield sseEventSchema.parse(parsed);
  }
}
