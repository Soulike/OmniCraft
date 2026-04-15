import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {
  createFrameBatchScheduler,
  resolveAction,
} from './useFrameBatchedState.js';

// ---------------------------------------------------------------------------
// rAF mock — vitest runs in Node where rAF is unavailable.
// ---------------------------------------------------------------------------
let rafCallbacks: Map<number, () => void>;
let nextRafId: number;

function mockRaf(cb: () => void): number {
  const id = nextRafId++;
  rafCallbacks.set(id, cb);
  return id;
}

function mockCancelRaf(id: number): void {
  rafCallbacks.delete(id);
}

/** Simulates advancing one animation frame — fires all pending rAF callbacks. */
function flushRaf(): void {
  const cbs = [...rafCallbacks.values()];
  rafCallbacks.clear();
  for (const cb of cbs) {
    cb();
  }
}

beforeEach(() => {
  rafCallbacks = new Map();
  nextRafId = 1;
  vi.stubGlobal('requestAnimationFrame', mockRaf);
  vi.stubGlobal('cancelAnimationFrame', mockCancelRaf);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// resolveAction
// ---------------------------------------------------------------------------
describe('resolveAction', () => {
  it('returns the value directly when given a non-function', () => {
    expect(resolveAction(42, 0)).toBe(42);
  });

  it('calls the updater with prev when given a function', () => {
    expect(resolveAction((prev: number) => prev + 1, 10)).toBe(11);
  });
});

// ---------------------------------------------------------------------------
// createFrameBatchScheduler
// ---------------------------------------------------------------------------
describe('createFrameBatchScheduler', () => {
  it('does not flush synchronously', () => {
    const onFlush = vi.fn();
    const scheduler = createFrameBatchScheduler<number>(onFlush);

    scheduler.setState((n) => n + 1);

    expect(onFlush).not.toHaveBeenCalled();
  });

  it('flushes updaters on the next frame', () => {
    let state = 0;
    const scheduler = createFrameBatchScheduler<number>((action) => {
      state = resolveAction(action, state);
    });

    scheduler.setState((n) => n + 1);
    flushRaf();

    expect(state).toBe(1);
  });

  it('composes multiple updaters into a single flush', () => {
    let state = 0;
    const onFlush = vi.fn((action: number | ((prev: number) => number)) => {
      state = resolveAction(action, state);
    });
    const scheduler = createFrameBatchScheduler<number>(onFlush);

    scheduler.setState((n) => n + 1);
    scheduler.setState((n) => n + 10);
    scheduler.setState((n) => n * 2);
    flushRaf();

    // (0 + 1 + 10) * 2 = 22
    expect(state).toBe(22);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('accepts direct values alongside updaters', () => {
    let state = 0;
    const scheduler = createFrameBatchScheduler<number>((action) => {
      state = resolveAction(action, state);
    });

    scheduler.setState((n) => n + 5); // 0 + 5 = 5
    scheduler.setState(100); // replace with 100
    scheduler.setState((n) => n + 1); // 100 + 1 = 101
    flushRaf();

    expect(state).toBe(101);
  });

  it('handles direct value as the only action', () => {
    let state = 'old';
    const scheduler = createFrameBatchScheduler<string>((action) => {
      state = resolveAction(action, state);
    });

    scheduler.setState('new');
    flushRaf();

    expect(state).toBe('new');
  });

  it('schedules only one rAF per batch', () => {
    const scheduler = createFrameBatchScheduler<number>(vi.fn());

    scheduler.setState((n) => n + 1);
    scheduler.setState((n) => n + 2);
    scheduler.setState((n) => n + 3);

    expect(rafCallbacks.size).toBe(1);
  });

  it('allows new batches after a flush', () => {
    let state = 0;
    const scheduler = createFrameBatchScheduler<number>((action) => {
      state = resolveAction(action, state);
    });

    scheduler.setState((n) => n + 1);
    flushRaf();
    expect(state).toBe(1);

    scheduler.setState((n) => n + 5);
    flushRaf();
    expect(state).toBe(6);
  });

  it('does nothing when flushing an empty queue', () => {
    const onFlush = vi.fn();
    createFrameBatchScheduler<number>(onFlush);

    flushRaf();

    expect(onFlush).not.toHaveBeenCalled();
  });

  it('cancel prevents the pending flush', () => {
    const onFlush = vi.fn();
    const scheduler = createFrameBatchScheduler<number>(onFlush);

    scheduler.setState((n) => n + 1);
    scheduler.cancel();
    flushRaf();

    expect(onFlush).not.toHaveBeenCalled();
  });

  it('can enqueue again after cancel', () => {
    let state = 0;
    const scheduler = createFrameBatchScheduler<number>((action) => {
      state = resolveAction(action, state);
    });

    scheduler.setState((n) => n + 1);
    scheduler.cancel();
    flushRaf();
    expect(state).toBe(0);

    scheduler.setState((n) => n + 5);
    flushRaf();
    expect(state).toBe(5);
  });

  it('applies actions in order', () => {
    const order: string[] = [];
    let state = '';
    const scheduler = createFrameBatchScheduler<string>((action) => {
      state = resolveAction(action, state);
    });

    scheduler.setState((s) => {
      order.push('a');
      return s + 'a';
    });
    scheduler.setState((s) => {
      order.push('b');
      return s + 'b';
    });
    scheduler.setState((s) => {
      order.push('c');
      return s + 'c';
    });
    flushRaf();

    expect(state).toBe('abc');
    expect(order).toEqual(['a', 'b', 'c']);
  });
});
