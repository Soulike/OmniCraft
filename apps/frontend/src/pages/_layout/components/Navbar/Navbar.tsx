import {useMemo} from 'react';
import {useLocation, useNavigate} from 'react-router';

import {useTheme} from '@/hooks/useTheme.js';
import {ROUTES} from '@/routes.js';

import {NavbarView} from './NavbarView.js';
import type {NavTab} from './types.js';

export function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const {resolvedTheme} = useTheme();
  const tabs: NavTab[] = useMemo(
    () => [
      {id: 'dashboard', label: 'Dashboard', path: ROUTES.dashboard()},
      {id: 'chat', label: 'Chat', path: ROUTES.chat()},
      {id: 'tasks', label: 'Tasks', path: ROUTES.tasks()},
      {id: 'settings', label: 'Settings', path: ROUTES.settings()},
    ],
    [],
  );
  const currentTab = useMemo(
    () =>
      tabs.find((tab) => location.pathname.startsWith(tab.path))?.id ??
      tabs[0].id,
    [location.pathname, tabs],
  );

  return (
    <NavbarView
      tabs={tabs}
      selectedTab={currentTab}
      onTabChange={(id) => {
        const tab = tabs.find((t) => t.id === id);
        if (tab) {
          void navigate(tab.path);
        }
      }}
      brandPath={ROUTES.dashboard()}
      theme={resolvedTheme}
    />
  );
}
