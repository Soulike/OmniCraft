import {useEffect, useRef} from 'react';

/**
 * Returns a ref to attach to a scrollable container.
 * Auto-scrolls to the bottom when `deps` change,
 * but only if the user is already near the bottom.
 */
export function useAutoScroll(deps: unknown[]) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;

    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return containerRef;
}
