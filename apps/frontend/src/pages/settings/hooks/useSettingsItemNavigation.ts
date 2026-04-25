import {useCallback} from 'react';
import {useNavigate} from 'react-router';

import {
  getSettingsPathByItemId,
  type SettingsNavItem,
} from '../helpers/settings-navigation.js';

export function useSettingsItemNavigation(items: readonly SettingsNavItem[]) {
  const navigate = useNavigate();

  return useCallback(
    (itemId: string) => {
      const path = getSettingsPathByItemId(itemId, items);
      if (path) {
        void navigate(path);
      }
    },
    [items, navigate],
  );
}
