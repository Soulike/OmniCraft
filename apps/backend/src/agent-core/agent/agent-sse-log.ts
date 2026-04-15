import assert from 'node:assert';
import {appendFile, mkdir, readFile, writeFile} from 'node:fs/promises';
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
 *
 * Three-state lifecycle for file-backed mode:
 * - Cold (no readers): loaded=false, events=[]. Append only writes to file.
 * - Hot (has readers): loaded=true, events populated. Append writes to both.
 * - Transition Cold→Hot: first reader calls ensureLoaded().
 * - Transition Hot→Cold: last reader calls unload().
 */
export class AgentSseLog {
  private readonly events: SseEvent[] = [];
  private readonly newEventWaiters = new Set<() => void>();
  private readonly filePath: string | null;
  private readonly mutex = new Mutex();

  /** True when the in-memory array is the authoritative view of all events. */
  private loaded: boolean;

  private readerCount = 0;

  constructor(filePath?: string) {
    this.filePath = filePath ?? null;
    this.loaded = this.filePath === null;
  }

  get activeReaderCount(): number {
    return this.readerCount;
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

    const isFirstReader = this.readerCount === 0;
    this.readerCount++;

    if (isFirstReader && this.filePath !== null && !this.loaded) {
      await this.ensureLoaded();
    }

    try {
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
    } finally {
      this.readerCount--;
      if (this.readerCount === 0 && this.filePath !== null) {
        this.unload();
      }
    }
  }

  /**
   * Reads all events from the file into memory and sets loaded=true.
   * If the file has a corrupted line, discards it and all subsequent lines,
   * then rewrites the file with only the valid events.
   */
  private async ensureLoaded(): Promise<void> {
    assert(this.filePath, 'ensureLoaded called without filePath');

    const release = await this.mutex.acquire();
    try {
      let content: string;
      try {
        content = await readFile(this.filePath, 'utf-8');
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'ENOENT'
        ) {
          this.loaded = true;
          return;
        }
        throw error;
      }

      if (content === '') {
        this.loaded = true;
        return;
      }

      const lines = content.split('\n');
      let needsRewrite = false;
      for (const line of lines) {
        if (line === '') continue;
        try {
          const event = JSON.parse(line) as SseEvent;
          this.events.push(event);
        } catch {
          needsRewrite = true;
          break;
        }
      }

      if (needsRewrite) {
        await writeFile(
          this.filePath,
          this.events.map((e) => JSON.stringify(e) + '\n').join(''),
        );
      }

      this.loaded = true;
    } finally {
      release();
    }
  }

  /** Drops in-memory state and returns to cold mode. */
  private unload(): void {
    this.events.length = 0;
    this.newEventWaiters.clear();
    this.loaded = false;
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
