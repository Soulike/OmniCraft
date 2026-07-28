import type {Stats} from 'node:fs';
import {constants} from 'node:fs';
import type {FileHandle} from 'node:fs/promises';
import {open} from 'node:fs/promises';
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
  SaveAttachmentFailureReason,
} from '@/agent-core/agent/index.js';
import {isFileNotFoundError, isSymlinkRefusedError} from '@/helpers/fs.js';

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

    if (ctx.fresh) {
      ctx.response.status = StatusCodes.NOT_MODIFIED;
      return;
    }

    // `O_NOFOLLOW`, because `open` by path follows symlinks and `describe`'s
    // refusal of them does not carry over — the two resolve the same name at
    // different moments, so a link planted in between would be followed and
    // this handler would stream a file from outside the store with a 200.
    // `O_NONBLOCK` for the same family of plant: opening a FIFO blocks until a
    // writer appears, which would hang the request rather than fail it.
    // Neither flag changes anything for a regular file.
    //
    // Opening also surfaces a concurrent DELETE's ENOENT before any header
    // below commits the response. `describeAttachment` above already validated
    // the file existed, but that check and this open are two separate moments;
    // a DELETE landing in between must still end in the same 404 every other
    // missing-attachment path returns, not an opaque mid-stream error after the
    // response has already started (once `ctx.body` is assigned and Koa begins
    // flushing, the status can no longer change). Same TOCTOU family as
    // `describe`'s sniff and `readBase64`'s read inside the store — just at the
    // route layer, where it must degrade to an HTTP status instead of a
    // `null`/reason object.
    //
    // Opening the file also closes the unlink window for good, not just narrows
    // it: once the fd is open, a concurrent `unlink` no longer matters — POSIX
    // keeps an open file's data reachable through its existing descriptor until
    // every consumer closes it.
    let fileHandle: FileHandle;
    try {
      fileHandle = await open(
        descriptor.absolutePath,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
    } catch (error: unknown) {
      // A missing file and a planted symlink are the same answer to a client:
      // nothing servable under this name. Anything else (EACCES, EIO, ...) is a
      // real failure and must not be laundered into a 404.
      if (isFileNotFoundError(error) || isSymlinkRefusedError(error)) {
        ctx.response.status = StatusCodes.NOT_FOUND;
        ctx.response.body = {error: 'Attachment not found'};
        return;
      }
      throw error;
    }

    // Size and validator are re-read from the OPEN file, not reused from
    // `describe`'s earlier stat. Both resolve `absolutePath` by name, and they
    // are separate awaits, so a DELETE plus a same-name re-upload landing
    // between them makes `describe`'s `lastKnownByteSize` describe a file this response
    // is not sending — and the failure is silent, not loud: the client stops
    // reading at `Content-Length`, so a larger file arrives truncated and a
    // smaller one hangs, with a matching `ETag` caching the corruption. An
    // `fstat` on the handle is authoritative because the fd already pins the
    // inode, so nothing can swap the file out from under the numbers.
    //
    // Reachable through the API for an attachment that has not been sent yet;
    // a frozen one can only get here if something bypassed the read-only bit.
    let streamed: Stats;
    try {
      streamed = await fileHandle.stat();
    } catch (error: unknown) {
      // Nothing owns the handle until `ctx.body` takes it below, so it has to
      // be closed here or the fd leaks for the process's lifetime.
      await fileHandle.close();
      throw error;
    }

    // `O_NOFOLLOW` only refuses a symlinked *final* component, so it does not
    // stop the path being redirected higher up: renaming the attachments
    // directory and leaving a symlink in its place makes this `open` of the
    // very same string resolve to a file outside the store, and the handler
    // would serve it. Node exposes no `openat`, so the directory cannot be
    // pinned and opened relative to — but the fd does pin an inode, so
    // comparing it against what `describe` looked at binds the response to the
    // file rather than to the name. Any component of the path changing
    // underneath produces a different inode and lands here.
    //
    // The `isFile` check stays: `O_NOFOLLOW` admits a directory or a device
    // node at the final component, and those would otherwise fail mid-stream,
    // after the status is already committed.
    const isSameFile =
      streamed.dev === descriptor.identity.deviceId &&
      streamed.ino === descriptor.identity.inode;
    if (!isSameFile || !streamed.isFile()) {
      await fileHandle.close();
      ctx.response.status = StatusCodes.NOT_FOUND;
      ctx.response.body = {error: 'Attachment not found'};
      return;
    }

    ctx.response.type = descriptor.attachment.mediaType;
    ctx.response.length = streamed.size;
    ctx.response.etag = `${streamed.size}-${streamed.mtimeMs}`;
    // The sniffed Content-Type above is trustworthy (never client-supplied),
    // but nosniff still stops a browser from second-guessing it based on the
    // bytes. `sandbox` is belt to that braces: it only binds when the response
    // is loaded as a document, so it costs an `<img>` nothing, and it strips
    // the origin from anything a user navigates to directly.
    //
    // The media type alone still comes from `describe`, so the same swap can
    // mislabel it. That degrades to a file the browser cannot render rather
    // than to a corrupt download or a cross-type confusion: the type is always
    // one of the five deliverable media types, never anything active, and
    // nosniff holds the browser to it. Fixing it properly means sniffing from
    // this handle, which belongs in the store — it owns magic-byte detection —
    // not open-coded here.
    ctx.response.set('X-Content-Type-Options', 'nosniff');
    ctx.response.set('Content-Security-Policy', 'sandbox');
    // Koa's own helper, which delegates to jshttp's `content-disposition` —
    // hand-rolling this is a trap. A stored name can be non-ASCII (the
    // sanitizer preserves Unicode), and Node's `setHeader` rejects anything
    // outside latin1 with ERR_INVALID_CHAR, so the header needs an ASCII
    // fallback plus an RFC 5987 `filename*`; the package also knows to keep a
    // latin1 name verbatim and skip `filename*` entirely rather than mangling
    // it. Called after `ctx.response.type` is set, because it would otherwise
    // guess the type from the file extension — the sniffed media type is the
    // trustworthy one.
    ctx.response.attachment(descriptor.attachment.fileName, {
      type: DISPOSITION_BY_MEDIA_TYPE[descriptor.attachment.mediaType],
    });
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
