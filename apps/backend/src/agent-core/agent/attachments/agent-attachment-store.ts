import assert from 'node:assert';
import crypto from 'node:crypto';
import type {Stats} from 'node:fs';
import {constants} from 'node:fs';
import type {FileHandle} from 'node:fs/promises';
import {link, lstat, mkdir, open, rm, unlink} from 'node:fs/promises';
import path from 'node:path';
import type {Readable} from 'node:stream';

import type {
  DocumentMediaType,
  ImageMediaType,
  LlmAttachment,
} from '@omnicraft/tool-schemas';
import {fileTypeFromBuffer} from 'file-type';

import {
  isFileExistsError,
  isFileNotFoundError,
  isSymlinkRefusedError,
} from '@/helpers/fs.js';
import {Mutex} from '@/helpers/mutex.js';

import type {AttachmentResolution} from '../../llm-api/index.js';
import {budgetStem, MAX_PLACEMENT_ATTEMPTS} from './helpers/budget-stem.js';
import {
  capFor,
  MAX_DOCUMENT_ATTACHMENT_BYTES,
  MAX_IMAGE_ATTACHMENT_BYTES,
  MAX_MESSAGE_ATTACHMENT_BYTES,
  totalAttachmentBytes,
} from './helpers/cap-for.js';
import {resolveInside} from './helpers/resolve-inside.js';
import {sanitizeFileName} from './helpers/sanitize-file-name.js';
import {toSupportedMediaType} from './helpers/to-supported-media-type.js';
import {writeCapped} from './helpers/write-capped.js';

/** Bytes read from a file's head to sniff its type. `file-type` documents 4100
 *  as the amount its full detector set may need; every media type this store
 *  delivers is decided in the first few, so this is slack rather than a cost. */
const SNIFF_HEADER_BYTES = 4100;

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

/** What `freezeOne` did. `already-frozen` is deliberately distinct from
 *  `newly-frozen`: only a file this claim transitioned may be released again,
 *  since an earlier message may be relying on one that was frozen before. */
type FreezeOneOutcome =
  | {readonly kind: 'gone'}
  | {
      readonly kind: 'frozen';
      /** The mode before this call, or `null` when it was already frozen —
       *  only a file this claim transitioned may be released again. */
      readonly previousMode: number | null;
      /** Identity of the inode this handle froze. A later release may resolve
       *  the name again, so it must prove that name still reaches this inode. */
      readonly dev: number;
      readonly ino: number;
      /** `null` when the bytes are not a deliverable media type. Described
       *  from the same handle that was frozen, so the descriptor cannot end up
       *  naming a different inode than the one pinned. */
      readonly described: {
        readonly attachment: LlmAttachment;
        readonly mtimeMs: number;
      } | null;
    };

/** A file this claim froze, with its inode identity and the mode it had
 *  beforehand. Carried so a release restores what was actually there:
 *  `freezeOne` accepts any regular file, and `describe` can still reject its
 *  bytes afterwards, so the thing being un-frozen is not necessarily one
 *  `writeCapped` created at `0600`. */
interface FrozenEntry {
  readonly fileName: string;
  readonly previousMode: number;
  readonly dev: number;
  readonly ino: number;
}

interface FreezeOutcome {
  /** Names with nothing deliverable behind them — gone, or frozen but not a
   *  supported media type. Both read as "no such attachment" to a caller. */
  readonly vanished: string[];
  readonly newlyFrozen: FrozenEntry[];
  /** Descriptors taken from the very handles that were frozen. */
  readonly described: LlmAttachment[];
}

export type RemoveAttachmentFailureReason = 'not-found' | 'frozen';

export type RemoveAttachmentResult =
  | {readonly ok: true}
  | {readonly ok: false; readonly reason: RemoveAttachmentFailureReason};

export interface AttachmentDescriptor {
  readonly attachment: LlmAttachment;
  /** The file's last-modified time, in milliseconds since the epoch, from the
   *  same `fstat` that produced everything else here. Exposed so a caller can
   *  build a cache validator without a second look at the file — a name is not
   *  a stable identifier for bytes until the attachment is frozen, since
   *  `remove` frees it for reuse by a later, different upload. */
  readonly mtimeMs: number;
}

/**
 * An attachment opened for streaming, with the facts that describe *that*
 * handle. The caller owns the handle and must close it — or hand it to
 * something that will.
 *
 * Deliberately not a path plus a descriptor. This store used to hand out
 * `absolutePath` and let each caller open it, and every one of them re-resolved
 * a name that something else could redefine in between; that is the whole of
 * this module's bug history. A handle cannot be re-resolved, so a caller
 * holding one cannot reintroduce the problem.
 */
export interface OpenedAttachment {
  readonly handle: FileHandle;
  readonly attachment: LlmAttachment;
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
 * Deliberately source-agnostic: it knows only `{fileName, mediaType, lastKnownByteSize}`
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
  /**
   * Serializes the two operations that change a directory entry's state after
   * checking it: {@link claim} and {@link remove}. Nothing else acquires it, so
   * adding a third mutating path means deciding explicitly whether it belongs
   * here.
   *
   * `claim` freezes, reads sizes, checks the cap, and un-freezes on rejection;
   * `remove` checks the frozen bit and then unlinks. `unlink` succeeds on a
   * `0400` file — deletion depends on the *directory's* mode, not the file's —
   * so an interleaved claim froze a file that a delete then removed anyway,
   * both reporting success. Two concurrent claims naming the same file could
   * likewise interleave so that one's release un-freezes a file the other had
   * already accepted.
   *
   * Unlike the placement race, which `link`'s atomicity settles because writers
   * outside this process also create files here, both racers are our own API
   * calls. That is the case a lock actually covers.
   *
   * `save` stays outside: `placeUniquely` never overwrites (EEXIST falls
   * through to the next candidate), so uploads are already safe against each
   * other and against anything else, and serializing them would put a
   * multi-megabyte write on a shared lock for nothing.
   *
   * One lock shared by every session, not one per scratch directory — coarser
   * than the invariant needs, since entries never cross scratch directories.
   * The guarded sections are a handful of `stat`/`chmod`/`unlink` calls and
   * this is a single-user local tool, so the contention is currently zero.
   * Narrowing it is https://github.com/Soulike/OmniCraft/issues/393.
   */
  private readonly entryMutex = new Mutex();

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
  ): Promise<Stats | null> {
    let stats: Stats;
    try {
      stats = await lstat(directory);
    } catch (error: unknown) {
      if (isFileNotFoundError(error)) return null;
      throw error;
    }
    if (!stats.isDirectory()) {
      throw new Error(
        `Attachments directory is not a real directory: ${directory}`,
      );
    }
    return stats;
  }

  /**
   * Confirms the attachments directory is still the one that was validated.
   *
   * `O_NOFOLLOW` refuses a symlinked *final* component and says nothing about
   * the parents, so renaming `attachments/` and leaving a symlink in its place
   * redirects an open of an unchanged path. Node exposes no `openat`, so the
   * directory cannot be pinned and opened relative to — which means this
   * **narrows the window rather than closing it**: a swap that persists is
   * caught here, a swap reverted before this runs is not.
   *
   * Only something with filesystem access can do either, which is the residual
   * this store has accepted throughout (see the freeze notes). This is worth
   * having anyway because the consequence is not confined to the scratch
   * space: the download route and the provider read would otherwise serve a
   * file from outside it.
   */
  private async directoryUnchanged(
    directory: string,
    validated: Stats,
  ): Promise<boolean> {
    const now = await this.verifyRealDirectoryOrAbsent(directory).catch(
      () => null,
    );
    return (
      now !== null && now.dev === validated.dev && now.ino === validated.ino
    );
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
    const validated = await this.verifyRealDirectoryOrAbsent(directory);
    assert(
      validated !== null,
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
      // Local and fresh — counted by `writeCapped` as the bytes went past. It
      // only becomes a `lastKnownByteSize` once it leaves here as a record.
      const {byteSize} = written;

      // Through a handle, like `describe`. The temp path is a fresh UUID inside
      // the directory just verified, so there is little here to redirect — but
      // one sniffing helper means there is no second way to do this that
      // someone could later reach for.
      const mediaType = await this.sniffMediaType(temporaryPath);
      if (mediaType === null) return {ok: false, reason: 'unsupported-type'};
      if (byteSize > capFor(mediaType)) return {ok: false, reason: 'too-large'};

      const fileName = await this.placeUniquely(
        directory,
        temporaryPath,
        sanitized,
        mediaType,
        validated,
      );
      if (fileName === null) return {ok: false, reason: 'name-unavailable'};
      return {
        ok: true,
        attachment: {fileName, mediaType, lastKnownByteSize: byteSize},
      };
    } finally {
      await rm(temporaryPath, {force: true});
    }
  }

  /** Reads a file's head through an already-open handle and maps it to a
   *  deliverable media type, or `null` when it is not one. Takes the handle so
   *  the type is a fact about the same inode as its caller's other checks. */
  private async sniffMediaTypeOf(
    handle: FileHandle,
  ): Promise<ImageMediaType | DocumentMediaType | null> {
    const header = Buffer.alloc(SNIFF_HEADER_BYTES);
    const {bytesRead} = await handle.read(header, 0, header.length, 0);
    const detected = await fileTypeFromBuffer(header.subarray(0, bytesRead));
    return toSupportedMediaType(detected?.mime);
  }

  /** {@link sniffMediaTypeOf} for a path this store owns and has just written. */
  private async sniffMediaType(
    absolutePath: string,
  ): Promise<ImageMediaType | DocumentMediaType | null> {
    await using handle = await open(
      absolutePath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    return await this.sniffMediaTypeOf(handle);
  }

  /**
   * Opens an attachment and reads every fact about it from that one handle.
   * The handle is returned still open; callers that only want the facts close
   * it themselves.
   *
   * The single open is the point. Stats, media type and size taken from one
   * handle are facts about one inode by construction — no ordering to get
   * right, no identity to compare, and no window for a name to mean something
   * different between two of them.
   */
  private async open(
    scratchDirectory: string,
    fileName: string,
  ): Promise<OpenedAttachment | null> {
    const directory = this.directory(scratchDirectory);
    const validated = await this.verifyRealDirectoryOrAbsent(directory);
    if (validated === null) return null;

    const absolutePath = resolveInside(directory, fileName);
    if (absolutePath === null) return null;

    // The one method here that hands a handle out, so the one that has to say
    // so explicitly. Everything it opens is owned by `stack` — which closes it
    // on every failing path, including one added later — until `move()`
    // disowns it at the single point where the caller takes over.
    await using stack = new AsyncDisposableStack();

    let handle: FileHandle;
    try {
      handle = stack.use(
        await open(
          absolutePath,
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        ),
      );
    } catch (error: unknown) {
      // Gone, or a symlink `O_NOFOLLOW` refused. Both read as "nothing here";
      // anything else (EACCES, EIO, ...) is a real failure and must not be
      // laundered into a missing-attachment result.
      if (isFileNotFoundError(error) || isSymlinkRefusedError(error)) {
        return null;
      }
      throw error;
    }

    const stats = await handle.stat();
    // `O_NOFOLLOW` rules out a symlink; this rules out a directory or a
    // device node at the same name.
    if (!stats.isFile()) return null;

    const mediaType = await this.sniffMediaTypeOf(handle);
    if (mediaType === null) return null;

    // The parent was validated before the open above; confirm the open did not
    // walk through a different one. See `directoryUnchanged`.
    if (!(await this.directoryUnchanged(directory, validated))) return null;

    stack.move();
    return {
      handle,
      attachment: {fileName, mediaType, lastKnownByteSize: stats.size},
      mtimeMs: stats.mtimeMs,
    };
  }

  /** Describes an attachment without keeping it open, or `null`. */
  async describe(
    scratchDirectory: string,
    fileName: string,
  ): Promise<AttachmentDescriptor | null> {
    const opened = await this.open(scratchDirectory, fileName);
    if (opened === null) return null;
    await using _owned = opened.handle;
    return {attachment: opened.attachment, mtimeMs: opened.mtimeMs};
  }

  /**
   * Opens an attachment for streaming to a client. The caller owns the handle.
   *
   * Exists so the download route never sees a path: it used to take
   * `absolutePath` from a descriptor and open it itself, which meant a second
   * resolution of a name the first had already validated, and a symlink or a
   * swapped parent directory in between served a file from outside the store.
   */
  async openForDownload(
    scratchDirectory: string,
    fileName: string,
  ): Promise<OpenedAttachment | null> {
    return this.open(scratchDirectory, fileName);
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
   * `readFile` itself has no size limit, and nothing prevents the file on disk
   * from being larger than the `lastKnownByteSize` recorded for it — the
   * attachments directory must stay writable for uploads to land, so anything
   * running as this process's user can replace a file, and `unlink` plus
   * recreate never consults the frozen read-only bit.
   *
   * So the size is re-measured here, by `describe`'s fresh `lstat`, and checked
   * before a single byte is read — against `capFor(mediaType)` and against
   * `remainingBytes`, whichever binds first. Refusing beforehand rather than
   * measuring afterwards is what makes the budget a bound: reading first would
   * mean the memory was already spent by the time anyone noticed.
   *
   * A residual TOCTOU window remains (the stat is not the read); it is
   * microseconds wide, and the only writer is our own agent.
   */
  async readBase64(
    scratchDirectory: string,
    fileName: string,
    remainingBytes = Number.POSITIVE_INFINITY,
  ): Promise<AttachmentResolution> {
    const opened = await this.open(scratchDirectory, fileName);
    if (opened === null) return {data: null, reason: 'missing'};
    await using handle = opened.handle;

    {
      // From the handle, so both limits cover the bytes about to be read
      // rather than a size some earlier resolution of the name reported.
      const {size} = await handle.stat();
      if (
        size > Math.min(capFor(opened.attachment.mediaType), remainingBytes)
      ) {
        return {data: null, reason: 'too-large'};
      }

      const bytes = await handle.readFile();
      return {
        data: bytes.toString('base64'),
        // The read's own length, not the stat's: they are separate moments,
        // and the budget must be charged for what was actually loaded.
        materializedByteSize: bytes.byteLength,
      };
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
   * it, the recorded `lastKnownByteSize` is a permanent fact about the bytes on disk —
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
  private async freeze(
    scratchDirectory: string,
    fileNames: readonly string[],
  ): Promise<FreezeOutcome> {
    const directory = this.directory(scratchDirectory);
    const validated = await this.verifyRealDirectoryOrAbsent(directory);
    if (validated === null) {
      return {vanished: [...fileNames], newlyFrozen: [], described: []};
    }

    // `allSettled`, not `all`: `all` rejects early, leaving siblings to chmod
    // after the mutex is released with no `previousMode` left to undo them.
    const settled = await Promise.allSettled(
      fileNames.map((fileName) =>
        this.freezeOne(directory, fileName, validated),
      ),
    );

    const failure = settled.find((entry) => entry.status === 'rejected');
    if (failure !== undefined) {
      const rollback: FrozenEntry[] = [];
      settled.forEach((entry, index) => {
        if (entry.status !== 'fulfilled') return;
        const outcome = entry.value;
        if (outcome.kind !== 'frozen' || outcome.previousMode === null) return;
        rollback.push({
          fileName: fileNames[index] ?? '',
          previousMode: outcome.previousMode,
          dev: outcome.dev,
          ino: outcome.ino,
        });
      });
      await this.release(scratchDirectory, rollback);
      throw failure.reason instanceof Error
        ? failure.reason
        : new Error(String(failure.reason));
    }

    const results: FreezeOneOutcome[] = settled.map((entry) => {
      if (entry.status === 'fulfilled') return entry.value;
      return {kind: 'gone'};
    });
    const vanished: string[] = [];
    const newlyFrozen: FrozenEntry[] = [];
    const described: LlmAttachment[] = [];
    results.forEach((result, index) => {
      const fileName = fileNames[index] ?? '';
      switch (result.kind) {
        case 'gone':
          vanished.push(fileName);
          return;
        case 'frozen':
          if (result.previousMode !== null) {
            newlyFrozen.push({
              fileName,
              previousMode: result.previousMode,
              dev: result.dev,
              ino: result.ino,
            });
          }
          if (result.described === null) vanished.push(fileName);
          else described.push(result.described.attachment);
          return;
      }
    });
    return {vanished, newlyFrozen, described};
  }

  /**
   * Freezes one file. Distinguishes a file this call transitioned from one
   * that was already frozen — only the former may be released again, since an
   * earlier message may be relying on the latter.
   */
  private async freezeOne(
    directory: string,
    fileName: string,
    validatedDirectory: Stats,
  ): Promise<FreezeOneOutcome> {
    const absolutePath = resolveInside(directory, fileName);
    if (absolutePath === null) return {kind: 'gone'};

    // Freezes through an open handle, never by path. An earlier version
    // lstat'd and then called `chmod(absolutePath, ...)`, reasoning that the
    // lstat would catch a symlink — but those are two resolutions of the same
    // name with an await between them, so a link planted in the gap was
    // followed and the mode of a file outside this store was changed. Checking
    // then acting on a path is not atomic no matter what the check looks at.
    //
    // `O_NOFOLLOW` lets the kernel refuse the link instead; `O_NONBLOCK` keeps
    // a planted FIFO from blocking here; and `fchmod` through the handle acts
    // on the inode the checks below already saw, which no rename or unlink can
    // swap. `O_RDONLY` is enough — `fchmod` needs ownership, not write access.
    let handle: FileHandle;
    try {
      handle = await open(
        absolutePath,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
    } catch (error: unknown) {
      // Gone, or not something this store may freeze. Both are "nothing here
      // to pin" to the caller, which folds them into its missing list.
      if (isFileNotFoundError(error) || isSymlinkRefusedError(error)) {
        return {kind: 'gone'};
      }
      throw error;
    }
    await using owned = handle;

    // `O_NOFOLLOW` rules out a symlink but not a directory or a device node.
    const stats = await owned.stat();
    if (!stats.isFile()) return {kind: 'gone'};

    // The parent was validated before this open; confirm the open did not walk
    // through a different one before changing any mode. See
    // `directoryUnchanged`.
    if (!(await this.directoryUnchanged(directory, validatedDirectory))) {
      return {kind: 'gone'};
    }

    const previousMode = stats.mode & 0o777;
    const newlyFrozen = (previousMode & OWNER_WRITE_MODE) !== 0;
    await owned.chmod(FROZEN_MODE);

    // Described here, from the handle just frozen, rather than by a second
    // `describe` pass over the name afterwards. Those were two resolutions:
    // a swap between them let a claim commit a descriptor for one inode while
    // a different one carried the frozen bit — so the API could still delete
    // the file a successful claim had supposedly pinned.
    try {
      const mediaType = await this.sniffMediaTypeOf(owned);
      return {
        kind: 'frozen',
        previousMode: newlyFrozen ? previousMode : null,
        dev: stats.dev,
        ino: stats.ino,
        described:
          mediaType === null
            ? null
            : {
                attachment: {
                  fileName,
                  mediaType,
                  lastKnownByteSize: stats.size,
                },
                mtimeMs: stats.mtimeMs,
              },
      };
    } catch (error: unknown) {
      // This promise cannot return a FrozenEntry for the outer allSettled
      // rollback once it rejects. Undo through the still-open handle so a
      // failed sniff neither strands this inode nor touches a replacement at
      // the same name. A file that was already frozen belongs to an earlier
      // accepted turn and must remain frozen.
      if (newlyFrozen) {
        await owned.chmod(previousMode).catch(() => undefined);
      }
      throw error;
    }
  }

  /**
   * Pins the named attachments for delivery and describes them, or explains
   * why it could not.
   *
   * Runs under {@link entryMutex}, and that is load-bearing rather than tidiness.
   * The sequence freezes, then reads sizes, then checks the aggregate cap, and
   * un-freezes what it froze if the cap rejects — so two concurrent claims
   * naming the same file could otherwise interleave such that one releases a
   * file the other had already accepted and enqueued. Serializing makes each
   * claim see the file either untouched or fully committed by the other.
   *
   * **Freeze first, then describe.** Both resolve by file name and are
   * separate awaits, so anything between them can swap the file a name points
   * at — a `DELETE` plus a same-name re-upload suffices, since `placeUniquely`
   * always starts at the bare name. Describing first records a size for one
   * file and then pins whatever occupies the name a moment later. The
   * invariant needed is *the descriptor describes the frozen bytes*, not *the
   * descriptor describes the file that was there when the request arrived* —
   * which file wins a race does not matter. Once frozen, `remove` refuses the
   * name, so it cannot be released and rebound.
   *
   * **The cap runs last**, because it needs sizes and the sizes must come from
   * the pinned file. A claim it rejects therefore releases what it froze: the
   * turn never reaches the model, so leaving the user with files they can no
   * longer delete would strand disk they cannot reclaim. Only the files *this*
   * call transitioned are released — one already frozen belongs to an earlier
   * message.
   */
  async claim(
    scratchDirectory: string,
    fileNames: readonly string[],
  ): Promise<ClaimAttachmentsResult> {
    const release = await this.entryMutex.acquire();
    try {
      return await this.claimUnlocked(scratchDirectory, fileNames);
    } finally {
      release();
    }
  }

  private async claimUnlocked(
    scratchDirectory: string,
    fileNames: readonly string[],
  ): Promise<ClaimAttachmentsResult> {
    const {vanished, newlyFrozen, described} = await this.freeze(
      scratchDirectory,
      fileNames,
    );
    if (vanished.length > 0) {
      await this.release(scratchDirectory, newlyFrozen);
      return {ok: false, reason: 'unknown-attachments', missing: vanished};
    }

    const totalBytes = totalAttachmentBytes(described);
    if (totalBytes > MAX_MESSAGE_ATTACHMENT_BYTES) {
      await this.release(scratchDirectory, newlyFrozen);
      return {
        ok: false,
        reason: 'attachments-too-large',
        totalBytes,
        limit: MAX_MESSAGE_ATTACHMENT_BYTES,
      };
    }

    return {ok: true, attachments: described};
  }

  /**
   * Restores each file's pre-freeze mode, undoing a freeze this claim made.
   *
   * The mode it observed, not a constant. `freezeOne` accepts any regular
   * file — deliverability is `describe`'s question, and it runs afterwards —
   * so a claim can freeze something the store did not create and then reject
   * it. Writing back a fixed `0600` silently rewrote an agent-created `0644`
   * file that only happened to be sitting in the directory.
   *
   * Only ever called with names {@link freezeOne} reported as `newly-frozen`,
   * and only from inside {@link claim}'s lock, so it can never un-freeze an
   * attachment an earlier message is relying on. Opens under the same flags as
   * the freeze for the same reason — a name is not a safe thing to chmod.
   *
   * Best effort: a file that vanished between the freeze and here needs no
   * undoing, and a claim already failing should report why it failed rather
   * than an error from its own cleanup.
   */
  private async release(
    scratchDirectory: string,
    frozen: readonly FrozenEntry[],
  ): Promise<void> {
    const directory = this.directory(scratchDirectory);
    // Every other path checks this and cleanup skipped it: `O_NOFOLLOW` guards
    // the final component, so with `attachments` itself replaced by a symlink
    // this walked outside the store and un-froze a same-named stranger. There
    // is nothing to undo in a directory that is not ours.
    //
    // Caught rather than propagated, unlike everywhere else that calls this.
    // A tampered scratch space is a thrown error on a path that was about to
    // succeed; here the claim has already failed and is on its way to
    // reporting why, and replacing that reason with an error from its own
    // cleanup would hide it. The tampering still surfaces on the next
    // `describe` or `save`, which are not in the middle of failing.
    let validated: Stats;
    try {
      const stats = await this.verifyRealDirectoryOrAbsent(directory);
      if (stats === null) return;
      validated = stats;
    } catch {
      return;
    }
    await Promise.all(
      frozen.map(async ({fileName, previousMode, dev, ino}) => {
        const absolutePath = resolveInside(directory, fileName);
        if (absolutePath === null) return;
        let handle: FileHandle;
        try {
          handle = await open(
            absolutePath,
            constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
          );
        } catch (error: unknown) {
          if (isFileNotFoundError(error) || isSymlinkRefusedError(error)) {
            return;
          }
          throw error;
        }
        await using owned = handle;
        // Same gate as `freezeOne`: `O_NOFOLLOW` rules out a symlink, but on
        // Linux a directory opens fine, and `chmod`ing one to `0600` would
        // strip its traversal bit. An entry replaced between the freeze and
        // this release is not ours to touch.
        const stats = await owned.stat();
        if (!stats.isFile()) return;
        if (stats.dev !== dev || stats.ino !== ino) return;
        // And the parent, for the same reason the read path checks it: the
        // open above resolved the whole path, not just the final component.
        if (!(await this.directoryUnchanged(directory, validated))) return;
        await owned.chmod(previousMode);
      }),
    );
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
    const release = await this.entryMutex.acquire();
    try {
      return await this.removeUnlocked(scratchDirectory, fileName);
    } finally {
      release();
    }
  }

  private async removeUnlocked(
    scratchDirectory: string,
    fileName: string,
  ): Promise<RemoveAttachmentResult> {
    const directory = this.directory(scratchDirectory);
    const validated = await this.verifyRealDirectoryOrAbsent(directory);
    if (validated === null) return {ok: false, reason: 'not-found'};

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

    // `unlink` takes a path and has no fd form — the name is the thing being
    // removed — so this is one of the few operations that cannot be moved onto
    // a handle. Re-checking the parent immediately before it is the closest
    // available substitute; see `directoryUnchanged` for what that does and
    // does not buy.
    if (!(await this.directoryUnchanged(directory, validated))) {
      return {ok: false, reason: 'not-found'};
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
    validatedDirectory: Stats,
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

      // `link` takes paths and has no fd form, like `unlink` — the name is
      // what is being created. Re-checking the parent immediately before it is
      // the closest available substitute; see `directoryUnchanged`.
      if (!(await this.directoryUnchanged(directory, validatedDirectory))) {
        return null;
      }

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
