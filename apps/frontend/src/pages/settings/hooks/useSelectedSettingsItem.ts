import {useLocation} from 'react-router';

import {
  getSelectedSettingsItemId,
  type SettingsNavItem,
} from '../helpers/settings-navigation.js';

export function useSelectedSettingsItem(items: readonly SettingsNavItem[]) {
  const location = useLocation();
  return getSelectedSettingsItemId(location.pathname, items);
}
