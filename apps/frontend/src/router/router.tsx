import {createBrowserRouter, Navigate} from 'react-router';

import {Layout} from '@/pages/_layout/index.js';
import {ROUTES} from '@/routes.js';

import {ChatPage, SettingsPage} from './lazy-pages.js';

/** Application router configuration. */
export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      {
        index: true,
        element: <Navigate to={ROUTES.chat()} replace />,
      },
      {
        path: ROUTES.chat(),
        element: <ChatPage />,
      },
      {
        path: ROUTES.settings(),
        element: <SettingsPage />,
      },
    ],
  },
]);
