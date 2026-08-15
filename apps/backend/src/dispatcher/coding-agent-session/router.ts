import {PassThrough} from 'node:stream';

import Router from '@koa/router';
import {
  chatCompletionsRequestSchema,
  createCodingSessionRequestSchema,
  listSessionsQuerySchema,
  submitToolResponseRequestSchema,
} from '@omnicraft/api-schema';
import {StatusCodes} from 'http-status-codes';
import {ZodError} from 'zod';

import {codingAgentSessionService} from '@/services/coding-agent-session/index.js';

import {registerAttachmentRoutes} from '../helpers/attachment-routes.js';
import {isCursorAheadOfLog, parseSseResumeCursor} from '../helpers/cursor.js';
import {parseSessionId} from '../helpers/session-id.js';
import {pumpSseEvents} from '../helpers/sse.js';
import {
  SESSION,
  SESSION_ABORT,
  SESSION_ATTACHMENT_BY_NAME,
  SESSION_ATTACHMENTS,
  SESSION_BY_ID,
  SESSION_COMPLETIONS,
  SESSION_EVENTS,
  SESSION_TOOL_RESPONSE,
  SESSIONS,
} from './path.js';

const router = new Router();

/** GET /coding/sessions — lists persisted sessions with pagination. */
router.get(SESSIONS, async (ctx) => {
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

  const result = await codingAgentSessionService.listSessions(offset, limit);
  ctx.response.status = StatusCodes.OK;
  ctx.response.body = result;
});

/** POST /coding/session — creates a new session. */
router.post(SESSION, async (ctx) => {
  let workspace: string;
  try {
    const body = createCodingSessionRequestSchema.parse(ctx.request.body);
    workspace = body.workspace;
  } catch (e) {
    if (e instanceof ZodError) {
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: e.issues};
      return;
    }
    throw e;
  }

  const result = await codingAgentSessionService.createSession(workspace);
  if (!result.success) {
    ctx.response.status = StatusCodes.UNPROCESSABLE_ENTITY;
    ctx.response.body = {error: result.error};
    return;
  }

  ctx.response.status = StatusCodes.CREATED;
  ctx.response.body = {sessionId: result.sessionId};
});

/** POST /coding/session/:id/completions — starts a completion in the background. */
router.post(SESSION_COMPLETIONS, async (ctx) => {
  const id = parseSessionId(ctx.params.id);
  if (id === null) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session not found: ${ctx.params.id}`};
    return;
  }

  let message: string;
  let attachmentFileNames: string[];
  try {
    const body = chatCompletionsRequestSchema.parse(ctx.request.body);
    message = body.message;
    attachmentFileNames = body.attachmentFileNames;
  } catch (e) {
    if (e instanceof ZodError) {
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: e.issues};
      return;
    }
    throw e;
  }

  const result = await codingAgentSessionService.sendCompletion(
    id,
    message,
    attachmentFileNames,
  );
  if (result.ok) {
    ctx.response.status = StatusCodes.ACCEPTED;
    return;
  }

  switch (result.reason) {
    case 'session-not-found':
      ctx.response.status = StatusCodes.NOT_FOUND;
      ctx.response.body = {error: `Session not found: ${id}`};
      return;
    case 'unknown-attachments':
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {
        error: 'UNKNOWN_ATTACHMENTS',
        missing: result.missing,
      };
      return;
    case 'attachments-too-large':
      ctx.response.status = StatusCodes.REQUEST_TOO_LONG;
      ctx.response.body = {
        error: 'ATTACHMENTS_TOO_LARGE',
        limitBytes: result.limit,
        totalBytes: result.totalBytes,
      };
      return;
  }
});

/** GET /coding/session/:id/events — SSE stream of agent events. */
router.get(SESSION_EVENTS, async (ctx) => {
  const id = parseSessionId(ctx.params.id);
  if (id === null) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session not found: ${ctx.params.id}`};
    return;
  }

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

  const committedCount = await codingAgentSessionService.getSseEventCount(id);
  if (committedCount === undefined) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session not found: ${id}`};
    return;
  }
  if (isCursorAheadOfLog(from, committedCount)) {
    ctx.response.status = StatusCodes.CONFLICT;
    ctx.response.body = {error: 'cursor_ahead_of_log', committedCount};
    return;
  }

  const abortController = new AbortController();
  const eventStream = await codingAgentSessionService.subscribe(id, {
    startIndex: from,
    signal: abortController.signal,
  });
  if (!eventStream) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session not found: ${id}`};
    return;
  }

  ctx.response.type = 'text/event-stream';
  // Explicit no-store: an SSE conversation stream must never be cached or
  // stored, unlike no-cache which merely forces revalidation before reuse.
  ctx.response.set('Cache-Control', 'no-store');
  ctx.response.set('Connection', 'keep-alive');
  ctx.response.set('X-Accel-Buffering', 'no');

  const stream = new PassThrough();
  ctx.body = stream;

  void pumpSseEvents(stream, eventStream, ctx.req, abortController);
});

/** POST /coding/session/:id/abort — aborts the running agent turn. */
router.post(SESSION_ABORT, async (ctx) => {
  const id = parseSessionId(ctx.params.id);
  if (id === null) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session not found: ${ctx.params.id}`};
    return;
  }

  const found = await codingAgentSessionService.abortCompletion(id);
  if (!found) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session not found: ${id}`};
    return;
  }

  ctx.response.status = StatusCodes.NO_CONTENT;
});

/** POST /coding/session/:id/tool-response — submits a user response for a client-side tool. */
router.post(SESSION_TOOL_RESPONSE, async (ctx) => {
  const id = parseSessionId(ctx.params.id);
  if (id === null) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session not found: ${ctx.params.id}`};
    return;
  }

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

  const found = await codingAgentSessionService.submitToolResponse(
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

/** DELETE /coding/session/:id — deletes a session from memory and disk. */
router.delete(SESSION_BY_ID, async (ctx) => {
  const id = parseSessionId(ctx.params.id);
  if (id === null) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session not found: ${ctx.params.id}`};
    return;
  }

  const found = await codingAgentSessionService.deleteSession(id);
  if (!found) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session not found: ${id}`};
    return;
  }

  ctx.response.status = StatusCodes.NO_CONTENT;
});

registerAttachmentRoutes(
  router,
  {collection: SESSION_ATTACHMENTS, byName: SESSION_ATTACHMENT_BY_NAME},
  codingAgentSessionService,
);

export {router};
