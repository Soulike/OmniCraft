import {defineRoutes} from './define-routes/index.js';

/** Centralized route paths. Access via function call, e.g. `ROUTES.chat()`. */
export const ROUTES = defineRoutes({
  chat: {},
  settings: {},
});
