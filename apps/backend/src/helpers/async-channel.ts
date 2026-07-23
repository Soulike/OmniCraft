/**
 * A simple async channel that bridges push-based producers with
 * pull-based `for await...of` consumers.
 *
 * Producers call `push(value)` and `close()`.
 * Consumers iterate with `for await (const value of channel)`.
 *
 * When an {@link AbortSignal} is provided, iteration ends once the signal
 * aborts even if the channel is never closed — after first draining any
 * values already buffered. This lets a consumer stop waiting on a producer
 * that may never settle (e.g. a tool call that hangs).
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
    if (this.closed) return;
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
      while (this.buffer.length > 0) {
        yield this.buffer.shift() as T;
      }
      if (this.closed || signal?.aborted) return;
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
