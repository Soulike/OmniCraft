import {Suspense} from 'react';
import {Outlet} from 'react-router';

import {LayoutView} from './LayoutView.js';

/** Root layout connector. Provides router outlet to the view. */
export function Layout() {
  return (
    <LayoutView>
      <Suspense>
        <Outlet />
      </Suspense>
    </LayoutView>
  );
}
