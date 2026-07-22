import Router from '@koa/router';
import {StatusCodes} from 'http-status-codes';

import {McpManager} from '@/models/mcp-manager/index.js';

import {MCP_SERVER_RECONNECT, MCP_SERVERS} from './path.js';

const router = new Router();

/** GET /mcp/servers — connection status + discovered tools per server. */
router.get(MCP_SERVERS, (ctx) => {
  ctx.response.status = StatusCodes.OK;
  ctx.response.body = {servers: McpManager.getInstance().list()};
});

/** POST /mcp/servers/:name/reconnect — force a single server reconnect. */
router.post(MCP_SERVER_RECONNECT, async (ctx) => {
  await McpManager.getInstance().reconnect(ctx.params.name);
  ctx.response.status = StatusCodes.ACCEPTED;
  ctx.response.body = {success: true};
});

export {router};
