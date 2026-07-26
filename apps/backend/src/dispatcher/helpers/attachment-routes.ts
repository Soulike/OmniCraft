import {createReadStream} from 'node:fs';
import type {Readable} from 'node:stream';

import type Router from '@koa/router';
import {uploadAttachmentQuerySchema} from '@omnicraft/api-schema';
import {StatusCodes} from 'http-status-codes';
import {ZodError} from 'zod';

import type {
  AttachmentDescriptor,
  SaveAttachmentResult,
} from '@/agent-core/agent/index.js';

import {parseSessionId} from './session-id.js';

export interface AttachmentRoutePaths {
  readonly collection: string;
  readonly byName: string;
}

/**
 * The subset of a session service's surface that the attachment routes need.
 * Both `chatAgentSessionService` and `codingAgentSessionService` satisfy this
 * structurally — no shared base type links them, only the method shapes.
 */
export interface AttachmentSessionService {
  saveAttachment(
    agentId: string,
    desiredName: string,
    body: Readable,
  ): Promise<SaveAttachmentResult | null>;
  describeAttachment(
    agentId: string,
    fileName: string,
  ): Promise<AttachmentDescriptor | null>;
  removeAttachment(agentId: string, fileName: string): Promise<boolean | null>;
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
  service: AttachmentSessionService,
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
    const result = await service.saveAttachment(id, name, ctx.req);
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
    if (id === null) {
      ctx.response.status = StatusCodes.NOT_FOUND;
      ctx.response.body = {error: 'Attachment not found'};
      return;
    }

    const found = await service.describeAttachment(id, ctx.params.fileName);
    if (found === null) {
      ctx.response.status = StatusCodes.NOT_FOUND;
      ctx.response.body = {error: 'Attachment not found'};
      return;
    }

    // Bytes are NOT immutable for a given name: `remove` frees the name, and
    // the very next upload of the same desired name reclaims it via
    // `placeUniquely` (which always starts at the bare, unsuffixed name),
    // with different bytes. So this must revalidate on every request rather
    // than caching for a year — a strong `ETag` derived from the file's size
    // and mtime lets that revalidation cost a 304 instead of a re-download.
    // Set explicitly so the /api default of `no-store` does not apply (see
    // the conditional middleware in dispatcher/index.ts).
    ctx.response.status = StatusCodes.OK;
    ctx.response.set('Cache-Control', 'private, max-age=0, must-revalidate');
    ctx.response.etag = `${found.attachment.byteSize}-${found.mtimeMs}`;

    if (ctx.fresh) {
      ctx.response.status = StatusCodes.NOT_MODIFIED;
      return;
    }

    ctx.response.type = found.attachment.mediaType;
    ctx.response.length = found.attachment.byteSize;
    ctx.body = createReadStream(found.absolutePath);
  });

  /** DELETE …/attachments/:fileName — removes a stored file. */
  router.delete(paths.byName, async (ctx) => {
    const id = parseSessionId(ctx.params.id);
    if (id === null) {
      ctx.response.status = StatusCodes.NOT_FOUND;
      ctx.response.body = {error: 'Attachment not found'};
      return;
    }

    const removed = await service.removeAttachment(id, ctx.params.fileName);
    if (removed !== true) {
      ctx.response.status = StatusCodes.NOT_FOUND;
      ctx.response.body = {error: 'Attachment not found'};
      return;
    }

    ctx.response.status = StatusCodes.NO_CONTENT;
  });
}
