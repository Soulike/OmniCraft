import {PassThrough} from 'node:stream';

import Router from '@koa/router';
import {StatusCodes} from 'http-status-codes';
import {ZodError} from 'zod';

import {chatService} from '@/services/chat/index.js';

import {pumpEventStream} from '../helpers/sse.js';
import {CHAT_SESSION, CHAT_SESSION_COMPLETIONS} from './path.js';
import {chatCompletionsBody} from './validator.js';

const router = new Router();

/** POST /chat/session — creates a new chat session. */
router.post(CHAT_SESSION, async (ctx) => {
  const result = await chatService.createSession();

  if (!result.success) {
    ctx.response.status = StatusCodes.UNPROCESSABLE_ENTITY;
    ctx.response.body = {error: result.error};
    return;
  }

  ctx.response.status = StatusCodes.CREATED;
  ctx.response.body = {sessionId: result.sessionId};
});

/** POST /chat/session/:id/completions — streams a chat completion. */
router.post(CHAT_SESSION_COMPLETIONS, (ctx) => {
  const {id} = ctx.params;

  let message: string;
  try {
    const body = chatCompletionsBody.parse(ctx.request.body);
    message = body.message;
  } catch (e) {
    if (e instanceof ZodError) {
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: e.issues};
      return;
    }
    throw e;
  }

  const eventStream = chatService.streamCompletion(id, message);
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

  void pumpEventStream(stream, eventStream);
});

export {router};
