import compose from 'koa-compose';

import {router as healthRouter} from './health/index.js';
import {router as settingsRouter} from './settings/index.js';

export function dispatcher() {
  return compose([
    healthRouter.routes(),
    healthRouter.allowedMethods(),
    settingsRouter.routes(),
    settingsRouter.allowedMethods(),
  ]);
}
