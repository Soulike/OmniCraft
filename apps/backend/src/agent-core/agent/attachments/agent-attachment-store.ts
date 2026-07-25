import crypto from 'node:crypto';
import {createWriteStream, type Stats} from 'node:fs';
import {link, lstat, mkdir, readFile, rm, unlink} from 'node:fs/promises';
import path from 'node:path';
import {type Readable, Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';

import type {
  DocumentMediaType,
  ImageMediaType,
  LlmAttachment,
} from '@omnicraft/tool-schemas';
import {
  documentMediaTypeSchema,
  imageMediaTypeSchema,
} from '@omnicraft/tool-schemas';
import {fileTypeFromFile} from 'file-type';

import {isFileExistsError, isFileNotFoundError} from '@/helpers/fs.js';

/** Max bytes for an image attachment. Anthropic's own per-image limit is 5 MB,
 *  and image token cost is flat regardless of file size, so a larger cap costs
 *  request bytes rather than tokens. */
export const MAX_IMAGE_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/** Max bytes for a PDF attachment. Held well under the provider's 32 MB request
 *  limit because PDF token cost scales with page count while our estimate is
 *  flat — see https://github.com/Soulike/OmniCraft/issues/373. */
export const MAX_DOCUMENT_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const MAX_ANY_ATTACHMENT_BYTES = Math.max(
  MAX_IMAGE_ATTACHMENT_BYTES,
  MAX_DOCUMENT_ATTACHMENT_BYTES,
);

const MAX_FILE_NAME_LENGTH = 255;

/** Placement attempts before a save gives up. Bounded so a directory another
 *  writer is filling fails cleanly instead of spinning forever. */
const MAX_PLACEMENT_ATTEMPTS = 100;

/** Conservative NAME_MAX for typical filesystems (ext4, APFS, ...). Bounds
 *  how long a stored file name is allowed to be in bytes, as opposed to the
 *  character count `MAX_FILE_NAME_LENGTH` bounds. */
const NAME_MAX_BYTES = 255;

/** The longest suffix `placeUniquely` can append, e.g. ` (100)` when
 *  `MAX_PLACEMENT_ATTEMPTS` is 100. Reserved up front so the stem is budgeted
 *  for the worst case rather than just the first candidate. */
const LONGEST_PLACEMENT_SUFFIX = ` (${MAX_PLACEMENT_ATTEMPTS})`;

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

export interface OpenedAttachment {
  readonly attachment: LlmAttachment;
  readonly absolutePath: string;
}

/**
 * Whether `character` is a C0 control character or DEL. Checked by code point
 * rather than a regex: a control-character class in a regex literal trips
 * eslint's `no-control-regex` and is easy to corrupt when the source is
 * copied around.
 */
function isControlCharacter(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return code < 0x20 || code === 0x7f;
}

/** Whether any code point in `raw` is a control character. */
function hasControlCharacter(raw: string): boolean {
  for (const character of raw) {
    if (isControlCharacter(character)) return true;
  }
  return false;
}

/**
 * Reduces a client-supplied name to a bare, printable file name. Returns `null`
 * when nothing usable survives. Never used to build a path on its own — the
 * result is re-checked by {@link resolveInside}.
 */
function sanitizeFileName(raw: string): string | null {
  let printable = '';
  for (const character of raw) {
    if (isControlCharacter(character)) continue;
    printable += character;
  }
  printable = printable.trim();
  // Split on both separators so a Windows-style path is reduced too; POSIX
  // `path.basename` would keep `sub\shot.png` whole.
  const base = printable.split(/[/\\]/).pop() ?? '';
  if (base === '' || base === '.' || base === '..') return null;
  return base.slice(0, MAX_FILE_NAME_LENGTH);
}

/**
 * Resolves `fileName` inside `directory`, or `null` when it is not a bare
 * name. A bare name cannot escape via `path.join`; the remaining risks are a
 * control character (which some fs calls reject with a throw rather than
 * `ENOENT`, breaking the read paths' "returns null" contract) and a symlink
 * planted at the leaf, which the `lstat` in the read paths rejects.
 */
function resolveInside(directory: string, fileName: string): string | null {
  if (fileName === '' || fileName === '.' || fileName === '..') return null;
  if (hasControlCharacter(fileName)) return null;
  if (fileName !== path.basename(fileName)) return null;
  if (fileName.includes('/') || fileName.includes('\\')) return null;
  return path.join(directory, fileName);
}

/**
 * Trims `stem` — by code point, never inside a multi-byte character — so
 * that `stem` plus the longest possible uniquify suffix plus `extension`
 * fits within `NAME_MAX_BYTES`. `sanitizeFileName` only bounds the name by
 * character count, which a name made mostly of multi-byte characters can
 * still blow past in bytes, turning `placeUniquely`'s `link` into an
 * unhandled `ENAMETOOLONG`.
 */
function budgetStem(stem: string, extension: string): string {
  const budget =
    NAME_MAX_BYTES -
    Buffer.byteLength(LONGEST_PLACEMENT_SUFFIX) -
    Buffer.byteLength(extension);

  const codePoints = Array.from(stem);
  while (Buffer.byteLength(codePoints.join('')) > budget) {
    codePoints.pop();
  }
  const budgeted = codePoints.join('');
  return budgeted === '' ? 'attachment' : budgeted;
}

function capFor(mediaType: ImageMediaType | DocumentMediaType): number {
  return mediaType === 'application/pdf'
    ? MAX_DOCUMENT_ATTACHMENT_BYTES
    : MAX_IMAGE_ATTACHMENT_BYTES;
}

/** Thrown by `writeCapped`'s capping transform to unwind out of `pipeline`
 *  once `cap` is exceeded — distinguished from a genuine filesystem failure
 *  so the two are never confused with one another. */
class AttachmentTooLargeError extends Error {}

/**
 * Streams `body` to `destination`, aborting once `cap` is exceeded. Returns
 * the byte count, or `null` when the cap was blown. `pipeline` owns error
 * propagation and teardown for every stream in the chain — including the
 * destination file's open and flush — so a failed open or a mid-write
 * failure rejects instead of surfacing as an unhandled `'error'` event, and a
 * flush failure rejects instead of being reported as a successful write. The
 * payload is never fully buffered, so an oversized upload costs bounded
 * memory.
 */
async function writeCapped(
  body: Readable,
  destination: string,
  cap: number,
): Promise<number | null> {
  let byteSize = 0;
  const capping = new Transform({
    transform(
      chunk: unknown,
      _encoding: BufferEncoding,
      callback: (error?: Error | null, data?: Buffer) => void,
    ) {
      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk as string);
      byteSize += buffer.length;
      if (byteSize > cap) {
        callback(new AttachmentTooLargeError());
        return;
      }
      callback(null, buffer);
    },
  });

  try {
    await pipeline(
      body,
      capping,
      createWriteStream(destination, {mode: 0o600}),
    );
    return byteSize;
  } catch (error: unknown) {
    if (error instanceof AttachmentTooLargeError) return null;
    throw error;
  }
}

/** Narrows a sniffed MIME string to a deliverable media type. */
function toMediaType(
  mime: string | undefined,
): ImageMediaType | DocumentMediaType | null {
  if (mime === undefined) return null;
  const image = imageMediaTypeSchema.safeParse(mime);
  if (image.success) return image.data;
  const document = documentMediaTypeSchema.safeParse(mime);
  if (document.success) return document.data;
  return null;
}

/**
 * lstat's `absolutePath`, returning its stats when it is a regular file and
 * `null` when it is missing or something else. `lstat`, never `stat`: a
 * symlink planted at the leaf must be rejected rather than followed to a
 * target outside the session.
 */
async function statRegularFile(absolutePath: string): Promise<Stats | null> {
  try {
    const stats = await lstat(absolutePath);
    return stats.isFile() ? stats : null;
  } catch (error: unknown) {
    if (isFileNotFoundError(error)) return null;
    throw error;
  }
}

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
    await mkdir(directory, {recursive: true, mode: 0o700});

    const temporaryPath = path.join(directory, `.${crypto.randomUUID()}.tmp`);

    try {
      // The type is unknown until the bytes are on disk, so guard with the
      // larger cap first and re-check against the type-specific one after.
      const byteSize = await writeCapped(
        body,
        temporaryPath,
        MAX_ANY_ATTACHMENT_BYTES,
      );
      if (byteSize === null) return {ok: false, reason: 'too-large'};

      const detected = await fileTypeFromFile(temporaryPath);
      const mediaType = toMediaType(detected?.mime);
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
  ): Promise<OpenedAttachment | null> {
    const absolutePath = resolveInside(
      this.directory(scratchDirectory),
      fileName,
    );
    if (absolutePath === null) return null;

    const stats = await statRegularFile(absolutePath);
    if (stats === null) return null;

    const mediaType = toMediaType((await fileTypeFromFile(absolutePath))?.mime);
    if (mediaType === null) return null;

    return {
      attachment: {fileName, mediaType, byteSize: stats.size},
      absolutePath,
    };
  }

  /** Reads an attachment's bytes as base64, or `null` when it is gone. */
  async readBase64(
    scratchDirectory: string,
    fileName: string,
  ): Promise<string | null> {
    const found = await this.describe(scratchDirectory, fileName);
    if (found === null) return null;
    return (await readFile(found.absolutePath)).toString('base64');
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

    const stats = await statRegularFile(absolutePath);
    if (stats === null) return false;

    await unlink(absolutePath);
    return true;
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
