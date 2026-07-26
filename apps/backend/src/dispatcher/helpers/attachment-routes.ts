import type {FileHandle} from 'node:fs/promises';
import {open} from 'node:fs/promises';
import type {Readable} from 'node:stream';

import type Router from '@koa/router';
import {uploadAttachmentQuerySchema} from '@omnicraft/api-schema';
import type {LlmAttachment} from '@omnicraft/tool-schemas';
import {StatusCodes} from 'http-status-codes';
import {ZodError} from 'zod';

import type {
  AttachmentDescriptor,
  SaveAttachmentFailureReason,
} from '@/agent-core/agent/index.js';
import {isFileNotFoundError} from '@/helpers/fs.js';

import {parseSessionId} from './session-id.js';

export interface AttachmentRoutePaths {
  readonly collection: string;
  readonly byName: string;
}

/**
 * Escapes a file name for use inside a `Content-Disposition` quoted-string
 * (RFC 6266 / RFC 2616 §2.2). `sanitizeFileName` strips control characters,
 * `/`, and `\` from anything saved through the upload path, but not `"` — so
 * an unescaped name could close the quoted-string early and inject
 * additional header parameters. Backslash is escaped too, defensively,
 * in case a name ever reaches this header by some path other than the
 * sanitizer-backed store.
 */
function escapeContentDispositionFilename(fileName: string): string {
  return fileName.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

/**
 * The result shape `saveAttachment` structurally satisfies on both
 * `chatAgentSessionService` and `codingAgentSessionService`. Declared locally
 * — not imported from either service's `types.ts` — so the two services can
 * diverge without this router silently drifting out of sync; see
 * {@link AttachmentSessionService}.
 */
type AttachmentUploadResult =
  | {readonly ok: true; readonly attachment: LlmAttachment}
  | {
      readonly ok: false;
      readonly reason: 'session-not-found' | SaveAttachmentFailureReason;
    };

/** The result shape `describeAttachment` structurally satisfies on both services. */
type AttachmentDescribeResult =
  | {readonly ok: true; readonly descriptor: AttachmentDescriptor}
  | {
      readonly ok: false;
      readonly reason: 'session-not-found' | 'attachment-not-found';
    };

/** The result shape `removeAttachment` structurally satisfies on both services. */
type AttachmentRemoveResult =
  | {readonly ok: true}
  | {
      readonly ok: false;
      readonly reason: 'session-not-found' | 'attachment-not-found';
    };

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
  ): Promise<AttachmentUploadResult>;
  describeAttachment(
    agentId: string,
    fileName: string,
  ): Promise<AttachmentDescribeResult>;
  removeAttachment(
    agentId: string,
    fileName: string,
  ): Promise<AttachmentRemoveResult>;
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
    if (!result.ok) {
      switch (result.reason) {
        case 'session-not-found': {
          ctx.response.status = StatusCodes.NOT_FOUND;
          ctx.response.body = {error: `Session not found: ${id}`};
          return;
        }
        case 'too-large': {
          ctx.response.status = StatusCodes.REQUEST_TOO_LONG;
          ctx.response.body = {error: result.reason};
          return;
        }
        case 'invalid-name':
        case 'unsupported-type':
        case 'name-unavailable': {
          ctx.response.status = StatusCodes.BAD_REQUEST;
          ctx.response.body = {error: result.reason};
          return;
        }
      }
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
    if (!found.ok) {
      switch (found.reason) {
        case 'session-not-found':
        case 'attachment-not-found': {
          ctx.response.status = StatusCodes.NOT_FOUND;
          ctx.response.body = {error: 'Attachment not found'};
          return;
        }
      }
    }

    const {descriptor} = found;

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
    ctx.response.etag = `${descriptor.attachment.byteSize}-${descriptor.mtimeMs}`;

    if (ctx.fresh) {
      ctx.response.status = StatusCodes.NOT_MODIFIED;
      return;
    }

    // Opens the file — and so surfaces a concurrent DELETE's ENOENT — before
    // any header below commits the response. `describeAttachment` above
    // already validated the file existed, but that check and this open are
    // two separate moments; a DELETE landing in between must still end in
    // the same 404 every other missing-attachment path returns, not an
    // opaque mid-stream error after the response has already started (once
    // `ctx.body` is assigned and Koa begins flushing, the status can no
    // longer change). Same TOCTOU family as `describe`'s sniff and
    // `readBase64`'s read inside the store — just at the route layer, where
    // it must degrade to an HTTP status instead of a `null`/reason object.
    //
    // Opening the file also closes the window for good, not just narrows it:
    // once the fd is open, a concurrent `unlink` no longer matters — POSIX
    // keeps an open file's data reachable through its existing descriptor
    // until every consumer closes it.
    let fileHandle: FileHandle;
    try {
      fileHandle = await open(descriptor.absolutePath, 'r');
    } catch (error: unknown) {
      if (isFileNotFoundError(error)) {
        ctx.response.status = StatusCodes.NOT_FOUND;
        ctx.response.body = {error: 'Attachment not found'};
        return;
      }
      throw error;
    }

    ctx.response.type = descriptor.attachment.mediaType;
    ctx.response.length = descriptor.attachment.byteSize;
    // The sniffed Content-Type above is trustworthy (never client-supplied),
    // but nosniff still stops a browser from second-guessing it based on the
    // bytes. `inline`, not `attachment`, is deliberate: the frontend renders
    // these images in the message stream next round — the escaped filename
    // is only for when a user chooses to save the file themselves.
    ctx.response.set('X-Content-Type-Options', 'nosniff');
    ctx.response.set(
      'Content-Disposition',
      `inline; filename="${escapeContentDispositionFilename(descriptor.attachment.fileName)}"`,
    );
    ctx.body = fileHandle.createReadStream();
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
    if (!removed.ok) {
      switch (removed.reason) {
        case 'session-not-found':
        case 'attachment-not-found': {
          ctx.response.status = StatusCodes.NOT_FOUND;
          ctx.response.body = {error: 'Attachment not found'};
          return;
        }
      }
    }

    ctx.response.status = StatusCodes.NO_CONTENT;
  });
}
