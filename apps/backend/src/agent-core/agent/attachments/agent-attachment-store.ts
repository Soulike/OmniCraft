import crypto from 'node:crypto';
import {link, mkdir, readFile, rm, unlink} from 'node:fs/promises';
import path from 'node:path';
import type {Readable} from 'node:stream';

import type {
  DocumentMediaType,
  ImageMediaType,
  LlmAttachment,
} from '@omnicraft/tool-schemas';
import {fileTypeFromFile} from 'file-type';

import {
  isFileExistsError,
  isFileNotFoundError,
  statRegularFile,
} from '@/helpers/fs.js';

import type {AttachmentResolution} from '../../llm-api/index.js';
import {budgetStem, MAX_PLACEMENT_ATTEMPTS} from './helpers/budget-stem.js';
import {
  capFor,
  MAX_DOCUMENT_ATTACHMENT_BYTES,
  MAX_IMAGE_ATTACHMENT_BYTES,
} from './helpers/cap-for.js';
import {resolveInside} from './helpers/resolve-inside.js';
import {sanitizeFileName} from './helpers/sanitize-file-name.js';
import {toSupportedMediaType} from './helpers/to-supported-media-type.js';
import {writeCapped} from './helpers/write-capped.js';

const MAX_ANY_ATTACHMENT_BYTES = Math.max(
  MAX_IMAGE_ATTACHMENT_BYTES,
  MAX_DOCUMENT_ATTACHMENT_BYTES,
);

/** The extension each deliverable media type is stored under. The stored name
 *  always matches the sniffed type, so a path list never misdescribes a file. */
const EXTENSION_BY_MEDIA_TYPE: Readonly<
  Record<ImageMediaType | DocumentMediaType, string>
> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

export type SaveAttachmentFailureReason =
  | 'invalid-name'
  | 'unsupported-type'
  | 'too-large'
  | 'name-unavailable';

export type SaveAttachmentResult =
  | {readonly ok: true; readonly attachment: LlmAttachment}
  | {readonly ok: false; readonly reason: SaveAttachmentFailureReason};

export interface AttachmentDescriptor {
  readonly attachment: LlmAttachment;
  readonly absolutePath: string;
  /** The file's last-modified time, in milliseconds since the epoch, from the
   *  same `lstat` `describe` already performs. Exposed so callers can build a
   *  validator (e.g. an `ETag`) without a second stat — a name is not a
   *  stable identifier for a file's bytes here, since `remove` frees it for
   *  reuse by a later, different upload. */
  readonly mtimeMs: number;
}

/** Result of resolving caller-supplied file names to attachment descriptors,
 *  as returned by `Agent.resolveAttachments`. */
export type ResolveAttachmentsResult =
  | {readonly ok: true; readonly attachments: LlmAttachment[]}
  | {readonly ok: false; readonly missing: string[]};

/**
 * Result of materializing an attachment's bytes for delivery to a provider.
 * `reason` distinguishes two situations that must not be conflated: `missing`
 * means the file is gone (so mentioning it is honest, and there's nothing
 * left to act on), while `too-large` means the file is still on disk but
 * grew past its type's cap since it was last described (so the agent can
 * still downsample it and read it again — the same escape hatch `read_file`
 * points at for oversized media).
 */
class AgentAttachmentStore {
  /** The attachments directory for a session, given its scratch directory. */
  directory(scratchDirectory: string): string {
    return path.join(scratchDirectory, 'attachments');
  }

  /**
   * Writes `body` into the session's attachment store under a name derived from
   * `desiredName` and the sniffed media type. The caller's declared content type
   * is never consulted.
   */
  async save(
    scratchDirectory: string,
    desiredName: string,
    body: Readable,
  ): Promise<SaveAttachmentResult> {
    const sanitized = sanitizeFileName(desiredName);
    if (sanitized === null) return {ok: false, reason: 'invalid-name'};

    const directory = this.directory(scratchDirectory);
    // Known, unaddressed gap: `mkdir(recursive)` succeeds through a symlink
    // planted at the `attachments` segment itself (unlike a symlink at a leaf
    // file name, which `lstat` in the read paths rejects), and every
    // subsequent open-by-path under `directory` would follow it. Closing this
    // is a separate decision, not made here.
    await mkdir(directory, {recursive: true, mode: 0o700});

    const temporaryPath = path.join(directory, `.${crypto.randomUUID()}.tmp`);

    try {
      // The type is unknown until the bytes are on disk, so guard with the
      // larger cap first and re-check against the type-specific one after.
      const written = await writeCapped(
        body,
        temporaryPath,
        MAX_ANY_ATTACHMENT_BYTES,
      );
      if (!written.ok) return {ok: false, reason: 'too-large'};
      const {byteSize} = written;

      const detected = await fileTypeFromFile(temporaryPath);
      const mediaType = toSupportedMediaType(detected?.mime);
      if (mediaType === null) return {ok: false, reason: 'unsupported-type'};
      if (byteSize > capFor(mediaType)) return {ok: false, reason: 'too-large'};

      const fileName = await this.placeUniquely(
        directory,
        temporaryPath,
        sanitized,
        mediaType,
      );
      if (fileName === null) return {ok: false, reason: 'name-unavailable'};
      return {ok: true, attachment: {fileName, mediaType, byteSize}};
    } finally {
      await rm(temporaryPath, {force: true});
    }
  }

  /** Returns an attachment's descriptor and absolute path, or `null`. */
  async describe(
    scratchDirectory: string,
    fileName: string,
  ): Promise<AttachmentDescriptor | null> {
    const absolutePath = resolveInside(
      this.directory(scratchDirectory),
      fileName,
    );
    if (absolutePath === null) return null;

    const stats = await statRegularFile(absolutePath);
    if (stats === null) return null;

    // A concurrent `remove()` can unlink the file between the `lstat` above
    // and this sniff — `fileTypeFromFile` opens the file to read its header.
    // Only ENOENT means "the file is gone"; anything else (EACCES, EIO, ...)
    // is a real failure and must not be laundered into a missing-attachment
    // result.
    let detected: Awaited<ReturnType<typeof fileTypeFromFile>>;
    try {
      detected = await fileTypeFromFile(absolutePath);
    } catch (error: unknown) {
      if (isFileNotFoundError(error)) return null;
      throw error;
    }

    const mediaType = toSupportedMediaType(detected?.mime);
    if (mediaType === null) return null;

    return {
      attachment: {fileName, mediaType, byteSize: stats.size},
      absolutePath,
      mtimeMs: stats.mtimeMs,
    };
  }

  /**
   * Reads an attachment's bytes as base64 for delivery to a provider, or a
   * reason it could not be delivered.
   *
   * The size cap is enforced HERE and not in `describe`, deliberately:
   * `describe` also backs the HTTP download endpoint and completions
   * descriptor resolution, where an attachment the agent happened to
   * overwrite with something larger must stay viewable and deletable. The
   * cap is a statement about what a provider request may carry, not about
   * what a user may see.
   *
   * `readFile` itself has no size limit, and `run_command`'s realpath
   * allowlist deliberately covers the scratch space (it is how an oversized
   * image gets downsampled), so the file on disk can be larger than the
   * `byteSize` last recorded for it. `describe` freshly `lstat`s on every
   * call, so its `byteSize` is checked against `capFor(mediaType)` before any
   * byte is read — closing the gap between what compaction certified as safe
   * and what would otherwise be read into memory. A residual TOCTOU window
   * remains (the stat is not the read); it is microseconds wide and the only
   * writer is our own agent, which is why a fresh bounded check is preferred
   * over streaming the read through a capping transform.
   */
  async readBase64(
    scratchDirectory: string,
    fileName: string,
  ): Promise<AttachmentResolution> {
    const found = await this.describe(scratchDirectory, fileName);
    if (found === null) return {data: null, reason: 'missing'};

    const {byteSize, mediaType} = found.attachment;
    if (byteSize > capFor(mediaType)) return {data: null, reason: 'too-large'};

    // Same race as above: `describe` above already stat'd (and, internally,
    // sniffed) the file, but a concurrent `remove()` can still unlink it
    // before this read. Only ENOENT degrades to the missing-attachment
    // placeholder; any other error is a genuine failure and propagates.
    try {
      const bytes = await readFile(found.absolutePath);
      return {data: bytes.toString('base64')};
    } catch (error: unknown) {
      if (isFileNotFoundError(error)) return {data: null, reason: 'missing'};
      throw error;
    }
  }

  /**
   * Deletes an attachment. Returns whether it existed. Validates the path and
   * stats the file directly rather than delegating to {@link describe} —
   * deletion must still work on a file that no longer sniffs as a supported
   * media type (for example, one truncated mid-write), which `describe`
   * refuses to touch.
   */
  async remove(scratchDirectory: string, fileName: string): Promise<boolean> {
    const absolutePath = resolveInside(
      this.directory(scratchDirectory),
      fileName,
    );
    if (absolutePath === null) return false;

    // Unlink and interpret the failure, rather than stat-then-unlink: it drops
    // a TOCTOU window and a syscall, and it can delete things a stat gate
    // would refuse. `unlink` removes a symlink itself rather than following
    // it, so a planted one becomes cleanable instead of permanently stuck.
    // Only ENOENT means "there was nothing to delete"; anything else is a real
    // failure and must not be reported as a clean miss.
    try {
      await unlink(absolutePath);
      return true;
    } catch (error: unknown) {
      if (isFileNotFoundError(error)) return false;
      throw error;
    }
  }

  /**
   * Hard-links the temp file to the first free `<stem><suffix><ext>`, then
   * lets `save()`'s `finally` remove the temp file.
   *
   * `link` fails atomically with EEXIST when the name is taken, so neither a
   * concurrent save nor a writer outside this process can clobber another's
   * bytes — and there IS such a writer: `run_command`'s realpath allowlist
   * covers the scratch space, which is deliberate (it is how an oversized
   * image gets downsampled). A mutex would only serialize our own saves.
   *
   * Returns `null` when every candidate is taken, which the caller surfaces
   * as a `name-unavailable` failure rather than spinning forever.
   */
  private async placeUniquely(
    directory: string,
    temporaryPath: string,
    sanitized: string,
    mediaType: ImageMediaType | DocumentMediaType,
  ): Promise<string | null> {
    const extension = EXTENSION_BY_MEDIA_TYPE[mediaType];
    const existing = path.extname(sanitized);
    const stem =
      existing === '' ? sanitized : sanitized.slice(0, -existing.length);
    const base = budgetStem(stem, extension);

    for (let index = 1; index <= MAX_PLACEMENT_ATTEMPTS; index++) {
      const candidate =
        index === 1 ? `${base}${extension}` : `${base} (${index})${extension}`;
      try {
        await link(temporaryPath, path.join(directory, candidate));
        return candidate;
      } catch (error: unknown) {
        // Anything other than "name taken" is a real filesystem failure and
        // must not be disguised as a business-level result.
        if (!isFileExistsError(error)) throw error;
      }
    }
    return null;
  }
}

export const agentAttachmentStore = new AgentAttachmentStore();
