import Router from '@koa/router';
import type {GetVscodeStatusResponse} from '@omnicraft/api-schema';
import {StatusCodes} from 'http-status-codes';

import {VscodeServerManager} from '@/models/vscode-server-manager/index.js';

import {VSCODE_STATUS} from './path.js';

const router = new Router();

router.get(VSCODE_STATUS, (ctx) => {
  const manager = VscodeServerManager.getInstance();
  const body: GetVscodeStatusResponse = {
    available: manager.isAvailable(),
    port: manager.getPort(),
    connectionToken: manager.getConnectionToken(),
  };
  ctx.response.status = StatusCodes.OK;
  ctx.response.body = body;
});

export {router};
