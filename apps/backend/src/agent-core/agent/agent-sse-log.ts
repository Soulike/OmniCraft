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
 * Readers end only via {@link AbortSignal}; the log has no "sealed" state.
 */
export class AgentSseLog {
  private readonly events: SseEvent[] = [];
  private readonly waiters = new Set<() => void>();

  get length(): number {
    return this.events.length;
  }

  append(event: SseEvent): void {
    this.events.push(event);
    this.notifyWaiters();
  }

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
      while (cursor < this.events.length) {
        yield this.events[cursor];
        cursor++;
        if (signal?.aborted) return;
      }

      // Wait for new events or abort.
      const aborted = await this.waitForChange(signal);
      if (aborted) return;
    }
  }

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
