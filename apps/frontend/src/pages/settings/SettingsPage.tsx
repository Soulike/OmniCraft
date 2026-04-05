import {Suspense} from 'react';
import {Outlet, useLocation, useNavigate} from 'react-router';

import {Loading} from '@/components/Loading/index.js';
import {ROUTES} from '@/routes.js';

import {SettingsPageView, type SettingsTab} from './SettingsPageView.js';

const TABS: SettingsTab[] = [
  {id: 'llm', label: 'LLM'},
  {id: 'agent', label: 'Agent'},
  {id: 'search', label: 'Search'},
  {id: 'fileAccess', label: 'File Access'},
];

const TAB_TO_PATH: Record<string, string> = {
  llm: ROUTES.settings.llm(),
  agent: ROUTES.settings.agent(),
  search: ROUTES.settings.search(),
  fileAccess: ROUTES.settings.fileAccess(),
};

const PATH_TO_TAB: Record<string, string> = Object.fromEntries(
  Object.entries(TAB_TO_PATH).map(([tab, path]) => [path, tab]),
);

export function SettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentTab = PATH_TO_TAB[location.pathname] ?? 'llm';

  return (
    <SettingsPageView
      tabs={TABS}
      selectedTab={currentTab}
      onTabChange={(id) => {
        const path = TAB_TO_PATH[id];
        if (path) {
          void navigate(path);
        }
      }}
    >
      <Suspense fallback={<Loading />}>
        <Outlet />
      </Suspense>
    </SettingsPageView>
  );
}
