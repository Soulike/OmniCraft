import {useCallback, useEffect, useRef, useState} from 'react';

type Transform<T> = (prev: T) => T;

export interface FrameBatchScheduler<T> {
  /**
   * Enqueues a state transform. All transforms enqueued within the same
   * animation frame are composed and applied as a single state update.
   */
  enqueue: (fn: Transform<T>) => void;
  /** Cancels any pending flush. */
  cancel: () => void;
}

/**
 * Creates a scheduler that coalesces {@link Transform} functions within a
 * single `requestAnimationFrame` window and flushes them as one composed
 * transform.
 *
 * Exported for testing — consumers should prefer {@link useFrameBatchedState}.
 */
export function createFrameBatchScheduler<T>(
  onFlush: (composed: Transform<T>) => void,
): FrameBatchScheduler<T> {
  let queue: Transform<T>[] = [];
  let rafId = 0;

  function flush(): void {
    rafId = 0;
    const transforms = queue;
    if (transforms.length === 0) return;
    queue = [];
    onFlush((prev) => {
      let state = prev;
      for (const fn of transforms) {
        state = fn(state);
      }
      return state;
    });
  }

  function enqueue(fn: Transform<T>): void {
    queue.push(fn);
    if (rafId === 0) {
      rafId = requestAnimationFrame(flush);
    }
  }

  function cancel(): void {
    cancelAnimationFrame(rafId);
    rafId = 0;
    queue = [];
  }

  return {enqueue, cancel};
}

/**
 * Like `useState`, but batches state updates per animation frame.
 *
 * Instead of calling the setter on every event (which may cause intermediate
 * renders during rapid updates), transforms are queued and flushed once per
 * `requestAnimationFrame`. When updates arrive faster than the frame rate
 * (e.g. replaying historical events), they are composed into a single state
 * transition — the component sees only the final result in one render.
 * When updates are sparse (e.g. live streaming tokens), each frame contains
 * at most one transform and behaviour is equivalent to a direct `setState`.
 */
export function useFrameBatchedState<T>(
  initialState: T | (() => T),
): [T, (fn: Transform<T>) => void] {
  const [state, setState] = useState(initialState);

  const schedulerRef = useRef<FrameBatchScheduler<T> | null>(null);
  schedulerRef.current ??= createFrameBatchScheduler<T>(setState);
  const scheduler = schedulerRef.current;

  const enqueue = useCallback(
    (fn: Transform<T>) => {
      scheduler.enqueue(fn);
    },
    [scheduler],
  );

  useEffect(() => {
    return () => {
      scheduler.cancel();
    };
  }, [scheduler]);

  return [state, enqueue];
}
