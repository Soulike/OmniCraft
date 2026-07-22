import Router from '@koa/router';
import {StatusCodes} from 'http-status-codes';

import {mcpService} from '@/services/mcp/index.js';

import {MCP_SERVER_RECONNECT, MCP_SERVERS} from './path.js';

const router = new Router();

/** GET /mcp/servers — connection status + discovered tools per server. */
router.get(MCP_SERVERS, (ctx) => {
  ctx.response.status = StatusCodes.OK;
  ctx.response.body = {servers: mcpService.listServers()};
});

/** POST /mcp/servers/:name/reconnect — force a single server reconnect. */
router.post(MCP_SERVER_RECONNECT, async (ctx) => {
  const reconnected = await mcpService.reconnectServer(ctx.params.name);
  if (!reconnected) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `MCP server not found: ${ctx.params.name}`};
    return;
  }
  ctx.response.status = StatusCodes.ACCEPTED;
  ctx.response.body = {success: true};
});

export {router};
