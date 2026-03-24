import {useCallback, useEffect, useRef} from 'react';

const NEAR_BOTTOM_THRESHOLD = 100;

/**
 * Returns a ref to attach to a scrollable container.
 * Auto-scrolls to the bottom when `deps` change,
 * but only if the user was near the bottom before the update.
 *
 * Tracks scroll position via a scroll listener so the decision
 * is based on the pre-render position, not the post-render one.
 */
export function useAutoScroll(deps: unknown[]) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    isNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('scroll', onScroll, {passive: true});
    return () => {
      el.removeEventListener('scroll', onScroll);
    };
  }, [onScroll]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return containerRef;
}
