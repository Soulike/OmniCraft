import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {
  applySetStateAction,
  createFrameBatchScheduler,
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
// applySetStateAction
// ---------------------------------------------------------------------------
describe('applySetStateAction', () => {
  it('returns the value directly when given a non-function', () => {
    expect(applySetStateAction(42, 0)).toBe(42);
  });

  it('calls the updater with prev when given a function', () => {
    expect(applySetStateAction((prev: number) => prev + 1, 10)).toBe(11);
  });
});

// ---------------------------------------------------------------------------
// createFrameBatchScheduler
// ---------------------------------------------------------------------------
describe('createFrameBatchScheduler', () => {
  it('does not flush synchronously', () => {
    const onFlush = vi.fn();
    const scheduler = createFrameBatchScheduler<number>(onFlush);

    scheduler.pushSetStateAction((n) => n + 1);

    expect(onFlush).not.toHaveBeenCalled();
  });

  it('flushes updaters on the next frame', () => {
    let state = 0;
    const scheduler = createFrameBatchScheduler<number>((action) => {
      state = applySetStateAction(action, state);
    });

    scheduler.pushSetStateAction((n) => n + 1);
    flushRaf();

    expect(state).toBe(1);
  });

  it('composes multiple updaters into a single flush', () => {
    let state = 0;
    const onFlush = vi.fn((action: number | ((prev: number) => number)) => {
      state = applySetStateAction(action, state);
    });
    const scheduler = createFrameBatchScheduler<number>(onFlush);

    scheduler.pushSetStateAction((n) => n + 1);
    scheduler.pushSetStateAction((n) => n + 10);
    scheduler.pushSetStateAction((n) => n * 2);
    flushRaf();

    // (0 + 1 + 10) * 2 = 22
    expect(state).toBe(22);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('accepts direct values alongside updaters', () => {
    let state = 0;
    const scheduler = createFrameBatchScheduler<number>((action) => {
      state = applySetStateAction(action, state);
    });

    scheduler.pushSetStateAction((n) => n + 5); // 0 + 5 = 5
    scheduler.pushSetStateAction(100); // replace with 100
    scheduler.pushSetStateAction((n) => n + 1); // 100 + 1 = 101
    flushRaf();

    expect(state).toBe(101);
  });

  it('handles direct value as the only action', () => {
    let state = 'old';
    const scheduler = createFrameBatchScheduler<string>((action) => {
      state = applySetStateAction(action, state);
    });

    scheduler.pushSetStateAction('new');
    flushRaf();

    expect(state).toBe('new');
  });

  it('schedules only one rAF per batch', () => {
    const scheduler = createFrameBatchScheduler<number>(vi.fn());

    scheduler.pushSetStateAction((n) => n + 1);
    scheduler.pushSetStateAction((n) => n + 2);
    scheduler.pushSetStateAction((n) => n + 3);

    expect(rafCallbacks.size).toBe(1);
  });

  it('allows new batches after a flush', () => {
    let state = 0;
    const scheduler = createFrameBatchScheduler<number>((action) => {
      state = applySetStateAction(action, state);
    });

    scheduler.pushSetStateAction((n) => n + 1);
    flushRaf();
    expect(state).toBe(1);

    scheduler.pushSetStateAction((n) => n + 5);
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

    scheduler.pushSetStateAction((n) => n + 1);
    scheduler.cancel();
    flushRaf();

    expect(onFlush).not.toHaveBeenCalled();
  });

  it('can enqueue again after cancel', () => {
    let state = 0;
    const scheduler = createFrameBatchScheduler<number>((action) => {
      state = applySetStateAction(action, state);
    });

    scheduler.pushSetStateAction((n) => n + 1);
    scheduler.cancel();
    flushRaf();
    expect(state).toBe(0);

    scheduler.pushSetStateAction((n) => n + 5);
    flushRaf();
    expect(state).toBe(5);
  });

  it('applies actions in order', () => {
    const order: string[] = [];
    let state = '';
    const scheduler = createFrameBatchScheduler<string>((action) => {
      state = applySetStateAction(action, state);
    });

    scheduler.pushSetStateAction((s) => {
      order.push('a');
      return s + 'a';
    });
    scheduler.pushSetStateAction((s) => {
      order.push('b');
      return s + 'b';
    });
    scheduler.pushSetStateAction((s) => {
      order.push('c');
      return s + 'c';
    });
    flushRaf();

    expect(state).toBe('abc');
    expect(order).toEqual(['a', 'b', 'c']);
  });
});
