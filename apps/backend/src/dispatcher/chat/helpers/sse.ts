import assert from 'node:assert';
import {PassThrough} from 'node:stream';

import type {SseDoneEvent, SseErrorEvent} from '@omnicraft/sse-events';
import {sseEventSchema} from '@omnicraft/sse-events';

import {logger} from '@/logger.js';

/** Writes a single SSE event to the stream. Validates against the shared schema. */
export function writeSseEvent(stream: PassThrough, data: unknown): void {
  if (stream.destroyed || stream.writableEnded) return;
  const result = sseEventSchema.safeParse(data);
  assert(result.success, `Invalid SSE event: ${JSON.stringify(data)}`);
  stream.write(`data: ${JSON.stringify(result.data)}\n\n`);
}

/**
 * Consumes an async event stream and writes each event as SSE.
 * Writes a `done` event on completion, or an `error` event on failure.
 * Always ends the stream when finished.
 */
export async function pumpEventStream(
  stream: PassThrough,
  eventStream: AsyncGenerator<unknown, void, undefined>,
): Promise<void> {
  try {
    for await (const event of eventStream) {
      writeSseEvent(stream, event);
    }
    const done: SseDoneEvent = {type: 'done', reason: 'complete'};
    writeSseEvent(stream, done);
  } catch (e) {
    logger.error({err: e}, 'SSE stream error');
    const error: SseErrorEvent = {
      type: 'error',
      message: 'An internal error occurred',
    };
    writeSseEvent(stream, error);
  } finally {
    if (!stream.destroyed && !stream.writableEnded) {
      stream.end();
    }
  }
}
