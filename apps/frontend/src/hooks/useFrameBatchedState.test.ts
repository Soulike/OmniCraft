import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {createFrameBatchScheduler} from './useFrameBatchedState.js';

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
// Tests
// ---------------------------------------------------------------------------
describe('createFrameBatchScheduler', () => {
  it('does not flush synchronously', () => {
    const onFlush = vi.fn();
    const scheduler = createFrameBatchScheduler<number>(onFlush);

    scheduler.enqueue((n) => n + 1);

    expect(onFlush).not.toHaveBeenCalled();
  });

  it('flushes enqueued transforms on the next frame', () => {
    let state = 0;
    const scheduler = createFrameBatchScheduler<number>((composed) => {
      state = composed(state);
    });

    scheduler.enqueue((n) => n + 1);
    flushRaf();

    expect(state).toBe(1);
  });

  it('composes multiple transforms into a single flush', () => {
    let state = 0;
    const onFlush = vi.fn((composed: (prev: number) => number) => {
      state = composed(state);
    });
    const scheduler = createFrameBatchScheduler<number>(onFlush);

    scheduler.enqueue((n) => n + 1);
    scheduler.enqueue((n) => n + 10);
    scheduler.enqueue((n) => n * 2);
    flushRaf();

    // (0 + 1 + 10) * 2 = 22
    expect(state).toBe(22);
    // onFlush should be called exactly once (batched)
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('schedules only one rAF per batch', () => {
    const scheduler = createFrameBatchScheduler<number>(vi.fn());

    scheduler.enqueue((n) => n + 1);
    scheduler.enqueue((n) => n + 2);
    scheduler.enqueue((n) => n + 3);

    expect(rafCallbacks.size).toBe(1);
  });

  it('allows new batches after a flush', () => {
    let state = 0;
    const scheduler = createFrameBatchScheduler<number>((composed) => {
      state = composed(state);
    });

    scheduler.enqueue((n) => n + 1);
    flushRaf();
    expect(state).toBe(1);

    scheduler.enqueue((n) => n + 5);
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

    scheduler.enqueue((n) => n + 1);
    scheduler.cancel();
    flushRaf();

    expect(onFlush).not.toHaveBeenCalled();
  });

  it('can enqueue again after cancel', () => {
    let state = 0;
    const scheduler = createFrameBatchScheduler<number>((composed) => {
      state = composed(state);
    });

    scheduler.enqueue((n) => n + 1);
    scheduler.cancel();
    flushRaf();
    expect(state).toBe(0);

    scheduler.enqueue((n) => n + 5);
    flushRaf();
    expect(state).toBe(5);
  });

  it('applies transforms in enqueue order', () => {
    const order: string[] = [];
    let state = '';
    const scheduler = createFrameBatchScheduler<string>((composed) => {
      state = composed(state);
    });

    scheduler.enqueue((s) => {
      order.push('a');
      return s + 'a';
    });
    scheduler.enqueue((s) => {
      order.push('b');
      return s + 'b';
    });
    scheduler.enqueue((s) => {
      order.push('c');
      return s + 'c';
    });
    flushRaf();

    expect(state).toBe('abc');
    expect(order).toEqual(['a', 'b', 'c']);
  });
});
