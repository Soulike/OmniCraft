import {Suspense} from 'react';
import {Outlet} from 'react-router';

import {LoadingPage} from '@/pages/loading/index.js';

import {LayoutView} from './LayoutView.js';

/** Root layout connector. Provides router outlet to the view. */
export function Layout() {
  return (
    <LayoutView>
      <Suspense fallback={<LoadingPage />}>
        <Outlet />
      </Suspense>
    </LayoutView>
  );
}
