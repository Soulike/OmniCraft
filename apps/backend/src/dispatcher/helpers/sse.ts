import assert from 'node:assert';
import type {IncomingMessage} from 'node:http';
import {PassThrough} from 'node:stream';

import type {SseEventCursorEntry} from '@omnicraft/sse-events';
import {sseEventCursorEntrySchema} from '@omnicraft/sse-events';

/**
 * Writes a single SSE event to the stream. Validates against the shared schema.
 *
 * The SSE `id` field is the backend-authoritative resume cursor: the next raw,
 * uncompressed AgentSseLog index the client should pass as `from` if it
 * reconnects after receiving this event. Replay compression can merge multiple
 * raw log entries into one emitted SSE message, so this cursor can jump by more
 * than one.
 */
export function writeSseEvent(
  stream: PassThrough,
  data: unknown,
  nextIndex: number,
): void {
  if (stream.destroyed || stream.writableEnded) return;
  const result = sseEventCursorEntrySchema.safeParse({
    event: data,
    nextIndex,
  });
  assert(
    result.success,
    `Invalid SSE cursor entry: ${JSON.stringify({event: data, nextIndex})}`,
  );
  stream.write(`id: ${result.data.nextIndex.toString()}\n`);
  stream.write(`data: ${JSON.stringify(result.data.event)}\n\n`);
}

/**
 * Pumps events from an async iterable to a PassThrough SSE stream.
 * Runs in the background — must not be awaited inside a Koa handler,
 * otherwise Koa's respond() never fires and the client receives nothing.
 */
export async function pumpSseEvents(
  stream: PassThrough,
  eventStream: AsyncIterable<SseEventCursorEntry>,
  req: IncomingMessage,
  abortController: AbortController,
): Promise<void> {
  const onDisconnect = () => {
    req.off('close', onDisconnect);
    abortController.abort();
    if (!stream.destroyed) {
      stream.end();
    }
  };
  req.on('close', onDisconnect);

  try {
    for await (const entry of eventStream) {
      writeSseEvent(stream, entry.event, entry.nextIndex);
    }
  } finally {
    req.off('close', onDisconnect);
    if (!stream.destroyed) {
      stream.end();
    }
  }
}
