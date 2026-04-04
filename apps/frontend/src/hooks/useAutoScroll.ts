import {useCallback, useEffect, useRef} from 'react';

const NEAR_BOTTOM_THRESHOLD = 100;

/**
 * Returns a ref to attach to a scrollable container.
 * Auto-scrolls to the bottom whenever the container's content grows,
 * but only if the user was already near the bottom.
 *
 * Uses MutationObserver to detect content changes (including
 * non-React updates like requestAnimationFrame animations),
 * so it works with streaming text that grows outside the React
 * render cycle.
 */
export function useAutoScroll() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);
  const isSmoothScrollingRef = useRef(false);

  const updateIsNearBottom = useCallback(() => {
    if (isSmoothScrollingRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    isNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD;
  }, []);

  const autoScrollToBottom = useCallback(() => {
    if (isSmoothScrollingRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    if (isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    isNearBottomRef.current = true;

    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance < 1) return;

    isSmoothScrollingRef.current = true;
    el.addEventListener(
      'scrollend',
      () => {
        isSmoothScrollingRef.current = false;
      },
      {once: true},
    );
    el.scrollTo({top: el.scrollHeight, behavior: 'smooth'});
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener('scroll', updateIsNearBottom, {passive: true});

    const observer = new MutationObserver(autoScrollToBottom);
    observer.observe(el, {childList: true, subtree: true, characterData: true});

    return () => {
      el.removeEventListener('scroll', updateIsNearBottom);
      observer.disconnect();
    };
  }, [updateIsNearBottom, autoScrollToBottom]);

  return {containerRef, scrollToBottom};
}
