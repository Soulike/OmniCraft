import assert from 'node:assert';
import {PassThrough} from 'node:stream';

import {sseEventSchema} from '@omnicraft/sse-events';

/** Writes a single SSE event to the stream. Validates against the shared schema. */
export function writeSseEvent(stream: PassThrough, data: unknown): void {
  if (stream.destroyed || stream.writableEnded) return;
  const result = sseEventSchema.safeParse(data);
  assert(result.success, `Invalid SSE event: ${JSON.stringify(data)}`);
  stream.write(`data: ${JSON.stringify(result.data)}\n\n`);
}
