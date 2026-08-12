import {execFile} from 'node:child_process';
// `node:fs/promises` is mocked below; this specifier is not, so it is how the
// real `lstat` is reached from inside a mock implementation.
import {promises as realFs} from 'node:fs';
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {promisify} from 'node:util';

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
  return {
    ...actual,
    readFile: vi.fn(actual.readFile),
    lstat: vi.fn(actual.lstat),
    open: vi.fn(actual.open),
  };
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

/**
 * Runs `swap` once, immediately after the next `describe` returns.
 *
 * `describe` opens the file once and reads its stats, identity and media type
 * from that one handle, so there is no longer a gap *inside* it to inject
 * into — which is the point of it working that way. The gap that remains is
 * between a descriptor being produced and the next operation resolving the
 * same name again, and that is what these tests exercise.
 */
/**
 * Runs `swap` once, after the `afterResolvedCall`-th `open` resolves.
 *
 * Hooks `open` rather than `describe` because a claim no longer describes: it
 * freezes each file and takes the descriptor from that same handle, so the only
 * remaining boundary within a claim is between the freeze's opens and the
 * release's. Counting resolved opens puts the swap exactly there — a claim over
 * two files opens twice to freeze, so `2` lands after both.
 */
function swapAfterOpen(swap: () => Promise<void>, afterResolvedCall = 1): void {
  const real = vi.mocked(open).getMockImplementation();
  expect(real).toBeDefined();
  let resolved = 0;
  let done = false;
  vi.mocked(open).mockImplementation(async (...args) => {
    const handle = await (real as typeof open)(...args);
    resolved++;
    if (!done && resolved >= afterResolvedCall) {
      done = true;
      await swap();
    }
    return handle;
  });
}

/** Configures the first handle opened for `absolutePath`, leaving later opens
 *  of the same name untouched. This lets a test inject an operation at the
 *  handle boundary without turning the release's re-open into the same hook. */
function configureNextOpenAt(
  absolutePath: string,
  configure: (handle: Awaited<ReturnType<typeof open>>) => void,
): void {
  const real = vi.mocked(open).getMockImplementation();
  expect(real).toBeDefined();
  let configured = false;
  vi.mocked(open).mockImplementation(async (...args) => {
    const handle = await (real as typeof open)(...args);
    if (!configured && args[0] === absolutePath) {
      configured = true;
      configure(handle);
    }
    return handle;
  });
}

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
      lastKnownByteSize: 2048,
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
    expect(second.ok && second.attachment.lastKnownByteSize).toBe(128);
  });

  // Was a regression test for a name `placeUniquely` could produce that the
  // read paths then rejected. Its whole premise was that U+2028 survives
  // sanitizing: a JavaScript `.` does not match a line terminator, so a U+2028
  // in the extension hid `con` from the `sanitize-filename` package's
  // Windows-reserved-name regex, and `con.<U+2028>png` came through as a fixed
  // point. `placeUniquely` then stripped that extension, swapped in the
  // sniffed `.png`, and produced `con.png` — a name `sanitizeFileName` itself
  // rejects — linking to disk a file no read path could ever look up again.
  //
  // U+2028 and U+2029 are stripped now (they can inject lines into the
  // model-facing compaction list), which closes this at the door instead: the
  // name reduces to the reserved `con.png` and never reaches placement. The
  // guard inside `placeUniquely` stays as defense in depth — it costs one
  // comparison, and the next character that slips past the package would
  // otherwise reopen exactly this.
  it('rejects a name whose line separator would have hidden a reserved word', async () => {
    const desiredName = `con.${String.fromCharCode(0x2028)}png`;
    const result = await agentAttachmentStore.save(
      scratchDirectory,
      desiredName,
      streamOf(pngOf(64)),
    );

    expect(result).toEqual({ok: false, reason: 'invalid-name'});
    // Nothing was placed, and no temp file was left behind.
    await expect(
      readdir(path.join(scratchDirectory, 'attachments')),
    ).rejects.toThrow();
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
    expect(result.attachment.lastKnownByteSize).toBe(size);
  });

  it('rejects an upload that would exceed the session byte quota', async () => {
    const attachmentsDirectory = path.join(scratchDirectory, 'attachments');
    await mkdir(attachmentsDirectory, {recursive: true});

    // Ten max-sized PDFs are a legal persisted history and exactly fill the
    // 100 MiB session budget. Sparse fixtures keep this boundary test cheap
    // while presenting the same logical file sizes to the store.
    for (let index = 0; index < 10; index++) {
      const filePath = path.join(attachmentsDirectory, `${index}.pdf`);
      await writeFile(filePath, PDF_HEADER);
      await realFs.truncate(filePath, 10 * 1024 * 1024);
    }

    const result = await agentAttachmentStore.save(
      scratchDirectory,
      'overflow.png',
      streamOf(pngOf(64)),
    );

    expect(result).toEqual({
      ok: false,
      reason: 'session-quota-exceeded',
      totalBytes: 100 * 1024 * 1024 + 64,
      byteLimit: 100 * 1024 * 1024,
      totalFiles: 11,
      fileLimit: 100,
    });
    expect(await readdir(attachmentsDirectory)).not.toContain('overflow.png');
  });

  it('rejects an upload that would exceed the session file quota', async () => {
    const attachmentsDirectory = path.join(scratchDirectory, 'attachments');
    await mkdir(attachmentsDirectory, {recursive: true});
    for (let index = 0; index < 100; index++) {
      await writeFile(
        path.join(attachmentsDirectory, `${index}.png`),
        pngOf(64),
      );
    }

    const result = await agentAttachmentStore.save(
      scratchDirectory,
      'overflow.png',
      streamOf(pngOf(64)),
    );

    expect(result).toEqual({
      ok: false,
      reason: 'session-quota-exceeded',
      totalBytes: 101 * 64,
      byteLimit: 100 * 1024 * 1024,
      totalFiles: 101,
      fileLimit: 100,
    });
    expect(await readdir(attachmentsDirectory)).not.toContain('overflow.png');
  });

  it('admits only one concurrent upload into the final quota slot', async () => {
    const attachmentsDirectory = path.join(scratchDirectory, 'attachments');
    await mkdir(attachmentsDirectory, {recursive: true});
    for (let index = 0; index < 99; index++) {
      await writeFile(
        path.join(attachmentsDirectory, `${index}.png`),
        pngOf(64),
      );
    }

    const results = await Promise.all(
      Array.from({length: 10}, (_, index) =>
        agentAttachmentStore.save(
          scratchDirectory,
          `candidate-${index.toString()}.png`,
          streamOf(pngOf(64)),
        ),
      ),
    );

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(
      results
        .filter((result) => !result.ok)
        .every((result) => result.reason === 'session-quota-exceeded'),
    ).toBe(true);
    expect(await readdir(attachmentsDirectory)).toHaveLength(100);
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
      lastKnownByteSize: 256,
    });
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
    ).toEqual({
      data: bytes.toString('base64'),
      materializedByteSize: bytes.byteLength,
    });
  });

  // Regression tests for the bug this section of the review follow-up spec
  // fixes: `readBase64` used to read the file with no size check at all,
  // trusting the `lastKnownByteSize` `describe` had recorded earlier — but
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
        lastKnownByteSize: grownSize,
      });

      // remove() must also still work — an over-cap file the agent grew is
      // still the user's data, and must stay deletable from the UI.
      expect(
        await agentAttachmentStore.remove(scratchDirectory, 'shot.png'),
      ).toEqual({ok: true});
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
      ).toEqual({
        data: bytes.toString('base64'),
        materializedByteSize: bytes.byteLength,
      });
    });
  });

  // Regression tests for a concurrent DELETE racing the read paths. `describe`
  // stats the file, then sniffs its type; `readBase64` calls `describe`, then
  // separately reads the bytes. A `remove()` landing inside either gap must
  // still degrade to `null` (the adapter's "[attachment missing: ...]"
  // placeholder) rather than reject and abort the whole LLM turn.
  describe('concurrent delete racing a read', () => {
    // `describe` used to `lstat` the path and then sniff it, so a `remove()`
    // could land between and the sniff had to degrade to null. It opens once
    // now and reads everything from that handle, so the gap is gone — what is
    // left is the open itself, which reports the same two outcomes.
    it('describe returns null when the file is gone before it can be opened', async () => {
      expect(
        await agentAttachmentStore.describe(scratchDirectory, 'never.png'),
      ).toBeNull();
    });

    it('describe rejects instead of returning null when the open fails for a reason other than ENOENT', async () => {
      await agentAttachmentStore.save(
        scratchDirectory,
        'shot.png',
        streamOf(pngOf(64)),
      );

      const accessError = Object.assign(
        new Error('EACCES: permission denied'),
        {code: 'EACCES'},
      );
      vi.mocked(open).mockRejectedValueOnce(accessError);

      await expect(
        agentAttachmentStore.describe(scratchDirectory, 'shot.png'),
      ).rejects.toBe(accessError);
    });

    // The read goes through an open handle now, so the failure that has to
    // propagate is the `open` itself. ENOENT and a refused symlink are the two
    // outcomes that mean "nothing to deliver"; everything else is a real
    // failure and must not be laundered into a missing-attachment placeholder,
    // which the model would read as the user simply not having sent anything.
    it('readBase64 rejects instead of returning null when the open fails for a reason other than ENOENT', async () => {
      await agentAttachmentStore.save(
        scratchDirectory,
        'shot.png',
        streamOf(pngOf(64)),
      );

      const accessError = Object.assign(
        new Error('EACCES: permission denied'),
        {code: 'EACCES'},
      );
      vi.mocked(open).mockRejectedValueOnce(accessError);

      await expect(
        agentAttachmentStore.readBase64(scratchDirectory, 'shot.png'),
      ).rejects.toBe(accessError);
    });
  });

  // Everything `readBase64` knows now comes from one open, so the swaps these
  // used to inject — a symlink, a replaced file, a redirected parent — have no
  // window between a validation and a read to land in. What is left is the
  // open itself refusing them, which `openForDownload` covers below since both
  // go through the same private open.
  it('reports missing for a file that is not there', async () => {
    expect(
      await agentAttachmentStore.readBase64(scratchDirectory, 'nope.png'),
    ).toEqual({data: null, reason: 'missing'});
  });

  // `O_NOFOLLOW` refuses a symlinked *final* component and says nothing about
  // the parents, so renaming `attachments/` and leaving a symlink in its place
  // redirects an open of an unchanged path. Node has no `openat` to pin the
  // directory with, so the parent is re-checked after the open instead: this
  // catches a swap that persists, which is every swap that could serve a file
  // from outside the store.
  it('refuses a read reached through a swapped attachments directory', async () => {
    const elsewhere = path.join(scratchDirectory, 'elsewhere');
    await mkdir(elsewhere, {recursive: true});
    await writeFile(path.join(elsewhere, 'shot.png'), pngOf(4096));
    await agentAttachmentStore.save(
      scratchDirectory,
      'shot.png',
      streamOf(pngOf(64)),
    );
    const attachmentsDirectory =
      agentAttachmentStore.directory(scratchDirectory);

    // Between the directory check and the open of the file beneath it.
    swapAfterOpen(async () => {
      await rename(
        attachmentsDirectory,
        path.join(scratchDirectory, 'attachments.moved'),
      );
      await symlink(elsewhere, attachmentsDirectory);
    });

    expect(
      await agentAttachmentStore.readBase64(scratchDirectory, 'shot.png'),
    ).toEqual({data: null, reason: 'missing'});
  });

  describe('openForDownload', () => {
    it('hands back a handle whose facts describe the file it opened', async () => {
      await agentAttachmentStore.save(
        scratchDirectory,
        'shot.png',
        streamOf(pngOf(256)),
      );

      const opened = await agentAttachmentStore.openForDownload(
        scratchDirectory,
        'shot.png',
      );
      expect(opened).not.toBeNull();
      if (opened === null) return;
      try {
        expect(opened.attachment).toEqual({
          fileName: 'shot.png',
          mediaType: 'image/png',
          lastKnownByteSize: 256,
        });
        // The caller streams from this handle, so the size it was told and the
        // bytes it can read must be the same file — that is the whole reason
        // this returns a handle rather than a path.
        expect((await opened.handle.readFile()).byteLength).toBe(256);
      } finally {
        await opened.handle.close();
      }
    });

    it('refuses a symlink planted at the attachment name', async () => {
      const attachmentsDirectory =
        agentAttachmentStore.directory(scratchDirectory);
      await mkdir(attachmentsDirectory, {recursive: true});
      const outside = path.join(scratchDirectory, 'outside.png');
      await writeFile(outside, pngOf(64));
      await symlink(outside, path.join(attachmentsDirectory, 'link.png'));

      expect(
        await agentAttachmentStore.openForDownload(
          scratchDirectory,
          'link.png',
        ),
      ).toBeNull();
    });

    it('refuses a directory planted at the attachment name', async () => {
      const attachmentsDirectory =
        agentAttachmentStore.directory(scratchDirectory);
      await mkdir(path.join(attachmentsDirectory, 'shot.png'), {
        recursive: true,
      });

      expect(
        await agentAttachmentStore.openForDownload(
          scratchDirectory,
          'shot.png',
        ),
      ).toBeNull();
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
    ).toEqual({ok: true});
    expect(
      await agentAttachmentStore.remove(scratchDirectory, 'shot.png'),
    ).toEqual({ok: false, reason: 'not-found'});
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
    ).toEqual({ok: true});
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
    ).toEqual({ok: true});
    await expect(access(linkPath)).rejects.toThrow();
    // The target survived.
    await expect(access(outside)).resolves.toBeUndefined();
  });

  // `unlink` takes a path and has no fd form — the name is what is being
  // removed — so `remove` cannot move onto a handle the way the read paths
  // did. Between validating the directory and unlinking beneath it, a rename
  // plus symlink redirects the unchanged path, and the delete lands on a
  // same-named file outside the store.
  it('refuses to unlink through a swapped attachments directory', async () => {
    const elsewhere = path.join(scratchDirectory, 'elsewhere');
    await mkdir(elsewhere, {recursive: true});
    const stranger = path.join(elsewhere, 'shot.png');
    await writeFile(stranger, 'not ours');
    await agentAttachmentStore.save(
      scratchDirectory,
      'shot.png',
      streamOf(pngOf(64)),
    );
    const attachmentsDirectory =
      agentAttachmentStore.directory(scratchDirectory);
    const target = path.join(attachmentsDirectory, 'shot.png');

    // After `remove` has stat'd the file it intends to delete, and before the
    // unlink.
    const real = vi.mocked(lstat).getMockImplementation();
    expect(real).toBeDefined();
    vi.mocked(lstat).mockImplementation(async (input) => {
      const stats = await (real as typeof lstat)(input);
      if (input === target) {
        vi.mocked(lstat).mockImplementation(real as typeof lstat);
        await rename(
          attachmentsDirectory,
          path.join(scratchDirectory, 'attachments.moved'),
        );
        await symlink(elsewhere, attachmentsDirectory);
      }
      return stats;
    });

    expect(
      await agentAttachmentStore.remove(scratchDirectory, 'shot.png'),
    ).toEqual({ok: false, reason: 'not-found'});
    // The stranger survives.
    await expect(access(stranger)).resolves.toBeUndefined();
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
    ).resolves.toEqual({ok: false, reason: 'not-found'});
    // The directory itself must survive — remove() must refuse it outright,
    // never attempt an unlink that could behave unexpectedly on it.
    await expect(access(plantedDirectory)).resolves.toBeUndefined();
  });
});

describe('claim', () => {
  async function modeOf(fileName: string): Promise<string> {
    const stats = await lstat(
      path.join(agentAttachmentStore.directory(scratchDirectory), fileName),
    );
    return (stats.mode & 0o777).toString(8);
  }

  async function save(fileName: string, bytes: Buffer): Promise<void> {
    const result = await agentAttachmentStore.save(
      scratchDirectory,
      fileName,
      streamOf(bytes),
    );
    expect(result.ok).toBe(true);
  }

  it('freezes what it claims and describes the frozen bytes', async () => {
    await save('shot.png', pngOf(64));

    const claimed = await agentAttachmentStore.claim(scratchDirectory, [
      'shot.png',
    ]);

    expect(claimed).toEqual({
      ok: true,
      attachments: [
        {
          fileName: 'shot.png',
          mediaType: 'image/png',
          lastKnownByteSize: 64,
        },
      ],
    });
    expect(await modeOf('shot.png')).toBe('400');
    expect(
      await agentAttachmentStore.remove(scratchDirectory, 'shot.png'),
    ).toEqual({ok: false, reason: 'frozen'});
  });

  it('reports every unknown name at once, and leaves nothing frozen', async () => {
    await save('here.png', pngOf(64));

    expect(
      await agentAttachmentStore.claim(scratchDirectory, [
        'here.png',
        'gone.png',
      ]),
    ).toEqual({
      ok: false,
      reason: 'unknown-attachments',
      missing: ['gone.png'],
    });

    // `here.png` was frozen on the way to discovering `gone.png` was not
    // there. Since no turn was enqueued, it must be deletable again.
    expect(await modeOf('here.png')).toBe('600');
    expect(
      await agentAttachmentStore.remove(scratchDirectory, 'here.png'),
    ).toEqual({ok: true});
  });

  it('restores a file when describing it throws after chmod', async () => {
    await save('shot.png', pngOf(64));
    const target = path.join(
      agentAttachmentStore.directory(scratchDirectory),
      'shot.png',
    );
    configureNextOpenAt(target, (handle) => {
      vi.spyOn(handle, 'read').mockRejectedValueOnce(
        new Error('injected sniff failure'),
      );
    });

    await expect(
      agentAttachmentStore.claim(scratchDirectory, ['shot.png']),
    ).rejects.toThrow('injected sniff failure');

    expect(await modeOf('shot.png')).toBe('600');
    expect(
      await agentAttachmentStore.remove(scratchDirectory, 'shot.png'),
    ).toEqual({ok: true});
  });

  // The cap can only run after the freeze, because it needs sizes from the
  // pinned files. A claim it rejects must therefore undo the freeze: nothing
  // reached the model, so leaving the files read-only would strand disk the
  // user cannot reclaim, and repeating the request would strand more.
  it('releases what it froze when the aggregate cap rejects the claim', async () => {
    const names = ['a.pdf', 'b.pdf'];
    for (const name of names) {
      await save(
        name,
        Buffer.concat([
          PDF_HEADER,
          Buffer.alloc(MAX_DOCUMENT_ATTACHMENT_BYTES - PDF_HEADER.length),
        ]),
      );
    }

    expect(
      await agentAttachmentStore.claim(scratchDirectory, names),
    ).toMatchObject({ok: false, reason: 'attachments-too-large'});

    for (const name of names) {
      expect(await modeOf(name)).toBe('600');
      expect(await agentAttachmentStore.remove(scratchDirectory, name)).toEqual(
        {ok: true},
      );
    }
  });

  // The release opens by path like the freeze does, so it needs the same gate:
  // `O_NOFOLLOW` refuses a symlink but a directory opens fine, and `chmod`ing
  // one to 0600 strips its traversal bit. The swap lands after `describe` has
  // read the file, so the claim proceeds to the cap check, fails, and releases
  // onto whatever now holds the name.
  it('does not chmod a directory that replaced a file it froze', async () => {
    const oversized = Buffer.concat([
      PDF_HEADER,
      Buffer.alloc(MAX_DOCUMENT_ATTACHMENT_BYTES - PDF_HEADER.length),
    ]);
    await save('a.pdf', oversized);
    await save('b.pdf', oversized);

    const attachmentsDirectory =
      agentAttachmentStore.directory(scratchDirectory);
    const target = path.join(attachmentsDirectory, 'a.pdf');
    // Two files, so two opens to freeze; the swap lands after both, in the
    // gap before the release reopens them.
    swapAfterOpen(async () => {
      await unlink(target);
      await mkdir(target, {mode: 0o700});
    }, 2);

    await agentAttachmentStore.claim(scratchDirectory, ['a.pdf', 'b.pdf']);

    // The planted directory must be untouched — 0600 would have cost it the
    // traversal bit and left it unusable.
    expect(((await lstat(target)).mode & 0o777).toString(8)).toBe('700');
  });

  it('does not restore a replacement inode under the frozen file name', async () => {
    await save('shot.png', pngOf(64));
    const attachmentsDirectory =
      agentAttachmentStore.directory(scratchDirectory);
    const target = path.join(attachmentsDirectory, 'shot.png');
    const frozenOriginal = path.join(attachmentsDirectory, 'shot.moved.png');

    configureNextOpenAt(target, (handle) => {
      const realChmod = handle.chmod.bind(handle);
      vi.spyOn(handle, 'chmod').mockImplementationOnce(async (mode) => {
        await realChmod(mode);
        await rename(target, frozenOriginal);
        await writeFile(target, pngOf(64), {mode: 0o644});
      });
    });

    expect(
      await agentAttachmentStore.claim(scratchDirectory, [
        'shot.png',
        'gone.png',
      ]),
    ).toEqual({
      ok: false,
      reason: 'unknown-attachments',
      missing: ['gone.png'],
    });

    expect(((await lstat(target)).mode & 0o777).toString(8)).toBe('644');
    expect(((await lstat(frozenOriginal)).mode & 0o777).toString(8)).toBe(
      '400',
    );
  });

  // `release` reached `resolveInside` without checking the attachments
  // directory itself, unlike every other path here — and `O_NOFOLLOW` only
  // guards the final component. With `attachments` replaced by a symlink, a
  // failing claim's cleanup walked outside the store and un-froze a
  // same-named stranger.
  it('does not release through a swapped attachments directory', async () => {
    const oversized = Buffer.concat([
      PDF_HEADER,
      Buffer.alloc(MAX_DOCUMENT_ATTACHMENT_BYTES - PDF_HEADER.length),
    ]);
    await save('a.pdf', oversized);
    await save('b.pdf', oversized);

    const attachmentsDirectory =
      agentAttachmentStore.directory(scratchDirectory);
    const elsewhere = path.join(scratchDirectory, 'elsewhere');
    await mkdir(elsewhere, {recursive: true});
    const stranger = path.join(elsewhere, 'a.pdf');
    await writeFile(stranger, 'not ours', {mode: 0o400});

    // After both freezes, so neither walks into the swapped directory.
    swapAfterOpen(async () => {
      await rename(
        attachmentsDirectory,
        path.join(scratchDirectory, 'attachments.moved'),
      );
      await symlink(elsewhere, attachmentsDirectory);
    }, 2);

    // Which failure it reports depends on where the swap lands relative to
    // each freeze's own parent re-check — either way the claim must fail, and
    // either way nothing outside the store may have its mode touched.
    expect(
      await agentAttachmentStore.claim(scratchDirectory, ['a.pdf', 'b.pdf']),
    ).toMatchObject({ok: false});

    expect(((await lstat(stranger)).mode & 0o777).toString(8)).toBe('400');
  });

  // `freezeOne` accepts any regular file — deliverability is `describe`'s
  // question and it runs afterwards — so a claim can freeze something the
  // store did not create and then reject it. Cleanup used to write back a
  // fixed 0600, silently rewriting an agent-created file that only happened to
  // be sitting in the directory.
  it('restores the mode a released file actually had, not a constant', async () => {
    const attachmentsDirectory =
      agentAttachmentStore.directory(scratchDirectory);
    await mkdir(attachmentsDirectory, {recursive: true});
    const stranger = path.join(attachmentsDirectory, 'notes.png');
    await writeFile(stranger, 'not a deliverable media type', {mode: 0o644});

    // `describe` rejects it — it does not sniff as anything deliverable — so
    // the claim fails after the freeze and releases what it froze.
    expect(
      await agentAttachmentStore.claim(scratchDirectory, ['notes.png']),
    ).toMatchObject({ok: false, reason: 'unknown-attachments'});

    expect(((await lstat(stranger)).mode & 0o777).toString(8)).toBe('644');
  });

  // The release must not reach past its own claim: a file frozen by an earlier
  // message is in history, and un-freezing it would let the name be freed and
  // rebound to different bytes — the thing freezing exists to prevent.
  it('leaves an already-frozen attachment frozen when a later claim is rejected', async () => {
    // A PNG, so `save` stores it under `.png` — the store names files by the
    // sniffed type, never by the requested extension.
    await save('sent.png', pngOf(64));
    expect(
      await agentAttachmentStore.claim(scratchDirectory, ['sent.png']),
    ).toMatchObject({ok: true});

    const oversized = Buffer.concat([
      PDF_HEADER,
      Buffer.alloc(MAX_DOCUMENT_ATTACHMENT_BYTES - PDF_HEADER.length),
    ]);
    await save('a.pdf', oversized);
    await save('b.pdf', oversized);

    expect(
      await agentAttachmentStore.claim(scratchDirectory, [
        'sent.png',
        'a.pdf',
        'b.pdf',
      ]),
    ).toMatchObject({ok: false, reason: 'attachments-too-large'});

    // The two this claim froze are released; the one an earlier claim froze
    // stays frozen.
    expect(await modeOf('a.pdf')).toBe('600');
    expect(await modeOf('b.pdf')).toBe('600');
    expect(await modeOf('sent.png')).toBe('400');
    expect(
      await agentAttachmentStore.remove(scratchDirectory, 'sent.png'),
    ).toEqual({ok: false, reason: 'frozen'});
  });

  // `remove` checks the frozen bit and then unlinks, and `unlink` succeeds on a
  // 0400 file — deletion depends on the directory's mode, not the file's. So a
  // claim landing between those two steps freezes a file the delete removes
  // anyway, and both report success.
  //
  // The interleaving is forced rather than raced for. An earlier version of
  // this test fired `claim` and `remove` concurrently 200 times and asserted
  // they never both won; it passed with the lock on either method alone, and
  // even with no lock the outcome turned on microtask ordering — a single
  // extra `await` was enough to hide the bug. It was measuring luck. Hooking
  // `lstat` puts the claim exactly in the window instead, so the assertion is
  // about mutual exclusion and not about timing.
  /** Resolves once the file is read-only, or after `timeoutMs` if it never is.
   *  Polling rather than a fixed sleep so the unlocked case — the one that must
   *  fail — is decided by seeing the freeze, not by guessing how long it takes. */
  async function waitForFreeze(absolutePath: string, timeoutMs = 200) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const stats = await realFs.lstat(absolutePath).catch(() => null);
      if (stats !== null && (stats.mode & 0o200) === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
  }

  it('never lets a concurrent claim and remove both succeed', async () => {
    await save('shot.png', pngOf(64));
    const attachmentPath = path.join(
      agentAttachmentStore.directory(scratchDirectory),
      'shot.png',
    );

    let claiming: Promise<unknown> = Promise.resolve();
    vi.mocked(lstat).mockImplementation(async (target) => {
      const stats = await realFs.lstat(target);
      if (target !== attachmentPath) return stats;
      // `remove` has just read the mode and has not unlinked yet. Start a claim
      // and wait for it to actually freeze the file. Blocked by the lock it
      // never does and this gives up after the timeout; without the lock the
      // wait ends the moment the write bit clears — so the failing case is
      // decided by observation rather than by how far a macrotask got.
      vi.mocked(lstat).mockImplementation(realFs.lstat);
      claiming = agentAttachmentStore.claim(scratchDirectory, ['shot.png']);
      await waitForFreeze(attachmentPath);
      return stats;
    });

    const removed = await agentAttachmentStore.remove(
      scratchDirectory,
      'shot.png',
    );
    const claimed = await claiming;

    expect(removed.ok && (claimed as {ok: boolean}).ok).toBe(false);
    // Whichever won, the store agrees with itself afterwards.
    const found = await agentAttachmentStore.describe(
      scratchDirectory,
      'shot.png',
    );
    expect(found === null).toBe(removed.ok);
  }, 20000);

  it('refuses a directory planted at an attachment name', async () => {
    const attachmentsDirectory =
      agentAttachmentStore.directory(scratchDirectory);
    await mkdir(path.join(attachmentsDirectory, 'shot.png'), {recursive: true});

    expect(
      await agentAttachmentStore.claim(scratchDirectory, ['shot.png']),
    ).toEqual({
      ok: false,
      reason: 'unknown-attachments',
      missing: ['shot.png'],
    });
  });

  it('refuses a FIFO without blocking on a writer that never comes', async () => {
    const attachmentsDirectory =
      agentAttachmentStore.directory(scratchDirectory);
    await mkdir(attachmentsDirectory, {recursive: true});
    await promisify(execFile)('mkfifo', [
      path.join(attachmentsDirectory, 'shot.png'),
    ]);

    expect(
      await agentAttachmentStore.claim(scratchDirectory, ['shot.png']),
    ).toMatchObject({ok: false, reason: 'unknown-attachments'});
  }, 5000);

  // `chmod` follows symlinks; claiming must not, or a link planted at an
  // attachment name would turn some file outside the store read-only.
  it('refuses a symlink instead of chmod-ing its target', async () => {
    const attachmentsDirectory =
      agentAttachmentStore.directory(scratchDirectory);
    await mkdir(attachmentsDirectory, {recursive: true});
    const outside = path.join(scratchDirectory, 'outside.png');
    await writeFile(outside, pngOf(64), {mode: 0o600});
    await symlink(outside, path.join(attachmentsDirectory, 'link.png'));

    expect(
      await agentAttachmentStore.claim(scratchDirectory, ['link.png']),
    ).toMatchObject({ok: false, reason: 'unknown-attachments'});
    expect((await lstat(outside)).mode & 0o777).toBe(0o600);
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
    expect(
      await agentAttachmentStore.remove(scratchDirectory, fileName),
    ).toEqual({ok: false, reason: 'not-found'});
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
    ).toEqual({ok: false, reason: 'not-found'});
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
