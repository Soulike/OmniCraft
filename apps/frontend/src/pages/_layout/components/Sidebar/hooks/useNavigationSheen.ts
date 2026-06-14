import {useEffect, useRef, useState} from 'react';

/**
 * Returns a key that changes only when the selection actually changes from a
 * previous value (i.e. a genuine navigation), so a one-shot sheen element can
 * remount to replay its sweep on navigation without firing on initial page
 * load. Comparing against the previous id (rather than a first-render flag)
 * keeps it correct under StrictMode's double-invoked effects. Null until the
 * first navigation.
 */
export function useNavigationSheen(selectedId: string): string | null {
  const prevId = useRef(selectedId);
  const [sheenKey, setSheenKey] = useState<string | null>(null);

  useEffect(() => {
    if (selectedId === prevId.current) {
      return;
    }
    prevId.current = selectedId;
    setSheenKey(selectedId);
  }, [selectedId]);

  return sheenKey;
}
