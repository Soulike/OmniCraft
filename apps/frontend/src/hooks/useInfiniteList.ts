import {useCallback, useEffect, useRef, useState} from 'react';

const PAGE_SIZE = 20;

interface Page<T> {
  items: readonly T[];
  total: number;
}

type Fetcher<T> = (offset: number, limit: number) => Promise<Page<T>>;

interface UseInfiniteListReturn<T> {
  items: readonly T[];
  isLoading: boolean;
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
export function useInfiniteList<T>(
  fetcher: Fetcher<T>,
): UseInfiniteListReturn<T> {
  const [items, setItems] = useState<readonly T[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const offsetRef = useRef(0);

  const refresh = useCallback(() => {
    offsetRef.current = 0;
    setRefreshKey((prev) => prev + 1);
  }, []);

  // Initial load / refresh
  useEffect(() => {
    let cancelled = false;

    async function fetchFirstPage() {
      setIsLoading(true);
      setError(null);
      try {
        const page = await fetcher(0, PAGE_SIZE);
        if (!cancelled) {
          setItems(page.items);
          setTotal(page.total);
          offsetRef.current = page.items.length;
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchFirstPage();

    return () => {
      cancelled = true;
    };
  }, [fetcher, refreshKey]);

  const hasMore = offsetRef.current < total;

  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) {
      return;
    }

    setIsLoadingMore(true);

    void (async () => {
      try {
        const page = await fetcher(offsetRef.current, PAGE_SIZE);
        setItems((prev) => [...prev, ...page.items]);
        setTotal(page.total);
        offsetRef.current += page.items.length;
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load more');
      } finally {
        setIsLoadingMore(false);
      }
    })();
  }, [fetcher, isLoadingMore, hasMore]);

  return {items, isLoading, isLoadingMore, error, hasMore, loadMore, refresh};
}
