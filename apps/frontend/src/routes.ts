import {defineRoutes} from '@/router/define-routes/index.js';

/** Centralized route paths. Access via function call, e.g. `ROUTES.chat()`. */
export const ROUTES = defineRoutes({
  dashboard: {},
  chat: {},
  coding: {},
  settings: {llm: {}, codingLlm: {}, agent: {}, search: {}, fileAccess: {}},
});
