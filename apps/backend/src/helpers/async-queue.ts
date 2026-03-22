/**
 * A simple serial async queue.
 * Enqueued tasks execute one at a time in order.
 */
export class AsyncQueue {
  private queue: Promise<void> = Promise.resolve();

  /** Enqueues a task. Resolves with the task's return value when it completes. */
  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    let resolve: (value: T) => void;
    let reject: (reason: unknown) => void;
    const result = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.queue = this.queue.then(async () => {
      try {
        resolve(await fn());
      } catch (e) {
        reject(e);
      }
    });
    return result;
  }
}
