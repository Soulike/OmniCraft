/**
 * A simple serial async queue.
 * Enqueued tasks execute one at a time in order.
 */
export class AsyncQueue {
  private queue: Promise<void> = Promise.resolve();

  /** Enqueues a task. Resolves when the task completes. */
  enqueue(fn: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(fn);
    return this.queue;
  }
}
