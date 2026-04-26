import type {IncomingMessage} from 'node:http';
import {PassThrough} from 'node:stream';

import Router from '@koa/router';
import {
  AgentType,
  chatCompletionsRequestSchema,
  createCodingSessionRequestSchema,
  createSessionRequestSchema,
  listSessionsQuerySchema,
  submitToolResponseRequestSchema,
  type ThinkingLevel,
} from '@omnicraft/api-schema';
import type {SseEventCursorEntry} from '@omnicraft/sse-events';
import {StatusCodes} from 'http-status-codes';
import {ZodError} from 'zod';

import {agentSessionService} from '@/services/agent-session/index.js';

import {parseSseResumeCursor} from './helpers/cursor.js';
import {writeSseEvent} from './helpers/sse.js';
import {
  SESSION,
  SESSION_ABORT,
  SESSION_BY_ID,
  SESSION_COMPLETIONS,
  SESSION_EVENTS,
  SESSION_TOOL_RESPONSE,
  SESSIONS,
} from './path.js';
import {parseAgentType} from './validator.js';

const router = new Router();

/** GET /:agentType/sessions — lists persisted sessions with pagination. */
router.get(SESSIONS, async (ctx) => {
  const agentType = parseAgentType(ctx.params.agentType);
  if (!agentType) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    return;
  }

  let offset: number;
  let limit: number;
  try {
    const query = listSessionsQuerySchema.parse(ctx.query);
    offset = query.offset;
    limit = query.limit;
  } catch (e) {
    if (e instanceof ZodError) {
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: e.issues};
      return;
    }
    throw e;
  }

  const result = await agentSessionService.listSessions(
    agentType,
    offset,
    limit,
  );
  ctx.response.status = StatusCodes.OK;
  ctx.response.body = result;
});

/** POST /:agentType/session — creates a new session. */
router.post(SESSION, async (ctx) => {
  const agentType = parseAgentType(ctx.params.agentType);
  if (!agentType) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    return;
  }

  let options: {thinkingLevel: ThinkingLevel; workspace?: string};
  try {
    switch (agentType) {
      case AgentType.CHAT: {
        const body = createSessionRequestSchema.parse(ctx.request.body);
        options = {thinkingLevel: body.thinkingLevel};
        break;
      }
      case AgentType.CODING: {
        const body = createCodingSessionRequestSchema.parse(ctx.request.body);
        options = {
          workspace: body.workspace,
          thinkingLevel: body.thinkingLevel,
        };
        break;
      }
    }
  } catch (e) {
    if (e instanceof ZodError) {
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: e.issues};
      return;
    }
    throw e;
  }

  const result = await agentSessionService.createSession(agentType, options);

  if (!result.success) {
    ctx.response.status = StatusCodes.UNPROCESSABLE_ENTITY;
    ctx.response.body = {error: result.error};
    return;
  }

  ctx.response.status = StatusCodes.CREATED;
  ctx.response.body = {sessionId: result.sessionId};
});

/** POST /:agentType/session/:id/completions — starts a completion in the background. */
router.post(SESSION_COMPLETIONS, async (ctx) => {
  const agentType = parseAgentType(ctx.params.agentType);
  if (!agentType) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    return;
  }

  const {id} = ctx.params;

  let message: string;
  try {
    const body = chatCompletionsRequestSchema.parse(ctx.request.body);
    message = body.message;
  } catch (e) {
    if (e instanceof ZodError) {
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: e.issues};
      return;
    }
    throw e;
  }

  const found = await agentSessionService.sendCompletion(
    agentType,
    id,
    message,
  );
  if (!found) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session not found: ${id}`};
    return;
  }

  ctx.response.status = StatusCodes.ACCEPTED;
});

/** GET /:agentType/session/:id/events — SSE stream of agent events. */
router.get(SESSION_EVENTS, async (ctx) => {
  const agentType = parseAgentType(ctx.params.agentType);
  if (!agentType) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    return;
  }

  const {id} = ctx.params;

  let from: number;
  try {
    from = parseSseResumeCursor(ctx.query.from);
  } catch (e) {
    ctx.response.status = StatusCodes.BAD_REQUEST;
    ctx.response.body = {
      error: e instanceof Error ? e.message : 'Invalid SSE resume cursor',
    };
    return;
  }

  const abortController = new AbortController();
  const eventStream = await agentSessionService.subscribe(agentType, id, {
    startIndex: from,
    signal: abortController.signal,
  });
  if (!eventStream) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session not found: ${id}`};
    return;
  }

  ctx.response.type = 'text/event-stream';
  ctx.response.set('Cache-Control', 'no-cache');
  ctx.response.set('Connection', 'keep-alive');
  ctx.response.set('X-Accel-Buffering', 'no');

  const stream = new PassThrough();
  ctx.body = stream;

  void pumpSseEvents(stream, eventStream, ctx.req, abortController);
});

/**
 * Pumps events from an async iterable to a PassThrough SSE stream.
 * Runs in the background — must not be awaited inside a Koa handler,
 * otherwise Koa's respond() never fires and the client receives nothing.
 */
async function pumpSseEvents(
  stream: PassThrough,
  eventStream: AsyncIterable<SseEventCursorEntry>,
  req: IncomingMessage,
  abortController: AbortController,
): Promise<void> {
  const onDisconnect = () => {
    req.off('close', onDisconnect);
    abortController.abort();
    if (!stream.destroyed) {
      stream.end();
    }
  };
  req.on('close', onDisconnect);

  try {
    for await (const entry of eventStream) {
      writeSseEvent(stream, entry.event, entry.nextIndex);
    }
  } finally {
    req.off('close', onDisconnect);
    if (!stream.destroyed) {
      stream.end();
    }
  }
}

/** POST /:agentType/session/:id/abort — aborts the running agent turn. */
router.post(SESSION_ABORT, async (ctx) => {
  const agentType = parseAgentType(ctx.params.agentType);
  if (!agentType) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    return;
  }

  const {id} = ctx.params;

  const found = await agentSessionService.abortCompletion(agentType, id);
  if (!found) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session not found: ${id}`};
    return;
  }

  ctx.response.status = StatusCodes.NO_CONTENT;
});

/** POST /:agentType/session/:id/tool-response — submits a user response for a client-side tool. */
router.post(SESSION_TOOL_RESPONSE, async (ctx) => {
  const agentType = parseAgentType(ctx.params.agentType);
  if (!agentType) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    return;
  }

  const {id} = ctx.params;

  let interactionId: string;
  let result: unknown;
  try {
    const body = submitToolResponseRequestSchema.parse(ctx.request.body);
    interactionId = body.interactionId;
    result = body.result;
  } catch (e) {
    if (e instanceof ZodError) {
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: e.issues};
      return;
    }
    throw e;
  }

  const found = await agentSessionService.submitToolResponse(
    agentType,
    id,
    interactionId,
    result,
  );
  if (!found) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session or interaction not found`};
    return;
  }

  ctx.response.status = StatusCodes.NO_CONTENT;
});

/** DELETE /:agentType/session/:id — deletes a session from memory and disk. */
router.delete(SESSION_BY_ID, async (ctx) => {
  const agentType = parseAgentType(ctx.params.agentType);
  if (!agentType) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    return;
  }

  const {id} = ctx.params;

  const found = await agentSessionService.deleteSession(agentType, id);
  if (!found) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session not found: ${id}`};
    return;
  }

  ctx.response.status = StatusCodes.NO_CONTENT;
});

export {router};
