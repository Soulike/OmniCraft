import {useCallback, useEffect, useEffectEvent, useRef, useState} from 'react';

interface Page<T> {
  items: readonly T[];
  total: number;
}

export type Fetcher<T> = (offset: number, limit: number) => Promise<Page<T>>;

interface UseInfiniteListOptions<T> {
  fetcher: Fetcher<T>;
  pageSize: number;
}

interface UseInfiniteListReturn<T> {
  items: readonly T[];
  isLoadingInitial: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
  backgroundRefresh: () => void;
}

/**
 * Generic infinite-list hook with offset/limit pagination.
 *
 * Manages initial load, load-more, and full refresh. The caller provides
 * a fetcher that returns a page of items plus the total count.
 */
export function useInfiniteList<T>({
  fetcher,
  pageSize,
}: UseInfiniteListOptions<T>): UseInfiniteListReturn<T> {
  const [items, setItems] = useState<readonly T[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Incremented on each refresh. loadMore captures this value before fetching
  // and discards results if it has changed, preventing stale pages from being
  // appended after a refresh has already replaced the list.
  const refreshGenerationIdRef = useRef(0);

  // Controls whether the next refresh shows a loading indicator.
  // true for the initial load and explicit refresh(), false for backgroundRefresh().
  const showLoadingRef = useRef(true);

  const refresh = useCallback(() => {
    showLoadingRef.current = true;
    refreshGenerationIdRef.current += 1;
    setRefreshKey((prev) => prev + 1);
  }, []);

  const backgroundRefresh = useCallback(() => {
    showLoadingRef.current = false;
    refreshGenerationIdRef.current += 1;
    setRefreshKey((prev) => prev + 1);
  }, []);

  // Loads the first page. Declared as an Effect Event so the Effect below can
  // read the latest `fetcher` without listing it as a dependency — callers
  // commonly pass a fresh inline fetcher on every render, which would otherwise
  // re-trigger a first-page fetch each render. `pageSize` is passed in so it
  // stays a genuine reactive trigger of the Effect.
  const fetchFirstPage = useEffectEvent(
    async (limit: number, isCancelled: () => boolean) => {
      if (showLoadingRef.current) {
        setIsLoadingInitial(true);
      }
      setError(null);
      try {
        const page = await fetcher(0, limit);
        if (isCancelled()) return;
        setItems(page.items);
        setTotal(page.total);
      } catch (e: unknown) {
        if (isCancelled()) return;
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!isCancelled()) {
          setIsLoadingInitial(false);
        }
      }
    },
  );

  // Initial load / refresh. Re-runs only when the page size changes or a
  // refresh is requested — not when the fetcher's identity changes.
  useEffect(() => {
    let cancelled = false;
    void fetchFirstPage(pageSize, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [pageSize, refreshKey]);

  const hasMore = items.length < total;

  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) {
      return;
    }

    setIsLoadingMore(true);
    const currentRefreshGenerationId = refreshGenerationIdRef.current;
    const offset = items.length;

    async function fetchNextPage() {
      try {
        const page = await fetcher(offset, pageSize);
        if (currentRefreshGenerationId !== refreshGenerationIdRef.current) {
          return;
        }
        setItems((prev) => [...prev, ...page.items]);
        setTotal(page.total);
      } catch (e: unknown) {
        if (currentRefreshGenerationId !== refreshGenerationIdRef.current) {
          return;
        }
        setError(e instanceof Error ? e.message : 'Failed to load more');
      } finally {
        if (currentRefreshGenerationId === refreshGenerationIdRef.current) {
          setIsLoadingMore(false);
        }
      }
    }

    void fetchNextPage();
  }, [fetcher, pageSize, isLoadingMore, hasMore, items.length]);

  return {
    items,
    isLoadingInitial,
    isLoadingMore,
    error,
    hasMore,
    loadMore,
    refresh,
    backgroundRefresh,
  };
}
