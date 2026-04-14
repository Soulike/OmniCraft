import assert from 'node:assert';

import type {SseEvent} from '@omnicraft/sse-events';

export interface AgentSseLogReaderOptions {
  /** Index to start reading from (inclusive). Defaults to 0. */
  startIndex?: number;
  /** Signal to abort the reader. The async iterable ends silently. */
  signal?: AbortSignal;
}

/**
 * Append-only event log with multi-reader support.
 *
 * A single writer appends events via {@link append}. Multiple readers
 * can independently iterate over the log via {@link createReader},
 * replaying historical events and then blocking for new ones.
 *
 * Call {@link seal} when no more events will be appended. All waiting
 * readers will drain remaining events and end iteration.
 */
export class AgentSseLog {
  private readonly events: SseEvent[] = [];
  private readonly waiters = new Set<() => void>();
  private isSealedFlag = false;

  /** Number of events in the log. */
  get length(): number {
    return this.events.length;
  }

  /** Whether the log has been sealed (no more appends allowed). */
  get sealed(): boolean {
    return this.isSealedFlag;
  }

  /** Appends an event to the log and wakes all waiting readers. */
  append(event: SseEvent): void {
    if (this.isSealedFlag) {
      throw new Error('Cannot append to a sealed AgentSseLog');
    }
    this.events.push(event);
    this.notifyWaiters();
  }

  /** Marks the log as complete. No more events can be appended. */
  seal(): void {
    this.isSealedFlag = true;
    this.notifyWaiters();
  }

  /**
   * Creates a reader that replays events from {@link startIndex},
   * then blocks waiting for new events until the log is sealed
   * or the signal is aborted. Abort ends iteration silently.
   */
  createReader(options?: AgentSseLogReaderOptions): AsyncIterable<SseEvent> {
    const startIndex = options?.startIndex ?? 0;
    assert(startIndex >= 0, 'startIndex must be non-negative');
    const signal = options?.signal;
    return {
      [Symbol.asyncIterator]: () => this.readerIterator(startIndex, signal),
    };
  }

  private async *readerIterator(
    cursor: number,
    signal?: AbortSignal,
  ): AsyncIterableIterator<SseEvent> {
    if (signal?.aborted) return;

    for (;;) {
      // Yield all available events from cursor onward.
      while (cursor < this.events.length) {
        yield this.events[cursor];
        cursor++;
        if (signal?.aborted) return;
      }

      // All caught up. If sealed, we're done.
      if (this.isSealedFlag) return;

      // Wait for new events, seal, or abort.
      const aborted = await this.waitForChange(signal);
      if (aborted) return;
    }
  }

  /**
   * Returns a promise that resolves when a waiter notification fires
   * or the signal aborts. Returns `true` if aborted, `false` otherwise.
   */
  private waitForChange(signal?: AbortSignal): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const cleanup = (): void => {
        this.waiters.delete(onNotify);
        signal?.removeEventListener('abort', onAbort);
      };

      const onNotify = (): void => {
        cleanup();
        resolve(false);
      };

      const onAbort = (): void => {
        cleanup();
        resolve(true);
      };

      this.waiters.add(onNotify);

      if (signal) {
        if (signal.aborted) {
          cleanup();
          resolve(true);
          return;
        }
        signal.addEventListener('abort', onAbort, {once: true});
      }
    });
  }

  private notifyWaiters(): void {
    const current = [...this.waiters];
    this.waiters.clear();
    for (const notify of current) {
      notify();
    }
  }
}
