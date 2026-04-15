import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

export interface FrameBatchScheduler<T> {
  /**
   * Accepts the same argument as React's `setState` — either a new value
   * or an updater function `(prev) => next`. All actions enqueued within
   * the same animation frame are composed and applied as a single state
   * update.
   */
  setState: Dispatch<SetStateAction<T>>;
  /** Cancels any pending flush and discards queued actions. */
  cancel: () => void;
}

/**
 * Resolves a {@link SetStateAction} against the current state.
 *
 * Exported for testing — consumers should prefer {@link useFrameBatchedState}.
 */
export function resolveAction<T>(action: SetStateAction<T>, prev: T): T {
  // React uses the same `typeof` check internally.  When `T` is itself
  // a function type the caller must always use the updater form.
  return typeof action === 'function'
    ? (action as (prev: T) => T)(prev)
    : action;
}

/**
 * Creates a scheduler that coalesces {@link SetStateAction}s within a
 * single `requestAnimationFrame` window and flushes them as one composed
 * update.
 *
 * Exported for testing — consumers should prefer {@link useFrameBatchedState}.
 */
export function createFrameBatchScheduler<T>(
  onFlush: Dispatch<SetStateAction<T>>,
): FrameBatchScheduler<T> {
  let queue: SetStateAction<T>[] = [];
  let rafId: number | null = null;

  function flush(): void {
    rafId = null;
    const actions = queue;
    if (actions.length === 0) return;
    queue = [];
    onFlush((prev) => {
      let state = prev;
      for (const action of actions) {
        state = resolveAction(action, state);
      }
      return state;
    });
  }

  function setState(action: SetStateAction<T>): void {
    queue.push(action);
    rafId ??= requestAnimationFrame(flush);
  }

  function cancel(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
    rafId = null;
    queue = [];
  }

  return {setState, cancel};
}

/**
 * Drop-in replacement for `useState` that batches updates per animation
 * frame.
 *
 * The returned setter has the same signature as React's `setState` —
 * it accepts either a new value or an updater `(prev) => next`. When
 * updates arrive faster than the frame rate (e.g. replaying historical
 * SSE events), they are composed into a single state transition so the
 * component sees only the final result in one render. When updates are
 * sparse (e.g. live streaming tokens), each frame contains at most one
 * update and behaviour is equivalent to a direct `setState`.
 */
export function useFrameBatchedState<T>(
  initialState: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState(initialState);

  const schedulerRef = useRef<FrameBatchScheduler<T> | null>(null);
  schedulerRef.current ??= createFrameBatchScheduler<T>(setState);
  const scheduler = schedulerRef.current;

  const batchedSetState: Dispatch<SetStateAction<T>> = useCallback(
    (action: SetStateAction<T>) => {
      scheduler.setState(action);
    },
    [scheduler],
  );

  useEffect(() => {
    return () => {
      scheduler.cancel();
    };
  }, [scheduler]);

  return [state, batchedSetState];
}
