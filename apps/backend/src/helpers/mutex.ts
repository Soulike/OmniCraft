/**
 * A simple async mutex.
 * Ensures only one holder at a time. Waiters are served in FIFO order.
 */
export class Mutex {
  private pending: Promise<void> = Promise.resolve();

  /**
   * Acquires the lock. Resolves with a release function once the lock
   * is available. The caller must call `release()` when done.
   */
  acquire(): Promise<() => void> {
    let release: () => void;
    const prev = this.pending;
    this.pending = new Promise((resolve) => {
      release = resolve;
    });
    return prev.then(() => release);
  }
}
