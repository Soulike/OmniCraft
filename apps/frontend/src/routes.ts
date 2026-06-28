import {defineRoutes} from '@/router/define-routes/index.js';

/** Centralized route paths. Access via function call, e.g. `ROUTES.chat()`. */
export const ROUTES = defineRoutes({
  dashboard: {},
  chat: {},
  coding: {},
  showcase: {},
  settings: {
    llm: {chat: {}},
    coding: {agent: {}, workspaces: {}},
    agent: {runtime: {}},
    tools: {search: {}},
  },
});
