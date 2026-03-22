import {PassThrough} from 'node:stream';

import {logger} from '@/logger.js';

/** Writes a single SSE event to the stream. */
export function writeSseEvent(stream: PassThrough, data: unknown): void {
  stream.write(`data: ${JSON.stringify(data)}\n\n`);
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
    writeSseEvent(stream, {type: 'done'});
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    logger.error({err: e}, 'SSE stream error');
    writeSseEvent(stream, {type: 'error', message: errorMessage});
  } finally {
    stream.end();
  }
}
