import {act, renderHook, waitFor} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import type {Fetcher} from './useInfiniteList.js';
import {useInfiniteList} from './useInfiniteList.js';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Underlying spy shared by every inline fetcher so we can count real calls. */
function makeUnderlying(total: number) {
  return vi.fn((offset: number, limit: number) =>
    Promise.resolve({
      items: Array.from({length: Math.min(limit, total - offset)}, (_v, i) => ({
        id: offset + i,
      })),
      total,
    }),
  );
}

describe('useInfiniteList', () => {
  it('fetches the first page once even when the fetcher identity changes every render', async () => {
    const underlying = makeUnderlying(10);
    // Each render hands the hook a brand-new inline fetcher, exactly like a
    // caller that defines `async (o, l) => {…}` inside its render body.
    const makeFetcher = (): Fetcher<{id: number}> => (o, l) => underlying(o, l);

    const {rerender, result} = renderHook(
      ({fetcher}) => useInfiniteList({fetcher, pageSize: 2}),
      {initialProps: {fetcher: makeFetcher()}},
    );

    act(() => {
      rerender({fetcher: makeFetcher()});
    });
    act(() => {
      rerender({fetcher: makeFetcher()});
    });

    // Wait for the initial fetch to settle so the count reflects real Effect
    // runs rather than passing vacuously if the fetch is ever deferred.
    await waitFor(() => {
      expect(result.current.isLoadingInitial).toBe(false);
    });

    const firstPageCalls = underlying.mock.calls.filter(
      ([offset]) => offset === 0,
    ).length;
    expect(firstPageCalls).toBe(1);
  });

  it('refetches the first page when refresh() is called', async () => {
    const underlying = makeUnderlying(10);
    const fetcher: Fetcher<{id: number}> = (o, l) => underlying(o, l);

    const {result} = renderHook(() => useInfiniteList({fetcher, pageSize: 2}));

    await waitFor(() => {
      expect(result.current.isLoadingInitial).toBe(false);
    });
    expect(underlying.mock.calls.filter(([o]) => o === 0).length).toBe(1);

    act(() => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(underlying.mock.calls.filter(([o]) => o === 0).length).toBe(2);
    });
  });
});
