import Router from '@koa/router';
import {StatusCodes} from 'http-status-codes';
import {ZodError} from 'zod';

import {fileAccessSettingsService} from '@/services/file-access-settings/index.js';

import {FILE_ACCESS_ALLOWED_PATHS} from './path.js';
import {putAllowedPathsBody} from './validator.js';

const router = new Router();

/** GET /settings/file-access/allowed-paths — returns the current allowed paths. */
router.get(FILE_ACCESS_ALLOWED_PATHS, async (ctx) => {
  const allowedPaths = await fileAccessSettingsService.getAllowedPaths();
  ctx.response.status = StatusCodes.OK;
  ctx.response.body = {allowedPaths};
});

/** PUT /settings/file-access/allowed-paths — validates and saves allowed paths. */
router.put(FILE_ACCESS_ALLOWED_PATHS, async (ctx) => {
  let allowedPaths;
  try {
    const body = putAllowedPathsBody.parse(ctx.request.body);
    allowedPaths = body.allowedPaths;
  } catch (e) {
    if (e instanceof ZodError) {
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: e.issues};
      return;
    }
    throw e;
  }

  const result = await fileAccessSettingsService.setAllowedPaths(allowedPaths);

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
