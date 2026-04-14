import Router from '@koa/router';
import type {GetVscodeStatusResponse} from '@omnicraft/api-schema';
import {StatusCodes} from 'http-status-codes';

import {VscodeServerManager} from '@/models/vscode-server-manager/index.js';

import {VSCODE_PROXY, VSCODE_STATUS} from './path.js';

const router = new Router();

router.get(VSCODE_STATUS, (ctx) => {
  const manager = VscodeServerManager.getInstance();
  const body: GetVscodeStatusResponse = {available: manager.isAvailable()};
  ctx.response.status = StatusCodes.OK;
  ctx.response.body = body;
});

router.all(VSCODE_PROXY, async (ctx) => {
  const manager = VscodeServerManager.getInstance();
  if (!manager.isAvailable()) {
    ctx.response.status = StatusCodes.SERVICE_UNAVAILABLE;
    ctx.response.body = {error: 'VSCode server is not available'};
    return;
  }

  // Strip the /vscode prefix so upstream receives the original path.
  ctx.req.url = '/' + (ctx.params.path);
  ctx.respond = false;
  await manager.proxyRequest(ctx.req, ctx.res);
});

export {router};
