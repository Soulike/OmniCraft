import assert from 'node:assert';
import crypto from 'node:crypto';
import type {Stats} from 'node:fs';
import {
  chmod,
  link,
  lstat,
  mkdir,
  readFile,
  rm,
  unlink,
} from 'node:fs/promises';
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

/**
 * The mode a frozen attachment is set to — readable by its owner, writable by
 * nobody. See {@link freeze}.
 */
const FROZEN_MODE = 0o400;

/**
 * Owner-write. Its absence is the frozen marker: a fresh attachment is written
 * `0600` (see `writeCapped`), so this one bit distinguishes "still editable"
 * from "already sent". Keeping the marker in the file mode rather than in a
 * separate list is what makes it survive a restart, stay correct across
 * compaction, and need no snapshot schema of its own.
 */
const OWNER_WRITE_MODE = 0o200;

export type RemoveAttachmentFailureReason = 'not-found' | 'frozen';

export type RemoveAttachmentResult =
  | {readonly ok: true}
  | {readonly ok: false; readonly reason: RemoveAttachmentFailureReason};

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

/** Result of claiming caller-supplied file names for a turn,
 *  as returned by `Agent.claimAttachments`. The failure variants mirror the
 *  session services' own `SendCompletionResult` reasons, so a service forwards
 *  them rather than re-deriving them. */
export type ClaimAttachmentsResult =
  | {readonly ok: true; readonly attachments: LlmAttachment[]}
  | {
      readonly ok: false;
      readonly reason: 'unknown-attachments';
      readonly missing: string[];
    }
  | {
      readonly ok: false;
      readonly reason: 'attachments-too-large';
      readonly totalBytes: number;
      readonly limit: number;
    };

/**
 * A session's blob store for binary LLM input, rooted at
 * `<scratchDirectory>/attachments/`.
 *
 * Deliberately source-agnostic: it knows only `{fileName, mediaType, byteSize}`
 * and takes a stream, never an HTTP request, so a producer holding in-memory
 * bytes can use it without going through the upload endpoint. A user upload is
 * its first producer; tool results are expected to follow
 * (https://github.com/Soulike/OmniCraft/issues/388).
 *
 * This is the whole trust boundary for attachment bytes — name sanitizing,
 * magic-byte type sniffing, size caps, collision-free placement, and the
 * refusal to read or write through anything that is not a regular file
 * directly inside a real attachments directory all live here.
 */
class AgentAttachmentStore {
  /** The attachments directory for a session, given its scratch directory. */
  directory(scratchDirectory: string): string {
    return path.join(scratchDirectory, 'attachments');
  }

  /**
   * Confirms `directory` — the session's attachments directory — is either
   * absent or a real directory, never a symlink. Every path below it
   * (`resolveInside`'s callers, `save`'s temp file, `placeUniquely`'s hard
   * links) is built by joining onto `directory` and then opened by path, so a
   * symlink planted at this exact segment would redirect all of them to a
   * location this store does not own — and `mkdir(recursive)` treats that
   * symlink as "already exists" and silently leaves it in place rather than
   * erroring.
   *
   * `lstat`, not `stat`: a symlink must be identified before it is followed,
   * not after resolving through it to whatever it points at. This mirrors
   * `AgentScratchDirectoryService.createScratchDirectory`'s guard on the
   * `{agentId}` segment, for the same reason.
   *
   * Returns `false` when `directory` does not exist yet — an ordinary
   * pre-first-save state every read path already treats as "nothing here" —
   * and throws when it exists but is not a real directory. A planted symlink
   * is not a client input error; it is a tampered scratch space, so it
   * surfaces as a thrown error rather than a `SaveAttachmentFailureReason` or
   * a quiet `null`/`false`.
   */
  private async verifyRealDirectoryOrAbsent(
    directory: string,
  ): Promise<boolean> {
    let stats: Stats;
    try {
      stats = await lstat(directory);
    } catch (error: unknown) {
      if (isFileNotFoundError(error)) return false;
      throw error;
    }
    if (!stats.isDirectory()) {
      throw new Error(
        `Attachments directory is not a real directory: ${directory}`,
      );
    }
    return true;
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
    // `mkdir(recursive)` treats a symlink already sitting at `directory` as
    // "already exists" and leaves it untouched, so `verifyRealDirectoryOrAbsent`
    // must run after it to reject a planted symlink before anything below is
    // written through it. `assert`, not another `if`/return: `mkdir` above
    // guarantees `directory` exists by the time it resolves (barring a
    // concurrent `rm -rf` of the whole scratch tree, which is not this
    // store's problem to handle), so the `false` (absent) case here is an
    // invariant violation, not a reachable business outcome.
    await mkdir(directory, {recursive: true, mode: 0o700});
    assert(
      await this.verifyRealDirectoryOrAbsent(directory),
      `Attachments directory disappeared immediately after creation: ${directory}`,
    );

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
    const directory = this.directory(scratchDirectory);
    if (!(await this.verifyRealDirectoryOrAbsent(directory))) return null;

    const absolutePath = resolveInside(directory, fileName);
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
   * Marks attachments read-only, pinning their bytes for the rest of the
   * session. Returns the names that could not be frozen because they were no
   * longer there — the caller folds those into its own missing-attachment
   * channel rather than reporting a turn built on bytes that just vanished.
   *
   * Called the moment an attachment enters the model's history, and never
   * undone. Before that point a name is an ordinary mutable file: it can be
   * deleted, and the next upload of the same desired name reclaims it. After
   * it, the recorded `byteSize` is a permanent fact about the bytes on disk —
   * which is what the compaction byte budget, the per-message cap, and the
   * per-file caps all quietly assume. Without this, a name could be deleted
   * and re-uploaded with different bytes after the descriptor was accepted,
   * so a request would materialize bytes the accounting never saw, and a
   * historical turn's content could change under a model that had already
   * reasoned about it.
   *
   * The mode is the marker; there is no separate registry. `remove` refuses a
   * file without {@link OWNER_WRITE_MODE}, and the read-only bit also makes an
   * in-place overwrite from the agent's shell fail rather than silently
   * succeed. That is protection against a mistake, not against intent: the
   * agent runs as this process's own user, so it could `chmod` the bit back.
   * The system prompt tells it why not to (see `attachmentInstructions`); a
   * file already delivered to the model never needs editing again.
   */
  async freeze(
    scratchDirectory: string,
    fileNames: readonly string[],
  ): Promise<string[]> {
    const directory = this.directory(scratchDirectory);
    if (!(await this.verifyRealDirectoryOrAbsent(directory))) {
      return [...fileNames];
    }

    const frozen = await Promise.all(
      fileNames.map((fileName) => this.freezeOne(directory, fileName)),
    );
    return fileNames.filter((_fileName, index) => !frozen[index]);
  }

  /** Freezes one file, reporting whether it was still there to freeze. */
  private async freezeOne(
    directory: string,
    fileName: string,
  ): Promise<boolean> {
    const absolutePath = resolveInside(directory, fileName);
    if (absolutePath === null) return false;

    // `chmod` follows symlinks, so it would otherwise change the mode of
    // whatever a planted link points at — a file this store does not own.
    // `statRegularFile` lstats, so a symlink fails this check instead.
    if ((await statRegularFile(absolutePath)) === null) return false;

    try {
      await chmod(absolutePath, FROZEN_MODE);
      return true;
    } catch (error: unknown) {
      // Same race the read paths handle: a concurrent `remove()` between the
      // stat above and this call. Anything else is a real failure.
      if (isFileNotFoundError(error)) return false;
      throw error;
    }
  }

  /**
   * Deletes an attachment, refusing one already frozen by {@link freeze}.
   * Validates the path and stats the file directly rather than delegating to
   * {@link describe} — deletion must still work on a file that no longer
   * sniffs as a supported media type (for example, one truncated mid-write),
   * which `describe` refuses to touch.
   */
  async remove(
    scratchDirectory: string,
    fileName: string,
  ): Promise<RemoveAttachmentResult> {
    const directory = this.directory(scratchDirectory);
    if (!(await this.verifyRealDirectoryOrAbsent(directory))) {
      return {ok: false, reason: 'not-found'};
    }

    const absolutePath = resolveInside(directory, fileName);
    if (absolutePath === null) return {ok: false, reason: 'not-found'};

    // `lstat` first to gate out directories: `unlink` throws on one (EPERM on
    // macOS/BSD, EISDIR on Linux — the code alone isn't a reliable signal, so
    // this can't be told apart by catching afterward), and left uncaught that
    // turns every DELETE for a directory planted at an attachment name into a
    // 500 that leaves the entry permanently undeletable. `lstat`, not `stat`,
    // and gating on `isDirectory()` rather than requiring `isFile()`: a
    // symlink (to a file, a directory, or nothing) must still fall through to
    // `unlink` below, which removes the link itself without following it —
    // requiring `isFile()` would refuse a symlink outright and leave it stuck
    // exactly like a directory would be.
    let stats;
    try {
      stats = await lstat(absolutePath);
    } catch (error: unknown) {
      if (isFileNotFoundError(error)) return {ok: false, reason: 'not-found'};
      throw error;
    }
    if (stats.isDirectory()) return {ok: false, reason: 'not-found'};

    // The same `lstat` answers whether the file is frozen. A symlink is
    // unaffected: `lstat` reports the link's own mode (0777 on macOS/Linux),
    // never the target's, so a planted link stays deletable.
    if ((stats.mode & OWNER_WRITE_MODE) === 0) {
      return {ok: false, reason: 'frozen'};
    }

    // Only ENOENT means "there was nothing to delete"; anything else is a real
    // failure and must not be reported as a clean miss.
    try {
      await unlink(absolutePath);
      return {ok: true};
    } catch (error: unknown) {
      if (isFileNotFoundError(error)) return {ok: false, reason: 'not-found'};
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

      // `base` is sliced from `sanitized`, a fixed point of `sanitizeFileName`
      // on entry — but swapping in the extension that matches the *sniffed*
      // media type can rebuild a name the sanitizer would not accept back,
      // even though nothing here re-checks it: stem `con` plus `.png`
      // reconstitutes the Windows-reserved `con.png`, which
      // `sanitizeFileName('con.png')` rejects. Skipping a non-fixed-point
      // candidate preserves the invariant every read path depends on (a name
      // `save()` returns is always a name `resolveInside` accepts back)
      // instead of linking a file no read path can ever look up again.
      //
      // This can only reject the bare, unsuffixed candidate (index 1): the
      // Windows-reserved check matches only an *exact* reserved word before
      // the extension, and every later candidate's ` (${index})` suffix
      // breaks that exact match. So a legitimate upload never actually
      // exhausts `MAX_PLACEMENT_ATTEMPTS` over this — it lands one candidate
      // later, on `<stem> (2)<ext>`, instead of the bare name.
      if (sanitizeFileName(candidate) !== candidate) continue;

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
