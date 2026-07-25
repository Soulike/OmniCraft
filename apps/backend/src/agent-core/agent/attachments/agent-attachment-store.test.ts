import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {
  agentAttachmentStore,
  MAX_DOCUMENT_ATTACHMENT_BYTES,
  MAX_IMAGE_ATTACHMENT_BYTES,
} from './agent-attachment-store.js';

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

  it('strips directory components and control characters from the name', async () => {
    const result = await agentAttachmentStore.save(
      scratchDirectory,
      `../../etc/pa${NUL}ss.png`,
      streamOf(pngOf(64)),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachment.fileName).toBe('pass.png');
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

    const {readdir} = await import('node:fs/promises');
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

  it('returns null for a missing file', async () => {
    expect(
      await agentAttachmentStore.describe(scratchDirectory, 'nope.png'),
    ).toBeNull();
    expect(
      await agentAttachmentStore.readBase64(scratchDirectory, 'nope.png'),
    ).toBeNull();
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
    ).toBe(bytes.toString('base64'));
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
});

describe('path safety', () => {
  it.each([
    ['a traversal segment', '../snapshot.json'],
    ['a nested path', 'sub/shot.png'],
    ['a backslash path', 'sub\\shot.png'],
    ['an absolute path', '/etc/passwd'],
    ['a dot name', '.'],
    ['a dot-dot name', '..'],
    ['an empty name', ''],
    ['a name with a control character', `sh${NUL}ot.png`],
  ])('rejects %s on read', async (_label, fileName) => {
    expect(
      await agentAttachmentStore.describe(scratchDirectory, fileName),
    ).toBeNull();
    expect(
      await agentAttachmentStore.readBase64(scratchDirectory, fileName),
    ).toBeNull();
    expect(await agentAttachmentStore.remove(scratchDirectory, fileName)).toBe(
      false,
    );
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
    ).toBeNull();
  });
});
