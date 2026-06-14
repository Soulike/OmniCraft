import {useCallback, useLayoutEffect, useRef, useState} from 'react';

export interface IndicatorStyle {
  transform: string;
  height: string;
}

/**
 * Measures the geometry of the currently-active nav item (the element
 * carrying `data-active="true"` inside the returned ref) so a single
 * absolutely-positioned indicator can slide to it. Recomputes when the
 * selection changes and when the list resizes.
 */
export function useActiveIndicator(selectedId: string) {
  const listRef = useRef<HTMLElement | null>(null);
  const [indicator, setIndicator] = useState<IndicatorStyle | null>(null);

  const measure = useCallback(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }
    const active = list.querySelector<HTMLElement>('[data-active="true"]');
    if (!active) {
      setIndicator(null);
      return;
    }
    setIndicator({
      transform: `translateY(${active.offsetTop}px)`,
      height: `${active.offsetHeight}px`,
    });
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, selectedId]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }
    const observer = new ResizeObserver(() => {
      measure();
    });
    observer.observe(list);
    return () => {
      observer.disconnect();
    };
  }, [measure]);

  return {listRef, indicator};
}
