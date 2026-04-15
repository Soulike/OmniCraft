import assert from 'node:assert';
import {appendFile, mkdir} from 'node:fs/promises';
import path from 'node:path';

import type {SseEvent} from '@omnicraft/sse-events';

import {Mutex} from '@/helpers/mutex.js';

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
 * Modes:
 * - In-memory (no filePath): events are stored only in memory.
 * - File-backed (filePath provided): each event is durably appended to a
 *   JSONL file via a mutex-serialized write, then reflected in memory if
 *   {@link loaded} is true.
 */
export class AgentSseLog {
  private readonly events: SseEvent[] = [];
  private readonly newEventWaiters = new Set<() => void>();
  private readonly filePath: string | null;
  private readonly mutex = new Mutex();

  /** True when the in-memory array is the authoritative view of all events. */
  private loaded: boolean;

  constructor(filePath?: string) {
    this.filePath = filePath ?? null;
    this.loaded = this.filePath === null;
  }

  /** Appends an event to the log and wakes all waiting readers. */
  async append(event: SseEvent): Promise<void> {
    if (this.filePath === null) {
      this.events.push(event);
      this.notifyWaiters();
      return;
    }

    const release = await this.mutex.acquire();
    try {
      await mkdir(path.dirname(this.filePath), {recursive: true});
      await appendFile(this.filePath, JSON.stringify(event) + '\n');
      if (this.loaded) {
        this.events.push(event);
        this.notifyWaiters();
      }
    } finally {
      release();
    }
  }

  /**
   * Creates a reader that replays events from {@link startIndex},
   * then blocks waiting for new events until the signal is aborted.
   * Abort ends iteration silently.
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
      while (cursor < this.events.length) {
        yield this.events[cursor];
        cursor++;
        if (signal?.aborted) return;
      }

      // Wait for new events or abort.
      const aborted = await this.waitForAppendOrAbort(signal);
      if (aborted) return;
    }
  }

  /**
   * Returns a promise that resolves when a waiter notification fires
   * or the signal aborts. Returns `true` if aborted, `false` otherwise.
   */
  private waitForAppendOrAbort(signal?: AbortSignal): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const cleanup = (): void => {
        this.newEventWaiters.delete(onNotify);
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

      this.newEventWaiters.add(onNotify);

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
    const current = [...this.newEventWaiters];
    this.newEventWaiters.clear();
    for (const notify of current) {
      notify();
    }
  }
}
