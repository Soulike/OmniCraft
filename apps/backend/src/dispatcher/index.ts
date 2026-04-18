import Router from '@koa/router';
import compose from 'koa-compose';

import {router as agentSessionRouter} from './agent-session/index.js';
import {router as fileAccessSettingsRouter} from './file-access-settings/index.js';
import {router as healthRouter} from './health/index.js';
import {router as settingsRouter} from './settings/index.js';
import {router as vscodeRouter} from './vscode/index.js';

const apiRouter = new Router({prefix: '/api'});

apiRouter.use(async (ctx, next) => {
  await next();
  ctx.set('Cache-Control', 'no-store');
});

apiRouter.use(agentSessionRouter.routes(), agentSessionRouter.allowedMethods());
apiRouter.use(
  fileAccessSettingsRouter.routes(),
  fileAccessSettingsRouter.allowedMethods(),
);
apiRouter.use(healthRouter.routes(), healthRouter.allowedMethods());
apiRouter.use(settingsRouter.routes(), settingsRouter.allowedMethods());
apiRouter.use(vscodeRouter.routes(), vscodeRouter.allowedMethods());

export function dispatcher() {
  return compose([apiRouter.routes(), apiRouter.allowedMethods()]);
}
