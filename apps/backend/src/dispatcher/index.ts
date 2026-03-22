import Router from '@koa/router';
import compose from 'koa-compose';

import {router as healthRouter} from './health/index.js';
import {router as settingsRouter} from './settings/index.js';

const apiRouter = new Router({prefix: '/api'});

apiRouter.use(healthRouter.routes(), healthRouter.allowedMethods());
apiRouter.use(settingsRouter.routes(), settingsRouter.allowedMethods());

export function dispatcher() {
  return compose([apiRouter.routes(), apiRouter.allowedMethods()]);
}
