import {createBrowserRouter, Navigate} from 'react-router';

import {Layout} from '@/pages/_layout/index.js';
import {ROUTES} from '@/routes.js';

import {
  AgentRuntimeSection,
  ChatLlmSection,
  ChatPage,
  CodingLlmSection,
  CodingPage,
  McpServersSection,
  SearchSection,
  SettingsPage,
  ShowcasePage,
  WorkspacesSection,
} from './lazy-pages.js';

/** Application router configuration. */
export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      {
        index: true,
        element: <Navigate to={ROUTES.dashboard()} replace />,
      },
      {
        path: ROUTES.dashboard(),
        element: null,
      },
      {
        path: `${ROUTES.chat()}/:sessionId?`,
        element: <ChatPage />,
      },
      {
        path: `${ROUTES.coding()}/:sessionId?`,
        element: <CodingPage />,
      },
      {
        path: ROUTES.showcase(),
        element: <ShowcasePage />,
      },
      {
        path: ROUTES.settings(),
        element: <SettingsPage />,
        children: [
          {
            index: true,
            element: <Navigate to={ROUTES.settings.llm.chat()} replace />,
          },
          {
            path: ROUTES.settings.llm.chat(),
            element: <ChatLlmSection />,
          },
          {
            path: ROUTES.settings.coding.agent(),
            element: <CodingLlmSection />,
          },
          {
            path: ROUTES.settings.agent.runtime(),
            element: <AgentRuntimeSection />,
          },
          {
            path: ROUTES.settings.tools.search(),
            element: <SearchSection />,
          },
          {
            path: ROUTES.settings.mcp.servers(),
            element: <McpServersSection />,
          },
          {
            path: ROUTES.settings.coding.workspaces(),
            element: <WorkspacesSection />,
          },
        ],
      },
    ],
  },
]);
