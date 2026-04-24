import Router from '@koa/router';
import {putWorkspacesRequestSchema} from '@omnicraft/api-schema';
import {StatusCodes} from 'http-status-codes';
import {ZodError} from 'zod';

import {fileAccessSettingsService} from '@/services/file-access-settings/index.js';

import {FILE_ACCESS_WORKSPACES} from './path.js';

const router = new Router();

/** GET /settings/file-access/workspaces — returns the current workspaces. */
router.get(FILE_ACCESS_WORKSPACES, async (ctx) => {
  const workspaces = await fileAccessSettingsService.getWorkspaces();
  ctx.response.status = StatusCodes.OK;
  ctx.response.body = {workspaces};
});

/** PUT /settings/file-access/workspaces — validates and saves workspaces. */
router.put(FILE_ACCESS_WORKSPACES, async (ctx) => {
  let workspaces;
  try {
    const body = putWorkspacesRequestSchema.parse(ctx.request.body);
    workspaces = body.workspaces;
  } catch (e) {
    if (e instanceof ZodError) {
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: e.issues};
      return;
    }
    throw e;
  }

  const result = await fileAccessSettingsService.setWorkspaces(workspaces);

  if (!result.success) {
    ctx.response.status = StatusCodes.UNPROCESSABLE_ENTITY;
    ctx.response.body = {
      error: 'INVALID_PATHS',
      invalidPaths: result.invalidPaths,
    };
    return;
  }

  ctx.response.status = StatusCodes.OK;
  ctx.response.body = {success: true};
});

export {router};
