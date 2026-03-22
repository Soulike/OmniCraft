import Router from '@koa/router';
import {StatusCodes} from 'http-status-codes';
import {ZodError} from 'zod';

import {settingsService} from '@/services/settings/index.js';

import {SETTINGS_BATCH, SETTINGS_JSON_SCHEMA, SETTINGS_VALUE} from './path.js';
import {
  parseLeafKeyPath,
  putSettingsBatchBody,
  putSettingsBody,
} from './validator.js';

const router = new Router();

/** GET /settings/json-schema — returns the settings structure as JSON Schema. */
router.get(SETTINGS_JSON_SCHEMA, (ctx) => {
  ctx.response.status = StatusCodes.OK;
  ctx.response.body = settingsService.getJSONSchema();
});

/** PUT /settings/batch — atomically writes multiple scalar values. */
router.put(SETTINGS_BATCH, async (ctx) => {
  try {
    const {entries} = putSettingsBatchBody.parse(ctx.request.body);
    await settingsService.setBatch(entries);
    ctx.response.status = StatusCodes.OK;
    ctx.response.body = {success: true};
  } catch (e) {
    if (e instanceof ZodError) {
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: e.issues};
      return;
    }
    throw e;
  }
});

/** GET /settings/* — reads a scalar value at the given key path. */
router.get(SETTINGS_VALUE, async (ctx) => {
  try {
    const keyPath = parseLeafKeyPath(ctx.params.path);
    const value = await settingsService.get(keyPath);
    ctx.response.status = StatusCodes.OK;
    ctx.response.body = {value};
  } catch (e) {
    if (e instanceof ZodError) {
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: e.issues};
      return;
    }
    throw e;
  }
});

/** PUT /settings/* — writes a scalar value at the given key path. */
router.put(SETTINGS_VALUE, async (ctx) => {
  try {
    const keyPath = parseLeafKeyPath(ctx.params.path);
    const {value} = putSettingsBody.parse(ctx.request.body);
    await settingsService.set(keyPath, value);
    ctx.response.status = StatusCodes.OK;
    ctx.response.body = {success: true};
  } catch (e) {
    if (e instanceof ZodError) {
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: e.issues};
      return;
    }
    throw e;
  }
});

export {router};
