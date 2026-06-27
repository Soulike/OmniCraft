import type {RefObject} from 'react';
import {useEffect, useEffectEvent, useRef, useState} from 'react';

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
  sentinelRef: RefObject<HTMLDivElement | null>;
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

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [sentinelVisible, setSentinelVisible] = useState(false);

  // The observer's only job is to keep `sentinelVisible` in sync with whether
  // the sentinel is on screen. It is built once per `hasMore` window (when the
  // sentinel mounts/unmounts), never rebuilt per page.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        setSentinelVisible(entries[0]?.isIntersecting ?? false);
      },
      {threshold: 0},
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
      setSentinelVisible(false);
    };
  }, [hasMore]);

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
