import {act, render, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import type {Fetcher} from './useInfiniteList.js';
import {useInfiniteScroll} from './useInfiniteScroll.js';

/** Captures every constructed IntersectionObserver; jsdom has none. */
class IntersectionObserverStub {
  static instances: IntersectionObserverStub[] = [];
  callback: IntersectionObserverCallback;
  disconnected = false;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    IntersectionObserverStub.instances.push(this);
  }
  observe(): void {
    // Intentionally unused: the hook only needs construct + disconnect tracking.
  }
  unobserve(): void {
    // Intentionally unused: the hook only needs construct + disconnect tracking.
  }
  disconnect(): void {
    this.disconnected = true;
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  /** Simulate the sentinel scrolling into view. */
  fire(): void {
    this.callback(
      [{isIntersecting: true} as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
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
  IntersectionObserverStub.instances = [];
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useInfiniteScroll', () => {
  it('reuses one IntersectionObserver across page loads while hasMore stays true', async () => {
    const fetcher: Fetcher<{id: number}> = (offset, limit) => {
      return Promise.resolve({
        items: Array.from({length: limit}, (_v, i) => ({id: offset + i})),
        total: 100,
      });
    };

    const {getByTestId} = render(<Harness fetcher={fetcher} />);

    await waitFor(() => {
      expect(getByTestId('count').textContent).toBe('2');
    });
    expect(IntersectionObserverStub.instances).toHaveLength(1);

    // Load two more pages by firing the (single) observer.
    for (const expected of ['4', '6']) {
      await act(() => {
        IntersectionObserverStub.instances.at(-1)?.fire();
        return Promise.resolve();
      });
      await waitFor(() => {
        expect(getByTestId('count').textContent).toBe(expected);
      });
    }

    // hasMore never flipped, so the observer must not have been rebuilt.
    expect(IntersectionObserverStub.instances).toHaveLength(1);
    expect(IntersectionObserverStub.instances[0].disconnected).toBe(false);
  });
});
