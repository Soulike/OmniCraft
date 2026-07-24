import Router from '@koa/router';
import {putMcpSettingsRequestSchema} from '@omnicraft/api-schema';
import {StatusCodes} from 'http-status-codes';
import {ZodError} from 'zod';

import {mcpSettingsService} from '@/services/mcp-settings/index.js';

import {MCP_SETTINGS} from './path.js';

const router = new Router();

/**
 * PUT /settings/mcp — validates and writes the whole `mcp` settings section.
 * Dedicated (non-scalar) write endpoint; the generic /settings API rejects
 * array/object values.
 */
router.put(MCP_SETTINGS, async (ctx) => {
  try {
    const {mcp} = putMcpSettingsRequestSchema.parse(ctx.request.body);
    await mcpSettingsService.setSettings(mcp);
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
