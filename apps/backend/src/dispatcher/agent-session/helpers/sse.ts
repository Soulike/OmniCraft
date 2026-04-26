import assert from 'node:assert';
import {PassThrough} from 'node:stream';

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
