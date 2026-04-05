import type {SseEvent} from '@omnicraft/sse-events';

import {parseSseStream} from '../helpers/sse.js';
import {
  createSessionResponse,
  generateTitleResponse,
  sseEventSchema,
} from './validator.js';

const BASE = '/api/chat';

interface CreateSessionOptions {
  workspace?: string;
  extraAllowedPaths?: string[];
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
  signal?: AbortSignal,
): AsyncGenerator<SseEvent, void, undefined> {
  const res = await fetch(`${BASE}/session/${sessionId}/completions`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({message}),
    signal,
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

/** Generates a short title for a chat session. */
export async function generateTitle(
  sessionId: string,
  userMessage: string,
  assistantMessage: string,
): Promise<string> {
  const res = await fetch(`${BASE}/session/${sessionId}/generate-title`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userMessage, assistantMessage}),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to generate title (${res.status.toString()}): ${body}`,
    );
  }

  const json: unknown = await res.json();
  const {title} = generateTitleResponse.parse(json);
  return title;
}
