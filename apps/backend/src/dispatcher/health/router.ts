import Router from '@koa/router';
import {StatusCodes} from 'http-status-codes';

import {HEALTH} from './path.js';

const router = new Router();

router.get(HEALTH, (ctx) => {
  ctx.response.status = StatusCodes.OK;
  ctx.response.body = {status: 'ok'};
});

export {router};
