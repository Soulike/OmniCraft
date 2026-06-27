import {act, cleanup, render, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import type {Fetcher} from './useInfiniteList.js';
import {useInfiniteScroll} from './useInfiniteScroll.js';

// jsdom has no IntersectionObserver. This stub lets a test control whether the
// sentinel is "on screen" (`intersecting`) and records every constructed
// instance so we can assert the observer is not rebuilt per page.
let intersecting = false;
let observers: IntersectionObserverStub[] = [];

class IntersectionObserverStub {
  callback: IntersectionObserverCallback;
  disconnected = false;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    observers.push(this);
  }
  observe(): void {
    // The real API delivers an initial callback for the observed target.
    this.deliver();
  }
  disconnect(): void {
    this.disconnected = true;
  }
  deliver(): void {
    this.callback(
      [{isIntersecting: intersecting} as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

/** Simulates the browser detecting an intersection change on every observer. */
function setIntersecting(value: boolean): void {
  intersecting = value;
  for (const observer of observers) {
    if (!observer.disconnected) {
      observer.deliver();
    }
  }
}

function Harness({fetcher}: {fetcher: Fetcher<{id: number}>}) {
  const {items, hasMore, sentinelRef} = useInfiniteScroll({
    fetcher,
    pageSize: 2,
  });
  return (
    <div>
      <span data-testid='count'>{items.length}</span>
      <span data-testid='hasMore'>{String(hasMore)}</span>
      {hasMore ? <div ref={sentinelRef} /> : null}
    </div>
  );
}

beforeEach(() => {
  intersecting = false;
  observers = [];
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useInfiniteScroll', () => {
  it('keeps loading while the sentinel stays visible until no more data remains', async () => {
    intersecting = true;
    const fetcher: Fetcher<{id: number}> = (offset, limit) =>
      Promise.resolve({
        items: Array.from({length: Math.min(limit, 6 - offset)}, (_v, i) => ({
          id: offset + i,
        })),
        total: 6,
      });

    const {getByTestId} = render(<Harness fetcher={fetcher} />);

    // A continuously-visible sentinel chains pages to the data boundary
    // without any per-page scroll event.
    await waitFor(() => {
      expect(getByTestId('count').textContent).toBe('6');
    });
    expect(getByTestId('hasMore').textContent).toBe('false');
    // Built once for the hasMore window, not rebuilt per page.
    expect(observers).toHaveLength(1);
  });

  it('does not load while the sentinel is hidden, and resumes when it becomes visible', async () => {
    intersecting = false;
    const offsets: number[] = [];
    const fetcher: Fetcher<{id: number}> = (offset, limit) => {
      offsets.push(offset);
      return Promise.resolve({
        items: Array.from({length: Math.min(limit, 4 - offset)}, (_v, i) => ({
          id: offset + i,
        })),
        total: 4,
      });
    };

    const {getByTestId} = render(<Harness fetcher={fetcher} />);

    await waitFor(() => {
      expect(getByTestId('count').textContent).toBe('2');
    });

    // Hidden sentinel → must not auto-load the next page.
    await act(async () => {
      await Promise.resolve();
    });
    expect(getByTestId('count').textContent).toBe('2');
    expect(getByTestId('hasMore').textContent).toBe('true');
    expect(offsets).toEqual([0]);

    // Becomes visible → loads the next page, then stops at the data boundary.
    act(() => {
      setIntersecting(true);
    });
    await waitFor(() => {
      expect(getByTestId('count').textContent).toBe('4');
    });
    expect(getByTestId('hasMore').textContent).toBe('false');
  });

  it('stops loading once the sentinel is pushed out of view, even with more data', async () => {
    intersecting = true;
    const offsets: number[] = [];
    let resolveNext: (() => void) | null = null;
    const fetcher: Fetcher<{id: number}> = (offset, limit) => {
      offsets.push(offset);
      return new Promise((resolve) => {
        resolveNext = () => {
          resolve({
            items: Array.from({length: limit}, (_v, i) => ({id: offset + i})),
            total: 100,
          });
        };
      });
    };

    const {getByTestId} = render(<Harness fetcher={fetcher} />);

    // Resolve the initial page (offset 0).
    await act(async () => {
      resolveNext?.();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(getByTestId('count').textContent).toBe('2');
    });

    // Sentinel visible → the next page (offset 2) is requested.
    await waitFor(() => {
      expect(offsets).toContain(2);
    });

    // Simulate that page filling the viewport: the sentinel leaves the screen
    // before the page resolves.
    act(() => {
      setIntersecting(false);
    });
    await act(async () => {
      resolveNext?.();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(getByTestId('count').textContent).toBe('4');
    });

    // Hidden now → must not request offset 4 even though hasMore is true.
    await act(async () => {
      await Promise.resolve();
    });
    expect(offsets).not.toContain(4);
    expect(getByTestId('hasMore').textContent).toBe('true');
  });
});
