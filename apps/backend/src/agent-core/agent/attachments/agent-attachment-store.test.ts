import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';

import {fileTypeFromFile} from 'file-type';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {agentAttachmentStore} from './agent-attachment-store.js';
import {
  MAX_DOCUMENT_ATTACHMENT_BYTES,
  MAX_IMAGE_ATTACHMENT_BYTES,
} from './helpers/cap-for.js';
import {resolveInside} from './helpers/resolve-inside.js';

// Both mocks default to the real implementation — only the specific tests
// below that exercise the stat/sniff/read race override a single call.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {...actual, readFile: vi.fn(actual.readFile)};
});
vi.mock('file-type', async (importOriginal) => {
  const actual = await importOriginal<typeof import('file-type')>();
  return {...actual, fileTypeFromFile: vi.fn(actual.fileTypeFromFile)};
});

// Real magic bytes — the store sniffs content, never the declared type.
const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52,
]);
const PDF_HEADER = Buffer.from('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n', 'binary');

function pngOf(totalBytes: number): Buffer {
  return Buffer.concat([
    PNG_HEADER,
    Buffer.alloc(Math.max(0, totalBytes - PNG_HEADER.length)),
  ]);
}

function streamOf(buffer: Buffer): Readable {
  return Readable.from([buffer]);
}

// A literal NUL is written via fromCharCode so this file stays copy/paste-safe.
const NUL = String.fromCharCode(0);

let scratchDirectory: string;

beforeEach(async () => {
  scratchDirectory = await mkdtemp(path.join(os.tmpdir(), 'attachment-store-'));
});

afterEach(async () => {
  await rm(scratchDirectory, {recursive: true, force: true});
  vi.restoreAllMocks();
});

describe('save', () => {
  it('stores a PNG and reports the sniffed type and size', async () => {
    const bytes = pngOf(2048);
    const result = await agentAttachmentStore.save(
      scratchDirectory,
      'shot.png',
      streamOf(bytes),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachment).toEqual({
      fileName: 'shot.png',
      mediaType: 'image/png',
      byteSize: 2048,
    });

    const stored = await readFile(
      path.join(scratchDirectory, 'attachments', 'shot.png'),
    );
    expect(stored.equals(bytes)).toBe(true);
  });

  it('ignores the declared extension and uses the sniffed type', async () => {
    const result = await agentAttachmentStore.save(
      scratchDirectory,
      'invoice.png',
      streamOf(Buffer.concat([PDF_HEADER, Buffer.alloc(64)])),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachment.mediaType).toBe('application/pdf');
    expect(result.attachment.fileName).toBe('invoice.pdf');
  });

  it('uniquifies a colliding name instead of overwriting', async () => {
    const first = await agentAttachmentStore.save(
      scratchDirectory,
      'shot.png',
      streamOf(pngOf(64)),
    );
    const second = await agentAttachmentStore.save(
      scratchDirectory,
      'shot.png',
      streamOf(pngOf(128)),
    );

    expect(first.ok && first.attachment.fileName).toBe('shot.png');
    expect(second.ok && second.attachment.fileName).toBe('shot (2).png');
    expect(second.ok && second.attachment.byteSize).toBe(128);
  });

  // Regression test for a name `placeUniquely` could produce that the read
  // paths then reject. `sanitizeFileName` leaves U+2028 (LINE SEPARATOR)
  // alone, and it breaks the `.`-matches-anything assumption the
  // `sanitize-filename` package's Windows-reserved-name regex relies on, so
  // 'con.<U+2028>png' survives the up-front sanitize as a fixed point. Once
  // `placeUniquely` strips the (line-separator-containing) extension and
  // swaps in the sniffed `.png`, the bare stem is exactly `con` — a
  // Windows-reserved name — so the first candidate, `con.png`, is a name
  // `sanitizeFileName` itself would reject. Before the fix this got linked
  // to disk anyway: `describe`/`readBase64` reported it missing and `remove`
  // reported not-found for a file that was, in fact, sitting there forever.
  it('skips a first candidate that would rebuild a Windows-reserved name after the extension swap', async () => {
    const desiredName = `con.${String.fromCharCode(0x2028)}png`;
    const result = await agentAttachmentStore.save(
      scratchDirectory,
      desiredName,
      streamOf(pngOf(64)),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Not the unreachable `con.png` — the next candidate the uniquify loop
    // tries, which is not a reserved name once suffixed.
    expect(result.attachment.fileName).toBe('con (2).png');

    // The file must be reachable through every read path, exactly like any
    // other successfully saved attachment.
    const found = await agentAttachmentStore.describe(
      scratchDirectory,
      result.attachment.fileName,
    );
    expect(found).not.toBeNull();
    expect(
      await agentAttachmentStore.readBase64(
        scratchDirectory,
        result.attachment.fileName,
      ),
    ).toEqual({data: pngOf(64).toString('base64')});
    expect(
      await agentAttachmentStore.remove(
        scratchDirectory,
        result.attachment.fileName,
      ),
    ).toBe(true);
  });

  it('rejects a name that sanitizes to nothing', async () => {
    const result = await agentAttachmentStore.save(
      scratchDirectory,
      '..',
      streamOf(pngOf(64)),
    );
    expect(result).toEqual({ok: false, reason: 'invalid-name'});
  });

  it('rejects a media type outside the deliverable set', async () => {
    const result = await agentAttachmentStore.save(
      scratchDirectory,
      'notes.txt',
      streamOf(Buffer.from('just some text, no magic bytes')),
    );
    expect(result).toEqual({ok: false, reason: 'unsupported-type'});
  });

  it('rejects an image over the image cap and leaves no temp file behind', async () => {
    const result = await agentAttachmentStore.save(
      scratchDirectory,
      'huge.png',
      streamOf(pngOf(MAX_IMAGE_ATTACHMENT_BYTES + 1)),
    );
    expect(result).toEqual({ok: false, reason: 'too-large'});

    const entries = await readdir(path.join(scratchDirectory, 'attachments'));
    expect(entries).toEqual([]);
  });

  it('accepts a PDF between the image cap and the document cap', async () => {
    const size = MAX_IMAGE_ATTACHMENT_BYTES + 1024;
    const result = await agentAttachmentStore.save(
      scratchDirectory,
      'big.pdf',
      streamOf(
        Buffer.concat([PDF_HEADER, Buffer.alloc(size - PDF_HEADER.length)]),
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachment.byteSize).toBe(size);
  });

  it('aborts a stream past the largest cap without buffering it', async () => {
    const stream = streamOf(
      Buffer.concat([
        PDF_HEADER,
        Buffer.alloc(MAX_DOCUMENT_ATTACHMENT_BYTES + 1),
      ]),
    );
    const result = await agentAttachmentStore.save(
      scratchDirectory,
      'huge.pdf',
      stream,
    );
    expect(result).toEqual({ok: false, reason: 'too-large'});
    expect(stream.destroyed).toBe(true);
  });

  it('stores an over-long, mostly multi-byte name without throwing ENAMETOOLONG', async () => {
    const desiredName = `${'あ'.repeat(90)}.png`;
    const result = await agentAttachmentStore.save(
      scratchDirectory,
      desiredName,
      streamOf(pngOf(64)),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Buffer.byteLength(result.attachment.fileName)).toBeLessThanOrEqual(
      255,
    );

    const stored = await readFile(
      path.join(scratchDirectory, 'attachments', result.attachment.fileName),
    );
    expect(stored.length).toBe(64);
  });

  // Regression test for the lstat-probe-then-rename race: two concurrent
  // callers is not enough to reliably lose a writer under Vitest's runtime,
  // so this uses a wider fan-out to make the collision window hit every run.
  it('gives concurrent saves of the same desired name distinct files, each with its own bytes', async () => {
    const CONCURRENT_SAVES = 10;
    const payloads = Array.from({length: CONCURRENT_SAVES}, (_, index) =>
      pngOf(64 + index),
    );

    const results = await Promise.all(
      payloads.map((bytes) =>
        agentAttachmentStore.save(
          scratchDirectory,
          'shot.png',
          streamOf(bytes),
        ),
      ),
    );

    for (const result of results) {
      expect(result.ok).toBe(true);
    }
    const fileNames = results.map((result) =>
      result.ok ? result.attachment.fileName : null,
    );
    expect(new Set(fileNames).size).toBe(CONCURRENT_SAVES);

    for (const [index, result] of results.entries()) {
      if (!result.ok) continue;
      const stored = await readFile(
        path.join(scratchDirectory, 'attachments', result.attachment.fileName),
      );
      expect(stored.equals(payloads[index])).toBe(true);
    }
  });
});

describe('describe / readBase64 / remove', () => {
  it('describes a stored attachment', async () => {
    await agentAttachmentStore.save(
      scratchDirectory,
      'shot.png',
      streamOf(pngOf(256)),
    );

    const found = await agentAttachmentStore.describe(
      scratchDirectory,
      'shot.png',
    );
    expect(found?.attachment).toEqual({
      fileName: 'shot.png',
      mediaType: 'image/png',
      byteSize: 256,
    });
    expect(found?.absolutePath).toBe(
      path.join(scratchDirectory, 'attachments', 'shot.png'),
    );
  });

  it('reports the stored file mtime, matching a direct lstat', async () => {
    await agentAttachmentStore.save(
      scratchDirectory,
      'shot.png',
      streamOf(pngOf(64)),
    );

    const found = await agentAttachmentStore.describe(
      scratchDirectory,
      'shot.png',
    );
    const stats = await lstat(
      path.join(scratchDirectory, 'attachments', 'shot.png'),
    );

    expect(found?.mtimeMs).toBe(stats.mtimeMs);
    // Sanity-checks that the value is a real, recent timestamp rather than a
    // constant or a stat of the wrong file.
    expect(found?.mtimeMs).toBeGreaterThan(Date.now() - 60_000);
    expect(found?.mtimeMs).toBeLessThanOrEqual(Date.now());
  });

  it('returns null / missing for a missing file', async () => {
    expect(
      await agentAttachmentStore.describe(scratchDirectory, 'nope.png'),
    ).toBeNull();
    expect(
      await agentAttachmentStore.readBase64(scratchDirectory, 'nope.png'),
    ).toEqual({data: null, reason: 'missing'});
  });

  it('reads bytes back as base64', async () => {
    const bytes = pngOf(64);
    await agentAttachmentStore.save(
      scratchDirectory,
      'shot.png',
      streamOf(bytes),
    );

    expect(
      await agentAttachmentStore.readBase64(scratchDirectory, 'shot.png'),
    ).toEqual({data: bytes.toString('base64')});
  });

  // Regression tests for the bug this section of the review follow-up spec
  // fixes: `readBase64` used to read the file with no size check at all,
  // trusting the `byteSize` `describe` had recorded earlier — but
  // `run_command`'s realpath allowlist deliberately covers the scratch space
  // (it's how an oversized image gets downsampled), so a writer other than
  // `save()` can replace the file with a larger one between the two.
  describe('byte cap enforced only in readBase64', () => {
    it('yields the too-large reason, not the bytes, when the file grew past its cap after being described', async () => {
      const saved = await agentAttachmentStore.save(
        scratchDirectory,
        'shot.png',
        streamOf(pngOf(64)),
      );
      expect(saved.ok).toBe(true);
      const absolutePath = path.join(
        scratchDirectory,
        'attachments',
        'shot.png',
      );

      // Simulates the agent's own `run_command` overwriting the file with
      // something larger — the write this cap exists to react to.
      await writeFile(absolutePath, pngOf(MAX_IMAGE_ATTACHMENT_BYTES + 1));

      expect(
        await agentAttachmentStore.readBase64(scratchDirectory, 'shot.png'),
      ).toEqual({data: null, reason: 'too-large'});
    });

    it('keeps describing and exposing the absolute path of an over-cap file, proving the cap did not leak into describe (and so the file stays downloadable and deletable)', async () => {
      const saved = await agentAttachmentStore.save(
        scratchDirectory,
        'shot.png',
        streamOf(pngOf(64)),
      );
      expect(saved.ok).toBe(true);
      const absolutePath = path.join(
        scratchDirectory,
        'attachments',
        'shot.png',
      );
      const grownSize = MAX_IMAGE_ATTACHMENT_BYTES + 1;
      await writeFile(absolutePath, pngOf(grownSize));

      const found = await agentAttachmentStore.describe(
        scratchDirectory,
        'shot.png',
      );
      expect(found).not.toBeNull();
      expect(found?.attachment).toEqual({
        fileName: 'shot.png',
        mediaType: 'image/png',
        byteSize: grownSize,
      });
      expect(found?.absolutePath).toBe(absolutePath);

      // remove() must also still work — an over-cap file the agent grew is
      // still the user's data, and must stay deletable from the UI.
      expect(
        await agentAttachmentStore.remove(scratchDirectory, 'shot.png'),
      ).toBe(true);
    });

    it('still delivers a file sized exactly at its type cap', async () => {
      const bytes = pngOf(MAX_IMAGE_ATTACHMENT_BYTES);
      const saved = await agentAttachmentStore.save(
        scratchDirectory,
        'shot.png',
        streamOf(bytes),
      );
      expect(saved.ok).toBe(true);

      expect(
        await agentAttachmentStore.readBase64(scratchDirectory, 'shot.png'),
      ).toEqual({data: bytes.toString('base64')});
    });
  });

  // Regression tests for a concurrent DELETE racing the read paths. `describe`
  // stats the file, then sniffs its type; `readBase64` calls `describe`, then
  // separately reads the bytes. A `remove()` landing inside either gap must
  // still degrade to `null` (the adapter's "[attachment missing: ...]"
  // placeholder) rather than reject and abort the whole LLM turn.
  describe('concurrent delete racing a read', () => {
    it('describe returns null, not a rejection, when the file is unlinked between the stat and the type sniff', async () => {
      await agentAttachmentStore.save(
        scratchDirectory,
        'shot.png',
        streamOf(pngOf(64)),
      );
      const absolutePath = path.join(
        scratchDirectory,
        'attachments',
        'shot.png',
      );

      // `fileTypeFromFile` opens the file to read its header — unlinking it
      // first, then letting the real sniff run, reproduces exactly the
      // ENOENT a concurrent `remove()` would cause in that window.
      const actualFileType =
        await vi.importActual<typeof import('file-type')>('file-type');
      vi.mocked(fileTypeFromFile).mockImplementationOnce(
        async (filePath, options) => {
          await unlink(absolutePath);
          return actualFileType.fileTypeFromFile(filePath, options);
        },
      );

      await expect(
        agentAttachmentStore.describe(scratchDirectory, 'shot.png'),
      ).resolves.toBeNull();
    });

    it('readBase64 yields the missing reason, not a rejection, when the file is unlinked between describe and the read', async () => {
      await agentAttachmentStore.save(
        scratchDirectory,
        'shot.png',
        streamOf(pngOf(64)),
      );
      const absolutePath = path.join(
        scratchDirectory,
        'attachments',
        'shot.png',
      );

      // Calls through to the real `describe` (the file still exists, so it
      // resolves normally), then unlinks the file before `readBase64` gets a
      // chance to read it — putting a real deletion inside the exact window
      // between `describe` and `readFile`.
      const originalDescribe =
        agentAttachmentStore.describe.bind(agentAttachmentStore);
      vi.spyOn(agentAttachmentStore, 'describe').mockImplementationOnce(
        async (scratchDir, fileName) => {
          const found = await originalDescribe(scratchDir, fileName);
          await unlink(absolutePath);
          return found;
        },
      );

      // Reason must be `missing`, not `too-large`: the two must never be
      // confused with one another.
      await expect(
        agentAttachmentStore.readBase64(scratchDirectory, 'shot.png'),
      ).resolves.toEqual({data: null, reason: 'missing'});
    });

    it('describe rejects instead of returning null when the type sniff fails for a reason other than ENOENT', async () => {
      await agentAttachmentStore.save(
        scratchDirectory,
        'shot.png',
        streamOf(pngOf(64)),
      );

      const accessError = Object.assign(
        new Error('EACCES: permission denied'),
        {code: 'EACCES'},
      );
      vi.mocked(fileTypeFromFile).mockRejectedValueOnce(accessError);

      await expect(
        agentAttachmentStore.describe(scratchDirectory, 'shot.png'),
      ).rejects.toBe(accessError);
    });

    it('readBase64 rejects instead of returning null when the read fails for a reason other than ENOENT', async () => {
      await agentAttachmentStore.save(
        scratchDirectory,
        'shot.png',
        streamOf(pngOf(64)),
      );

      const accessError = Object.assign(
        new Error('EACCES: permission denied'),
        {code: 'EACCES'},
      );
      vi.mocked(readFile).mockRejectedValueOnce(accessError);

      await expect(
        agentAttachmentStore.readBase64(scratchDirectory, 'shot.png'),
      ).rejects.toBe(accessError);
    });
  });

  it('removes a stored attachment and reports whether it existed', async () => {
    await agentAttachmentStore.save(
      scratchDirectory,
      'shot.png',
      streamOf(pngOf(64)),
    );

    expect(
      await agentAttachmentStore.remove(scratchDirectory, 'shot.png'),
    ).toBe(true);
    expect(
      await agentAttachmentStore.remove(scratchDirectory, 'shot.png'),
    ).toBe(false);
  });

  it('removes a file that no longer sniffs as a supported media type', async () => {
    const attachmentsDirectory =
      agentAttachmentStore.directory(scratchDirectory);
    await mkdir(attachmentsDirectory, {recursive: true});
    const truncatedPath = path.join(attachmentsDirectory, 'truncated.png');
    await writeFile(truncatedPath, Buffer.from('not actually a png'));

    // describe refuses it — it no longer sniffs as anything deliverable —
    // but remove must still be able to delete it.
    expect(
      await agentAttachmentStore.describe(scratchDirectory, 'truncated.png'),
    ).toBeNull();
    expect(
      await agentAttachmentStore.remove(scratchDirectory, 'truncated.png'),
    ).toBe(true);
    await expect(access(truncatedPath)).rejects.toThrow();
  });

  it('removes a symlink planted in the store rather than leaving it stuck', async () => {
    const attachmentsDirectory =
      agentAttachmentStore.directory(scratchDirectory);
    await agentAttachmentStore.save(
      scratchDirectory,
      'real.png',
      streamOf(pngOf(64)),
    );
    const outside = path.join(scratchDirectory, 'outside.png');
    await writeFile(outside, pngOf(64));
    const linkPath = path.join(attachmentsDirectory, 'link.png');
    await symlink(outside, linkPath);

    // `describe` refuses a symlink, so a stat-gated `remove` could never
    // delete one. Unlinking removes the link itself — never the target.
    expect(
      await agentAttachmentStore.describe(scratchDirectory, 'link.png'),
    ).toBeNull();
    expect(
      await agentAttachmentStore.remove(scratchDirectory, 'link.png'),
    ).toBe(true);
    await expect(access(linkPath)).rejects.toThrow();
    // The target survived.
    await expect(access(outside)).resolves.toBeUndefined();
  });

  // Regression test for 297be09, which changed remove() from stat-then-unlink
  // to unlink-and-catch-ENOENT: `unlink` on a directory throws (EPERM on
  // macOS/BSD, EISDIR on Linux) and that error is neither ENOENT nor caught,
  // so it used to propagate uncaught. A tool can plant a directory at the
  // path an attachment name would occupy (e.g. `mkdir
  // scratch/attachments/shot.png`); every DELETE for that name must degrade
  // to "not found" — never a 500 that leaves the entry permanently
  // undeletable through the API.
  it('reports a directory planted at an attachment name as not-found instead of throwing', async () => {
    const attachmentsDirectory =
      agentAttachmentStore.directory(scratchDirectory);
    const plantedDirectory = path.join(attachmentsDirectory, 'shot.png');
    await mkdir(plantedDirectory, {recursive: true});

    await expect(
      agentAttachmentStore.remove(scratchDirectory, 'shot.png'),
    ).resolves.toBe(false);
    // The directory itself must survive — remove() must refuse it outright,
    // never attempt an unlink that could behave unexpectedly on it.
    await expect(access(plantedDirectory)).resolves.toBeUndefined();
  });
});

describe('path safety', () => {
  // The full rejection matrix (traversal, backslash paths, dot names, control
  // characters, ...) is a pure function of `resolveInside` now and is tested
  // directly in helpers/resolve-inside.test.ts. This just confirms the
  // store's read methods correctly wire a rejection into `null`/`false`
  // instead of throwing.
  it('rejects a read for a name outside the store, delegating to resolveInside', async () => {
    const fileName = '../snapshot.json';
    expect(
      await agentAttachmentStore.describe(scratchDirectory, fileName),
    ).toBeNull();
    expect(
      await agentAttachmentStore.readBase64(scratchDirectory, fileName),
    ).toEqual({data: null, reason: 'missing'});
    expect(await agentAttachmentStore.remove(scratchDirectory, fileName)).toBe(
      false,
    );
  });

  // The one intended behavior change (design doc, section 3): a read-path
  // name is now compared byte-for-byte against its own sanitized form, so
  // trailing whitespace — silently accepted by the pre-refactor checks — is
  // now rejected. The file is saved as 'shot.png' (no trailing space), so the
  // only difference from a normal lookup is the trailing space on the read.
  it('rejects a read with trailing whitespace even though the underlying file exists', async () => {
    await agentAttachmentStore.save(
      scratchDirectory,
      'shot.png',
      streamOf(pngOf(64)),
    );

    expect(
      await agentAttachmentStore.describe(scratchDirectory, 'shot.png '),
    ).toBeNull();
    expect(
      await agentAttachmentStore.readBase64(scratchDirectory, 'shot.png '),
    ).toEqual({data: null, reason: 'missing'});
    expect(
      await agentAttachmentStore.remove(scratchDirectory, 'shot.png '),
    ).toBe(false);
  });

  it('rejects a symlink planted inside the attachments directory', async () => {
    const secret = path.join(scratchDirectory, 'secret.png');
    await writeFile(secret, pngOf(64));
    // Create the attachments dir via a legitimate save first.
    await agentAttachmentStore.save(
      scratchDirectory,
      'real.png',
      streamOf(pngOf(64)),
    );
    await symlink(
      secret,
      path.join(scratchDirectory, 'attachments', 'link.png'),
    );

    expect(
      await agentAttachmentStore.describe(scratchDirectory, 'link.png'),
    ).toBeNull();
    expect(
      await agentAttachmentStore.readBase64(scratchDirectory, 'link.png'),
    ).toEqual({data: null, reason: 'missing'});
  });

  // Required invariant: every name save() actually produces must be accepted
  // by resolveInside — otherwise a saved attachment could become permanently
  // unreadable. Verified by round-tripping real saved names (including
  // hostile desired names that get transformed along the way), not by
  // asserting the property for hand-picked "nice" cases only.
  it('accepts, via resolveInside, every name save() actually produces for a spread of hostile desired names', async () => {
    const hostileDesiredNames = [
      'shot.png',
      `../../etc/pa${NUL}ss.png`,
      'sub/shot.png',
      'sub\\shot.png',
      '  leading.png',
      'trailing.png ',
      'shot.png...',
      'CON.png',
      `${'あ'.repeat(90)}.png`,
    ];

    const attachmentsDirectory =
      agentAttachmentStore.directory(scratchDirectory);
    const savedFileNames: string[] = [];
    for (const desiredName of hostileDesiredNames) {
      const result = await agentAttachmentStore.save(
        scratchDirectory,
        desiredName,
        streamOf(pngOf(64)),
      );
      // Not every hostile name survives sanitizing (e.g. a Windows-reserved
      // name) — save() correctly refuses those outright, so there is nothing
      // to round-trip for that entry.
      if (!result.ok) continue;
      savedFileNames.push(result.attachment.fileName);
    }

    expect(savedFileNames.length).toBeGreaterThan(0);
    for (const fileName of savedFileNames) {
      expect(resolveInside(attachmentsDirectory, fileName)).not.toBeNull();
    }
  });
});

// Regression coverage for the gap `save()`'s `mkdir` comment used to document
// as known and unaddressed: `mkdir(recursive)` is a no-op when `attachments`
// already exists — including as a symlink to a directory — so a symlink
// planted at that segment itself (as opposed to a leaf file name, which the
// read paths' `lstat` already rejects) survived undetected, and every
// subsequent open-by-path under it followed the symlink outside the scratch
// space.
describe('attachments directory itself planted as a symlink', () => {
  it('save() rejects instead of writing through a symlinked attachments directory', async () => {
    const outside = await mkdtemp(
      path.join(os.tmpdir(), 'attachment-outside-'),
    );
    const attachmentsDirectory =
      agentAttachmentStore.directory(scratchDirectory);
    await symlink(outside, attachmentsDirectory);

    await expect(
      agentAttachmentStore.save(
        scratchDirectory,
        'shot.png',
        streamOf(pngOf(64)),
      ),
    ).rejects.toThrow();

    // Nothing must have been written through the symlink into `outside`.
    expect(await readdir(outside)).toEqual([]);
    await rm(outside, {recursive: true, force: true});
  });

  it('describe(), readBase64(), and remove() reject instead of following a symlinked attachments directory', async () => {
    const outside = await mkdtemp(
      path.join(os.tmpdir(), 'attachment-outside-'),
    );
    const secret = path.join(outside, 'shot.png');
    await writeFile(secret, pngOf(64));
    const attachmentsDirectory =
      agentAttachmentStore.directory(scratchDirectory);
    await symlink(outside, attachmentsDirectory);

    await expect(
      agentAttachmentStore.describe(scratchDirectory, 'shot.png'),
    ).rejects.toThrow();
    await expect(
      agentAttachmentStore.readBase64(scratchDirectory, 'shot.png'),
    ).rejects.toThrow();
    await expect(
      agentAttachmentStore.remove(scratchDirectory, 'shot.png'),
    ).rejects.toThrow();

    // The file outside the scratch space must survive every attempt.
    await expect(access(secret)).resolves.toBeUndefined();
    await rm(outside, {recursive: true, force: true});
  });
});
