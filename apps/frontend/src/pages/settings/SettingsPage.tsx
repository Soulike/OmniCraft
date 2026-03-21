import {Suspense} from 'react';
import {Outlet, useLocation, useNavigate} from 'react-router';

import {Loading} from '@/components/Loading/index.js';
import {ROUTES} from '@/routes.js';

import {SettingsPageView,type SettingsTab} from './SettingsPageView.js';

const TABS: SettingsTab[] = [{id: 'llm', label: 'LLM'}];

const PATH_TO_TAB: Record<string, string> = {
  [ROUTES.settings.llm()]: 'llm',
};

export function SettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentTab = PATH_TO_TAB[location.pathname] ?? 'llm';

  return (
    <SettingsPageView
      tabs={TABS}
      selectedTab={currentTab}
      onTabChange={(id) => {
        void navigate(`${ROUTES.settings()}/${id}`);
      }}
    >
      <Suspense fallback={<Loading />}>
        <Outlet />
      </Suspense>
    </SettingsPageView>
  );
}
