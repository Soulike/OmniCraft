import crypto from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {lstat, mkdir, readFile, rename, rm, unlink} from 'node:fs/promises';
import path from 'node:path';
import type {Readable} from 'node:stream';

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

import {isFileNotFoundError} from '@/helpers/fs.js';

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
  | 'too-large';

export type SaveAttachmentResult =
  | {readonly ok: true; readonly attachment: LlmAttachment}
  | {readonly ok: false; readonly reason: SaveAttachmentFailureReason};

export interface OpenedAttachment {
  readonly attachment: LlmAttachment;
  readonly absolutePath: string;
}

/**
 * Reduces a client-supplied name to a bare, printable file name. Returns `null`
 * when nothing usable survives. Never used to build a path on its own — the
 * result is re-checked by {@link resolveInside}.
 */
function sanitizeFileName(raw: string): string | null {
  // Checked by code point rather than a regex: a control-character class in a
  // regex literal trips eslint's `no-control-regex` and is easy to corrupt when
  // the source is copied around. Same approach as parseAttachmentFileName.
  let printable = '';
  for (const character of raw) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) continue;
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
 * Resolves `fileName` inside `directory`, or `null` when it is not a bare name.
 * A bare name cannot escape via `path.join`; the remaining risk is a symlink
 * planted at the leaf, which the `lstat` in the read paths rejects.
 */
function resolveInside(directory: string, fileName: string): string | null {
  if (fileName === '' || fileName === '.' || fileName === '..') return null;
  if (fileName !== path.basename(fileName)) return null;
  if (fileName.includes('/') || fileName.includes('\\')) return null;
  return path.join(directory, fileName);
}

function capFor(mediaType: ImageMediaType | DocumentMediaType): number {
  return mediaType === 'application/pdf'
    ? MAX_DOCUMENT_ATTACHMENT_BYTES
    : MAX_IMAGE_ATTACHMENT_BYTES;
}

/**
 * Streams `body` to `destination`, aborting once `cap` is exceeded. Returns the
 * byte count, or `null` when the cap was blown. The payload is never fully
 * buffered, so an oversized upload costs bounded memory.
 */
async function writeCapped(
  body: Readable,
  destination: string,
  cap: number,
): Promise<number | null> {
  const out = createWriteStream(destination, {mode: 0o600});
  let byteSize = 0;
  try {
    for await (const chunk of body) {
      const buffer = chunk as Buffer;
      byteSize += buffer.length;
      if (byteSize > cap) return null;
      if (!out.write(buffer)) {
        await new Promise<void>((resolve, reject) => {
          out.once('drain', resolve);
          out.once('error', reject);
        });
      }
    }
    await new Promise<void>((resolve, reject) => {
      out.end(resolve);
      out.once('error', reject);
    });
    return byteSize;
  } finally {
    out.destroy();
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

    // lstat, not stat: a symlink planted at the leaf must be rejected rather
    // than followed to a target outside the session.
    let byteSize: number;
    try {
      const stats = await lstat(absolutePath);
      if (!stats.isFile()) return null;
      byteSize = stats.size;
    } catch (error: unknown) {
      if (isFileNotFoundError(error)) return null;
      throw error;
    }

    const mediaType = toMediaType((await fileTypeFromFile(absolutePath))?.mime);
    if (mediaType === null) return null;

    return {attachment: {fileName, mediaType, byteSize}, absolutePath};
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

  /** Deletes an attachment. Returns whether it existed. */
  async remove(scratchDirectory: string, fileName: string): Promise<boolean> {
    const found = await this.describe(scratchDirectory, fileName);
    if (found === null) return false;
    await unlink(found.absolutePath);
    return true;
  }

  /**
   * Moves the temp file to `<stem><suffix><ext>`, picking the first free suffix.
   * `rename` would clobber an existing file, so this probes with `lstat` and
   * retries — a benign race in a single-process local server.
   */
  private async placeUniquely(
    directory: string,
    temporaryPath: string,
    sanitized: string,
    mediaType: ImageMediaType | DocumentMediaType,
  ): Promise<string> {
    const extension = EXTENSION_BY_MEDIA_TYPE[mediaType];
    const existing = path.extname(sanitized);
    const stem =
      existing === '' ? sanitized : sanitized.slice(0, -existing.length);
    const base = stem === '' ? 'attachment' : stem;

    for (let index = 1; ; index++) {
      const candidate =
        index === 1 ? `${base}${extension}` : `${base} (${index})${extension}`;
      const candidatePath = path.join(directory, candidate);
      try {
        await lstat(candidatePath);
        continue;
      } catch (error: unknown) {
        if (!isFileNotFoundError(error)) throw error;
      }
      await rename(temporaryPath, candidatePath);
      return candidate;
    }
  }
}

export const agentAttachmentStore = new AgentAttachmentStore();
