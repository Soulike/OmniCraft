import {Code2, LayoutDashboard, MessageSquare, Settings} from 'lucide-react';
import {useMemo} from 'react';
import {useLocation} from 'react-router';

import {useTheme} from '@/hooks/useTheme.js';
import {ROUTES} from '@/routes.js';

import {SidebarView} from './SidebarView.js';
import type {NavItem} from './types.js';

export function Sidebar() {
  const location = useLocation();
  const {resolvedTheme} = useTheme();

  const primaryItems: NavItem[] = useMemo(
    () => [
      {
        id: 'dashboard',
        label: 'Dashboard',
        path: ROUTES.dashboard(),
        Icon: LayoutDashboard,
      },
      {id: 'chat', label: 'Chat', path: ROUTES.chat(), Icon: MessageSquare},
      {id: 'coding', label: 'Coding', path: ROUTES.coding(), Icon: Code2},
    ],
    [],
  );
  const settingsItem: NavItem = useMemo(
    () => ({
      id: 'settings',
      label: 'Settings',
      path: ROUTES.settings(),
      Icon: Settings,
    }),
    [],
  );

  const allItems = useMemo(
    () => [...primaryItems, settingsItem],
    [primaryItems, settingsItem],
  );
  const selectedId = useMemo(
    () =>
      allItems.find((item) => location.pathname.startsWith(item.path))?.id ??
      allItems[0].id,
    [allItems, location.pathname],
  );

  return (
    <SidebarView
      primaryItems={primaryItems}
      settingsItem={settingsItem}
      selectedId={selectedId}
      brandPath={ROUTES.dashboard()}
      theme={resolvedTheme}
    />
  );
}
