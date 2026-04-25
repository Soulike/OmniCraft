import {useEffect, useMemo, useState} from 'react';

import {
  getExpandedSettingsGroupIds,
  type SettingsNavItem,
} from '../helpers/settings-navigation.js';

export function useExpandedSettingsGroups(
  selectedItemId: string,
  items: readonly SettingsNavItem[],
) {
  const selectedGroupIds = useMemo(
    () => getExpandedSettingsGroupIds(selectedItemId, items),
    [items, selectedItemId],
  );
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(
    () => new Set(selectedGroupIds),
  );

  useEffect(() => {
    setExpandedGroupIds((previousIds) => {
      const nextIds = new Set(previousIds);
      for (const id of selectedGroupIds) {
        nextIds.add(id);
      }
      return nextIds;
    });
  }, [selectedGroupIds]);

  return {expandedGroupIds, setExpandedGroupIds};
}
