import {useCallback, useEffect, useRef, useState} from 'react';

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
  const refreshGenerationId = useRef(0);

  const refresh = useCallback(() => {
    refreshGenerationId.current += 1;
    setRefreshKey((prev) => prev + 1);
  }, []);

  // Initial load / refresh
  useEffect(() => {
    let cancelled = false;

    async function fetchFirstPage() {
      setIsLoadingInitial(true);
      setError(null);
      try {
        const page = await fetcher(0, pageSize);
        if (!cancelled) {
          setItems(page.items);
          setTotal(page.total);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingInitial(false);
        }
      }
    }

    void fetchFirstPage();

    return () => {
      cancelled = true;
    };
  }, [fetcher, pageSize, refreshKey]);

  const hasMore = items.length < total;

  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) {
      return;
    }

    setIsLoadingMore(true);
    const currentRefreshGenerationId = refreshGenerationId.current;
    const offset = items.length;

    async function fetchNextPage() {
      try {
        const page = await fetcher(offset, pageSize);
        if (currentRefreshGenerationId !== refreshGenerationId.current) {
          return;
        }
        setItems((prev) => [...prev, ...page.items]);
        setTotal(page.total);
      } catch (e: unknown) {
        if (currentRefreshGenerationId !== refreshGenerationId.current) {
          return;
        }
        setError(e instanceof Error ? e.message : 'Failed to load more');
      } finally {
        if (currentRefreshGenerationId === refreshGenerationId.current) {
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
  };
}
