import compose from 'koa-compose';

import {router as healthRouter} from './health/index.js';

export function dispatcher() {
  return compose([healthRouter.routes(), healthRouter.allowedMethods()]);
}
