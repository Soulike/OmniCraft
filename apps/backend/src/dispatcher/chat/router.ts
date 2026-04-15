import type {IncomingMessage} from 'node:http';
import {PassThrough} from 'node:stream';

import Router from '@koa/router';
import {
  chatCompletionsRequestSchema,
  createSessionRequestSchema,
  generateTitleRequestSchema,
  submitToolResponseRequestSchema,
  type ThinkingLevel,
} from '@omnicraft/api-schema';
import {StatusCodes} from 'http-status-codes';
import {ZodError} from 'zod';

import {chatService} from '@/services/chat/index.js';

import {writeSseEvent} from './helpers/sse.js';
import {
  CHAT_SESSION,
  CHAT_SESSION_ABORT,
  CHAT_SESSION_COMPLETIONS,
  CHAT_SESSION_EVENTS,
  CHAT_SESSION_GENERATE_TITLE,
  CHAT_SESSION_TOOL_RESPONSE,
} from './path.js';

const router = new Router();

/** POST /chat/session — creates a new chat session. */
router.post(CHAT_SESSION, async (ctx) => {
  let options = {};
  try {
    const body = createSessionRequestSchema.parse(ctx.request.body);
    if (body) {
      options = {
        workspace: body.workspace,
        extraAllowedPaths: body.extraAllowedPaths,
      };
    }
  } catch (e) {
    if (e instanceof ZodError) {
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: e.issues};
      return;
    }
    throw e;
  }

  const result = await chatService.createSession(options);

  if (!result.success) {
    ctx.response.status = StatusCodes.UNPROCESSABLE_ENTITY;
    ctx.response.body = {error: result.error};
    return;
  }

  ctx.response.status = StatusCodes.CREATED;
  ctx.response.body = {sessionId: result.sessionId};
});

/** POST /chat/session/:id/completions — starts a chat completion in the background. */
router.post(CHAT_SESSION_COMPLETIONS, (ctx) => {
  const {id} = ctx.params;

  let message: string;
  let thinkingLevel: ThinkingLevel;
  try {
    const body = chatCompletionsRequestSchema.parse(ctx.request.body);
    message = body.message;
    thinkingLevel = body.thinkingLevel;
  } catch (e) {
    if (e instanceof ZodError) {
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: e.issues};
      return;
    }
    throw e;
  }

  const found = chatService.sendCompletion(id, message, thinkingLevel);
  if (!found) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session not found: ${id}`};
    return;
  }

  ctx.response.status = StatusCodes.ACCEPTED;
});

/** GET /chat/session/:id/events — SSE stream of agent events. */
router.get(CHAT_SESSION_EVENTS, (ctx) => {
  const {id} = ctx.params;
  const from = Math.max(0, Number(ctx.query.from) || 0);

  const abortController = new AbortController();
  const eventStream = chatService.subscribe(id, {
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
  eventStream: AsyncIterable<unknown>,
  req: IncomingMessage,
  abortController: AbortController,
): Promise<void> {
  const onDisconnect = () => {
    req.off('close', onDisconnect);
    abortController.abort();
    if (!stream.destroyed) {
      stream.destroy();
    }
  };
  req.on('close', onDisconnect);

  try {
    for await (const event of eventStream) {
      writeSseEvent(stream, event);
    }
  } finally {
    req.off('close', onDisconnect);
    if (!stream.destroyed) {
      stream.end();
    }
  }
}

/** POST /chat/session/:id/abort — aborts the running agent turn. */
router.post(CHAT_SESSION_ABORT, (ctx) => {
  const {id} = ctx.params;

  const found = chatService.abortCompletion(id);
  if (!found) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session not found: ${id}`};
    return;
  }

  ctx.response.status = StatusCodes.NO_CONTENT;
});

/** POST /chat/session/:id/generate-title — generates a title for a session. */
router.post(CHAT_SESSION_GENERATE_TITLE, async (ctx) => {
  const {id} = ctx.params;

  let userMessage: string;
  let assistantMessage: string;
  try {
    const body = generateTitleRequestSchema.parse(ctx.request.body);
    userMessage = body.userMessage;
    assistantMessage = body.assistantMessage;
  } catch (e) {
    if (e instanceof ZodError) {
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: e.issues};
      return;
    }
    throw e;
  }

  const title = await chatService.generateTitle(
    id,
    userMessage,
    assistantMessage,
  );
  ctx.response.body = {title};
});

/** POST /chat/session/:id/tool-response — submits a user response for a client-side tool. */
router.post(CHAT_SESSION_TOOL_RESPONSE, (ctx) => {
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

  const found = chatService.submitToolResponse(id, interactionId, result);
  if (!found) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session or interaction not found`};
    return;
  }

  ctx.response.status = StatusCodes.NO_CONTENT;
});

export {router};
