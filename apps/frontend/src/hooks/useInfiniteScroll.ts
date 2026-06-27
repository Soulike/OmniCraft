import type {RefCallback} from 'react';
import {useCallback, useEffect, useEffectEvent, useState} from 'react';

import type {Fetcher} from './useInfiniteList.js';
import {useInfiniteList} from './useInfiniteList.js';

interface UseInfiniteScrollOptions<T> {
  fetcher: Fetcher<T>;
  pageSize: number;
}

interface UseInfiniteScrollReturn<T> {
  items: readonly T[];
  isLoadingInitial: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  sentinelRef: RefCallback<HTMLDivElement>;
  refresh: () => void;
  backgroundRefresh: () => void;
}

/**
 * Combines {@link useInfiniteList} with an IntersectionObserver sentinel
 * for automatic infinite scrolling.
 *
 * @example
 * ```tsx
 * const {items, isLoadingMore, hasMore, sentinelRef} = useInfiniteScroll({
 *   fetcher: (offset, limit) => fetchItems(offset, limit),
 *   pageSize: 20,
 * });
 *
 * return (
 *   <ul>
 *     {items.map((item) => <li key={item.id}>{item.name}</li>)}
 *     {hasMore && <div ref={sentinelRef}>{isLoadingMore && <Spinner />}</div>}
 *   </ul>
 * );
 * ```
 */
export function useInfiniteScroll<T>({
  fetcher,
  pageSize,
}: UseInfiniteScrollOptions<T>): UseInfiniteScrollReturn<T> {
  const {
    items,
    isLoadingInitial,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
    backgroundRefresh,
  } = useInfiniteList<T>({fetcher, pageSize});

  const [sentinelVisible, setSentinelVisible] = useState(false);

  // The observer's lifecycle is the sentinel node's lifecycle. A stable
  // callback ref attaches the observer when the node mounts and (via the
  // returned cleanup, React 19) tears it down when it unmounts — so the
  // observer never needs to know about `hasMore`. That belongs to the load
  // decision below.
  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        setSentinelVisible(entries[0]?.isIntersecting ?? false);
      },
      {threshold: 0},
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      setSentinelVisible(false);
    };
  }, []);

  // Load the next page while the sentinel is visible and more remains. This
  // re-runs after each page commits (`items.length` grows), so a page that does
  // not fill the viewport keeps loading until the sentinel is pushed out of
  // view (the observer flips `sentinelVisible` to false) or `hasMore` becomes
  // false. `loadMore()` no-ops while a fetch is in flight, so it never
  // double-loads.
  const loadNextPage = useEffectEvent(() => {
    loadMore();
  });
  useEffect(() => {
    if (sentinelVisible && hasMore) {
      loadNextPage();
    }
  }, [sentinelVisible, hasMore, items.length]);

  return {
    items,
    isLoadingInitial,
    isLoadingMore,
    error,
    hasMore,
    sentinelRef,
    refresh,
    backgroundRefresh,
  };
}
