/**
 * A simple async channel that bridges push-based producers with
 * pull-based `for await...of` consumers.
 *
 * Producers call `push(value)` and `close()`.
 * Consumers iterate with `for await (const value of channel)`.
 *
 * When an {@link AbortSignal} is provided, iteration ends promptly once the
 * signal aborts even if the channel is never closed, dropping any queued
 * backlog rather than draining it first. This lets a consumer stop waiting on
 * a producer that may never settle (e.g. a tool call that hangs) without its
 * cancellation latency scaling with a high-volume producer's queue. Once
 * aborted, further `push`es are dropped too (like pushing after `close`), so a
 * leaked producer cannot accumulate values in a channel no consumer will drain.
 * (`close`, by contrast, still drains the remaining buffer before ending.)
 */
export class AsyncChannel<T> implements AsyncIterable<T> {
  private buffer: T[] = [];
  private notify: (() => void) | null = null;
  private closed = false;
  private readonly signal?: AbortSignal;

  constructor(signal?: AbortSignal) {
    this.signal = signal;
  }

  push(value: T): void {
    if (this.closed || this.signal?.aborted) return;
    this.buffer.push(value);
    this.notify?.();
  }

  close(): void {
    this.closed = true;
    this.notify?.();
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    const signal = this.signal;
    for (;;) {
      while (!signal?.aborted && this.buffer.length > 0) {
        yield this.buffer.shift() as T;
      }
      if (this.closed || signal?.aborted) {
        // On abort, drop any queued backlog rather than draining it first:
        // a high-volume producer can queue faster than the consumer drains,
        // and delivering that whole backlog would make cancellation latency
        // scale with the queue. Dropping it also releases the retained values.
        if (signal?.aborted) this.buffer.length = 0;
        return;
      }
      await new Promise<void>((resolve) => {
        const onAbort = (): void => {
          this.notify = null;
          resolve();
        };
        this.notify = (): void => {
          signal?.removeEventListener('abort', onAbort);
          this.notify = null;
          resolve();
        };
        signal?.addEventListener('abort', onAbort, {once: true});
      });
    }
  }
}
