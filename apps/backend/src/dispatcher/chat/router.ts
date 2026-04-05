import {PassThrough} from 'node:stream';

import Router from '@koa/router';
import {StatusCodes} from 'http-status-codes';
import {ZodError} from 'zod';

import {chatService} from '@/services/chat/index.js';

import {pumpEventStream} from './helpers/sse.js';
import {
  CHAT_SESSION,
  CHAT_SESSION_COMPLETIONS,
  CHAT_SESSION_GENERATE_TITLE,
} from './path.js';
import {
  chatCompletionsBody,
  createSessionBody,
  generateTitleBody,
} from './validator.js';

const router = new Router();

/** POST /chat/session — creates a new chat session. */
router.post(CHAT_SESSION, async (ctx) => {
  let options = {};
  try {
    const body = createSessionBody.parse(ctx.request.body);
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

  const result = chatService.streamCompletion(id, message);
  if (!result) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session not found: ${id}`};
    return;
  }

  const {eventStream, abort} = result;

  ctx.response.type = 'text/event-stream';
  ctx.response.set('Cache-Control', 'no-cache');
  ctx.response.set('Connection', 'keep-alive');
  ctx.response.set('X-Accel-Buffering', 'no');

  const stream = new PassThrough();
  ctx.body = stream;

  const onDisconnect = () => {
    ctx.req.off('close', onDisconnect);
    abort();
    if (!stream.destroyed) {
      stream.destroy();
    }
    void eventStream.return();
  };
  ctx.req.on('close', onDisconnect);

  void pumpEventStream(stream, eventStream).finally(() => {
    ctx.req.off('close', onDisconnect);
  });
});

/** POST /chat/session/:id/generate-title — generates a title for a session. */
router.post(CHAT_SESSION_GENERATE_TITLE, async (ctx) => {
  const {id} = ctx.params;

  let userMessage: string;
  let assistantMessage: string;
  try {
    const body = generateTitleBody.parse(ctx.request.body);
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

export {router};
