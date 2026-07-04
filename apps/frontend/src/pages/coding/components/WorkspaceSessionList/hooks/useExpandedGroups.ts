import {useCallback, useEffect, useState} from 'react';

interface UseExpandedGroupsResult {
  readonly expandedGroups: ReadonlySet<string>;
  readonly toggleGroup: (groupKey: string, isExpanded: boolean) => void;
  readonly expandGroup: (groupKey: string) => void;
}

/**
 * Tracks which workspace groups are expanded. Seeds the set once from the
 * active session's group (`initialActiveGroupKey`); only the first non-null
 * value is consumed, after which the user controls expansion.
 */
export function useExpandedGroups(
  initialActiveGroupKey: string | null,
): UseExpandedGroupsResult {
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (seeded || initialActiveGroupKey === null) {
      return;
    }
    setExpandedGroups(new Set([initialActiveGroupKey]));
    setSeeded(true);
  }, [seeded, initialActiveGroupKey]);

  const toggleGroup = useCallback((groupKey: string, isExpanded: boolean) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (isExpanded) {
        next.add(groupKey);
      } else {
        next.delete(groupKey);
      }
      return next;
    });
  }, []);

  const expandGroup = useCallback((groupKey: string) => {
    setExpandedGroups((prev) => new Set(prev).add(groupKey));
  }, []);

  return {expandedGroups, toggleGroup, expandGroup};
}
