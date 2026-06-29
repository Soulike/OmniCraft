import {Suspense} from 'react';
import {Outlet} from 'react-router';

import {Loading} from '@/components/Loading/index.js';
import {ROUTES} from '@/routes.js';

import type {SettingsNavItem} from './helpers/settings-navigation.js';
import {useExpandedSettingsGroups} from './hooks/useExpandedSettingsGroups.js';
import {useSelectedSettingsItem} from './hooks/useSelectedSettingsItem.js';
import {useSettingsItemNavigation} from './hooks/useSettingsItemNavigation.js';
import {SettingsPageView} from './SettingsPageView.js';

const SETTINGS_NAV_ITEMS: readonly SettingsNavItem[] = [
  {
    id: 'llm',
    label: 'LLM',
    children: [
      {id: 'llm.chat', label: 'Chat Agent', path: ROUTES.settings.llm.chat()},
    ],
  },
  {
    id: 'coding',
    label: 'Coding',
    children: [
      {
        id: 'coding.agent',
        label: 'Coding Agent',
        path: ROUTES.settings.coding.agent(),
      },
      {
        id: 'coding.workspaces',
        label: 'Workspaces',
        path: ROUTES.settings.coding.workspaces(),
      },
    ],
  },
  {
    id: 'agent',
    label: 'Agent',
    children: [
      {
        id: 'agent.runtime',
        label: 'Runtime',
        path: ROUTES.settings.agent.runtime(),
      },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    children: [
      {
        id: 'tools.search',
        label: 'Search',
        path: ROUTES.settings.tools.search(),
      },
    ],
  },
];

export function SettingsPage() {
  const selectedItemId = useSelectedSettingsItem(SETTINGS_NAV_ITEMS);
  const {expandedGroupIds, setExpandedGroupIds} = useExpandedSettingsGroups(
    selectedItemId,
    SETTINGS_NAV_ITEMS,
  );
  const selectItem = useSettingsItemNavigation(SETTINGS_NAV_ITEMS);

  return (
    <SettingsPageView
      navItems={SETTINGS_NAV_ITEMS}
      selectedItemId={selectedItemId}
      expandedGroupIds={expandedGroupIds}
      onExpandedGroupIdsChange={setExpandedGroupIds}
      onItemSelect={selectItem}
    >
      <Suspense fallback={<Loading />}>
        <Outlet />
      </Suspense>
    </SettingsPageView>
  );
}
