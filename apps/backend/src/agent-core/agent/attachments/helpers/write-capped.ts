import {createWriteStream} from 'node:fs';
import {rm} from 'node:fs/promises';
import type {Readable} from 'node:stream';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';

export type WriteCappedResult =
  | {readonly ok: true; readonly byteSize: number}
  | {readonly ok: false; readonly reason: 'too-large'};

/** Thrown by `writeCapped`'s capping transform to unwind out of `pipeline`
 *  once `cap` is exceeded — distinguished from a genuine filesystem failure
 *  so the two are never confused with one another. */
class AttachmentTooLargeError extends Error {}

/**
 * Streams `body` to `destination`, aborting once `cap` is exceeded. `pipeline`
 * owns error propagation and teardown for every stream in the chain —
 * including the destination file's open and flush — so a failed open or a
 * mid-write failure rejects instead of surfacing as an unhandled `'error'`
 * event, and a flush failure rejects instead of being reported as a
 * successful write. The payload is never fully buffered, so an oversized
 * upload costs bounded memory.
 *
 * Owns its own cleanup: on any failure path, `destination` is removed before
 * this returns or rethrows, so a caller's own cleanup of the same path is a
 * backstop rather than the only thing standing between a failed write and a
 * stray file.
 */
export async function writeCapped(
  body: Readable,
  destination: string,
  cap: number,
): Promise<WriteCappedResult> {
  let byteSize = 0;
  const capping = new Transform({
    transform(
      chunk: unknown,
      _encoding: BufferEncoding,
      callback: (error?: Error | null, data?: Buffer) => void,
    ) {
      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk as string);
      byteSize += buffer.length;
      if (byteSize > cap) {
        callback(new AttachmentTooLargeError());
        return;
      }
      callback(null, buffer);
    },
  });

  try {
    await pipeline(
      body,
      capping,
      createWriteStream(destination, {mode: 0o600}),
    );
    return {ok: true, byteSize};
  } catch (error: unknown) {
    await rm(destination, {force: true});
    if (error instanceof AttachmentTooLargeError) {
      return {ok: false, reason: 'too-large'};
    }
    throw error;
  }
}
