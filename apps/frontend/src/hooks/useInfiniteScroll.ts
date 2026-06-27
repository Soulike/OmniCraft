import type {RefObject} from 'react';
import {useEffect, useEffectEvent, useRef} from 'react';

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

  // Calling loadMore is non-reactive: the observer should not be rebuilt just
  // because loadMore's identity changed (it changes on every page append).
  const onSentinelVisible = useEffectEvent(() => {
    loadMore();
  });

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onSentinelVisible();
        }
      },
      {threshold: 0},
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [hasMore]);

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
