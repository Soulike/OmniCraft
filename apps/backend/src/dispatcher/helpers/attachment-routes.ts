import type {Readable} from 'node:stream';

import type Router from '@koa/router';
import {uploadAttachmentQuerySchema} from '@omnicraft/api-schema';
import type {
  DocumentMediaType,
  ImageMediaType,
  LlmAttachment,
} from '@omnicraft/tool-schemas';
import {StatusCodes} from 'http-status-codes';
import {ZodError} from 'zod';

import type {
  AttachmentDescriptor,
  OpenedAttachment,
  SaveAttachmentFailureReason,
} from '@/agent-core/agent/index.js';

import {parseSessionId} from './session-id.js';

/**
 * Whether a stored media type may render in the browser or must download.
 *
 * A `Record` keyed by the union rather than a check for the unsafe types:
 * adding a deliverable media type without deciding this is a compile error,
 * where either default would be a silent answer — and the silent answer a
 * ternary gives is `inline`, the permissive one.
 *
 * Images are `inline` because the frontend renders them in the message stream.
 * A PDF has no such need, and handing an untrusted document to the browser's
 * PDF viewer under the same origin as the agent-control API buys nothing.
 */
const DISPOSITION_BY_MEDIA_TYPE: Readonly<
  Record<ImageMediaType | DocumentMediaType, 'inline' | 'attachment'>
> = {
  'image/png': 'inline',
  'image/jpeg': 'inline',
  'image/gif': 'inline',
  'image/webp': 'inline',
  'application/pdf': 'attachment',
};

export interface AttachmentRoutePaths {
  readonly collection: string;
  readonly byName: string;
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

/** The result shape `openAttachment` structurally satisfies on both services. */
type AttachmentOpenResult =
  | {readonly ok: true; readonly opened: OpenedAttachment}
  | {
      readonly ok: false;
      readonly reason: 'session-not-found' | 'attachment-not-found';
    };

/** The result shape `removeAttachment` structurally satisfies on both services. */
type AttachmentRemoveResult =
  | {readonly ok: true}
  | {
      readonly ok: false;
      readonly reason:
        | 'session-not-found'
        | 'attachment-not-found'
        | 'attachment-frozen';
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
  openAttachment(
    agentId: string,
    fileName: string,
  ): Promise<AttachmentOpenResult>;
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

    // Bytes are NOT immutable for a given name until the attachment is sent:
    // `remove` frees the name, and the very next upload of the same desired
    // name reclaims it via `placeUniquely` (which always starts at the bare,
    // unsuffixed name), with different bytes. So this must revalidate on every
    // request rather than caching for a year — a strong `ETag` derived from
    // the file's size and mtime lets that revalidation cost a 304 instead of a
    // re-download. Set explicitly so the /api default of `no-store` does not
    // apply (see the conditional middleware in dispatcher/index.ts).
    //
    // This `ETag` decides the 304 only. It is the freshest information
    // available without opening the file, which is the whole point of the fast
    // path. A response that does carry a body re-derives it below from the
    // open handle, so the validator always describes the bytes actually sent.
    ctx.response.status = StatusCodes.OK;
    ctx.response.set('Cache-Control', 'private, max-age=0, must-revalidate');
    ctx.response.etag = `${descriptor.attachment.lastKnownByteSize}-${descriptor.mtimeMs}`;

    // Set before the freshness check, not after, so a 304 carries them too. A
    // compliant cache reuses the stored 200's metadata, so this changes nothing
    // for one — but it means the hardening does not depend on that merge being
    // done right by whatever is in front of us.
    //
    // The sniffed Content-Type is trustworthy (never client-supplied), but
    // nosniff still stops a browser second-guessing it from the bytes.
    // `sandbox` only binds when the response is loaded as a document, so it
    // costs an `<img>` nothing and strips the origin from a direct navigation.
    // `attachment` is called after `ctx.response.type` deliberately: it would
    // otherwise guess the type from the file extension, and the sniffed media
    // type is the trustworthy one.
    ctx.response.type = descriptor.attachment.mediaType;
    ctx.response.set('X-Content-Type-Options', 'nosniff');
    ctx.response.set('Content-Security-Policy', 'sandbox');
    ctx.response.attachment(descriptor.attachment.fileName, {
      type: DISPOSITION_BY_MEDIA_TYPE[descriptor.attachment.mediaType],
    });

    if (ctx.fresh) {
      ctx.response.status = StatusCodes.NOT_MODIFIED;
      return;
    }

    // Asks the store to open it, rather than taking a path and opening it
    // here. A path would be a second resolution of a name the descriptor above
    // already resolved, and everything that went wrong in this module went
    // wrong in exactly that gap — a symlink, a swapped parent, a replaced
    // file. A handle cannot be re-resolved, so this route no longer has the
    // opportunity.
    //
    // It also surfaces a concurrent DELETE before any header below commits the
    // response: once `ctx.body` is assigned and Koa begins flushing, the status
    // can no longer change. And once the fd is open, a concurrent `unlink` no
    // longer matters — POSIX keeps an open file's data reachable through its
    // existing descriptor until every consumer closes it.
    const opened = await service.openAttachment(id, ctx.params.fileName);
    if (!opened.ok) {
      switch (opened.reason) {
        case 'session-not-found':
        case 'attachment-not-found': {
          ctx.response.status = StatusCodes.NOT_FOUND;
          ctx.response.body = {error: 'Attachment not found'};
          return;
        }
      }
    }

    // Nothing closes this handle explicitly, and that is correct: the read
    // stream owns it and closes it when it ends *or* when it is destroyed,
    // which Koa does on response finish — so an abandoned download does not
    // leak a descriptor. Both are pinned by tests, because "correct" here
    // rests on `autoClose` defaulting to true.
    //
    // Until the stream exists, though, nothing owns it. The two assignments
    // below cannot realistically throw, but that is an argument from reading
    // the code rather than from its shape, so the handle is closed explicitly
    // if they ever do.
    const {handle, attachment, mtimeMs} = opened.opened;
    try {
      // Every header describing the body is re-set from the opened handle, not
      // just the size. `describe` and this open are two resolutions of one
      // name, and an unfrozen attachment can change between them — the store
      // can genuinely report `image/png` from the first and `application/pdf`
      // from the second, which would have advertised an inline PNG while
      // streaming PDF bytes. The descriptor-derived values above exist only to
      // decide the 304, which sends no body.
      ctx.response.length = attachment.lastKnownByteSize;
      ctx.response.etag = `${attachment.lastKnownByteSize}-${mtimeMs}`;
      ctx.response.type = attachment.mediaType;
      ctx.response.attachment(attachment.fileName, {
        type: DISPOSITION_BY_MEDIA_TYPE[attachment.mediaType],
      });
    } catch (error: unknown) {
      await handle.close();
      throw error;
    }
    ctx.body = handle.createReadStream();
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
        // Not a 404 and not a 403: the attachment is there and the caller is
        // allowed to ask — the request conflicts with a state the resource
        // has already reached and cannot leave. Deleting it would let the
        // name be reclaimed by a different file, breaking the guarantee that
        // a `lastKnownByteSize` recorded in history still describes the bytes on disk.
        case 'attachment-frozen': {
          ctx.response.status = StatusCodes.CONFLICT;
          ctx.response.body = {
            error:
              'Attachment has been sent to the model and can no longer be removed',
          };
          return;
        }
      }
    }

    ctx.response.status = StatusCodes.NO_CONTENT;
  });
}
