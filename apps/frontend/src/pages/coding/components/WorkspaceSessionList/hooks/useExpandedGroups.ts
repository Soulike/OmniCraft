import {useCallback, useEffect, useState} from 'react';

interface UseExpandedGroupsResult {
  readonly expandedGroups: ReadonlySet<string>;
  readonly toggleGroup: (groupKey: string, isExpanded: boolean) => void;
  readonly expandGroup: (groupKey: string) => void;
}

/**
 * Tracks which workspace groups are expanded. Seeds the set once from the
 * active session's group (`initialActiveGroupKey`), or — when no session is
 * active — from `initialFallbackGroupKey` (the most-recent group), so the
 * panel opens with content. Only the first non-null seed is consumed; after
 * that the user controls expansion.
 */
export function useExpandedGroups(
  initialActiveGroupKey: string | null,
  initialFallbackGroupKey: string | null = null,
): UseExpandedGroupsResult {
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (seeded) {
      return;
    }
    const seedKey = initialActiveGroupKey ?? initialFallbackGroupKey;
    if (seedKey === null) {
      return;
    }
    setExpandedGroups(new Set([seedKey]));
    setSeeded(true);
  }, [seeded, initialActiveGroupKey, initialFallbackGroupKey]);

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
