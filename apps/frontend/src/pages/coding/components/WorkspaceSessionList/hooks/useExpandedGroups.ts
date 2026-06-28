import {useCallback, useEffect, useState} from 'react';

interface UseExpandedGroupsResult {
  readonly expanded: ReadonlySet<string>;
  readonly toggle: (key: string, isExpanded: boolean) => void;
  readonly expand: (key: string) => void;
}

/**
 * Tracks which workspace groups are expanded. Seeds the set once from the group
 * holding the active session (`seedKey`); thereafter the user controls it.
 */
export function useExpandedGroups(
  seedKey: string | null,
): UseExpandedGroupsResult {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (seeded || seedKey === null) {
      return;
    }
    setExpanded(new Set([seedKey]));
    setSeeded(true);
  }, [seeded, seedKey]);

  const toggle = useCallback((key: string, isExpanded: boolean) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (isExpanded) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }, []);

  const expand = useCallback((key: string) => {
    setExpanded((prev) => new Set(prev).add(key));
  }, []);

  return {expanded, toggle, expand};
}
