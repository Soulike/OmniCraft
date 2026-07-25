import {createReadStream} from 'node:fs';

import type Router from '@koa/router';
import {uploadAttachmentQuerySchema} from '@omnicraft/api-schema';
import {StatusCodes} from 'http-status-codes';
import {ZodError} from 'zod';

import type {AgentAttachmentService} from '@/services/agent-attachments/index.js';

import {parseAttachmentFileName} from './attachment-name.js';
import {parseSessionId} from './session-id.js';

export interface AttachmentRoutePaths {
  readonly collection: string;
  readonly byName: string;
}

/**
 * Registers the upload / download / delete endpoints on a session router.
 *
 * The handlers are identical for every session family; only the path prefix and
 * the service binding differ. The binding is what keeps the families apart — a
 * coding session id must not reach a chat session's attachments — so it is a
 * parameter rather than something resolved inside.
 */
export function registerAttachmentRoutes(
  router: Router,
  paths: AttachmentRoutePaths,
  service: AgentAttachmentService,
): void {
  /** POST …/attachments — stores an uploaded image or PDF. */
  router.post(paths.collection, async (ctx) => {
    const id = parseSessionId(ctx.params.id);
    if (id === null) {
      ctx.response.status = StatusCodes.NOT_FOUND;
      ctx.response.body = {error: `Session not found: ${ctx.params.id}`};
      return;
    }

    let name: string;
    try {
      name = uploadAttachmentQuerySchema.parse(ctx.query).name;
    } catch (e) {
      if (e instanceof ZodError) {
        ctx.response.status = StatusCodes.BAD_REQUEST;
        ctx.response.body = {error: e.issues};
        return;
      }
      throw e;
    }

    // `@koa/bodyparser` only handles json/form, so for any other content type
    // the request stream is untouched and can be piped straight to disk.
    const result = await service.save(id, name, ctx.req);
    if (result === null) {
      ctx.response.status = StatusCodes.NOT_FOUND;
      ctx.response.body = {error: `Session not found: ${id}`};
      return;
    }

    if (!result.ok) {
      ctx.response.status =
        result.reason === 'too-large'
          ? StatusCodes.REQUEST_TOO_LONG
          : StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: result.reason};
      return;
    }

    ctx.response.status = StatusCodes.CREATED;
    ctx.response.body = result.attachment;
  });

  /** GET …/attachments/:fileName — streams the stored bytes. */
  router.get(paths.byName, async (ctx) => {
    const id = parseSessionId(ctx.params.id);
    const fileName = parseAttachmentFileName(ctx.params.fileName);
    if (id === null || fileName === null) {
      ctx.response.status = StatusCodes.NOT_FOUND;
      ctx.response.body = {error: 'Attachment not found'};
      return;
    }

    const found = await service.describe(id, fileName);
    if (found === null) {
      ctx.response.status = StatusCodes.NOT_FOUND;
      ctx.response.body = {error: 'Attachment not found'};
      return;
    }

    ctx.response.status = StatusCodes.OK;
    ctx.response.type = found.attachment.mediaType;
    ctx.response.length = found.attachment.byteSize;
    // Bytes are immutable for a given name — the store uniquifies rather than
    // overwriting. Set explicitly so the /api default of `no-store` does not
    // apply (see the conditional middleware in dispatcher/index.ts).
    ctx.response.set('Cache-Control', 'private, max-age=31536000, immutable');
    ctx.body = createReadStream(found.absolutePath);
  });

  /** DELETE …/attachments/:fileName — removes a stored file. */
  router.delete(paths.byName, async (ctx) => {
    const id = parseSessionId(ctx.params.id);
    const fileName = parseAttachmentFileName(ctx.params.fileName);
    if (id === null || fileName === null) {
      ctx.response.status = StatusCodes.NOT_FOUND;
      ctx.response.body = {error: 'Attachment not found'};
      return;
    }

    const removed = await service.remove(id, fileName);
    if (removed !== true) {
      ctx.response.status = StatusCodes.NOT_FOUND;
      ctx.response.body = {error: 'Attachment not found'};
      return;
    }

    ctx.response.status = StatusCodes.NO_CONTENT;
  });
}
