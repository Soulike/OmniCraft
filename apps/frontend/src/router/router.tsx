import {createBrowserRouter, Navigate} from 'react-router';

import {Layout} from '@/pages/_layout/index.js';

import {ChatPage, SettingsPage} from './lazy-pages.js';
import {ROUTES} from './routes.js';

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
