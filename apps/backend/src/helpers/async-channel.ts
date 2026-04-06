/**
 * A simple async channel that bridges push-based producers with
 * pull-based `for await...of` consumers.
 *
 * Producers call `push(value)` and `close()`.
 * Consumers iterate with `for await (const value of channel)`.
 */
export class AsyncChannel<T> implements AsyncIterable<T> {
  private buffer: T[] = [];
  private notify: (() => void) | null = null;
  private closed = false;

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
    for (;;) {
      while (this.buffer.length > 0) {
        yield this.buffer.shift() as T;
      }
      if (this.closed) return;
      await new Promise<void>((resolve) => {
        this.notify = resolve;
      });
    }
  }
}
