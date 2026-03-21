import {createBrowserRouter, Navigate} from 'react-router';

import {Layout} from '@/pages/_layout/index.js';

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
        lazy: async () => {
          const {ChatPage} = await import('@/pages/chat/index.js');
          return {Component: ChatPage};
        },
      },
      {
        path: ROUTES.settings(),
        lazy: async () => {
          const {SettingsPage} = await import('@/pages/settings/index.js');
          return {Component: SettingsPage};
        },
      },
    ],
  },
]);
