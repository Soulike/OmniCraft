import {execFile} from 'node:child_process';
import crypto from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import type {Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type {Readable} from 'node:stream';
import {promisify} from 'node:util';

import Router from '@koa/router';
import Koa from 'koa';
import {afterAll, afterEach, beforeAll, describe, expect, it} from 'vitest';

import type {AttachmentDescriptor} from '@/agent-core/agent/index.js';

import type {AttachmentSessionService} from './attachment-routes.js';
import {registerAttachmentRoutes} from './attachment-routes.js';

const COLLECTION_PATH = '/sessions/:id/attachments';
const BY_NAME_PATH = '/sessions/:id/attachments/:fileName';
const SESSION_ID = crypto.randomUUID();

let scratchDirectory: string;
let server: Server;
let baseUrl: string;
let descriptorToReturn: AttachmentDescriptor | null = null;
let removeResultToReturn: Awaited<
  ReturnType<AttachmentSessionService['removeAttachment']>
> = {ok: true};

/**
 * A minimal stand-in for `chatAgentSessionService` / `codingAgentSessionService`
 * — the router only needs `describeAttachment` for the cases below, but the
 * interface requires all three methods.
 */
function fakeService(): AttachmentSessionService {
  return {
    saveAttachment(
      _agentId: string,
      _desiredName: string,
      _body: Readable,
    ): ReturnType<AttachmentSessionService['saveAttachment']> {
      throw new Error('not exercised by these tests');
    },
    describeAttachment(agentId, _fileName) {
      if (agentId !== SESSION_ID || descriptorToReturn === null) {
        return Promise.resolve({ok: false, reason: 'attachment-not-found'});
      }
      return Promise.resolve({ok: true, descriptor: descriptorToReturn});
    },
    removeAttachment(
      _agentId: string,
      _fileName: string,
    ): ReturnType<AttachmentSessionService['removeAttachment']> {
      return Promise.resolve(removeResultToReturn);
    },
  };
}

beforeAll(async () => {
  scratchDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'attachment-routes-'),
  );

  const router = new Router();
  registerAttachmentRoutes(
    router,
    {collection: COLLECTION_PATH, byName: BY_NAME_PATH},
    fakeService(),
  );
  const app = new Koa();
  app.use(router.routes());
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  const {port} = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port.toString()}`;
});

afterAll(async () => {
  server.close();
  await rm(scratchDirectory, {recursive: true, force: true});
});

afterEach(() => {
  descriptorToReturn = null;
  removeResultToReturn = {ok: true};
});

async function descriptorFor(
  fileName: string,
  mediaType: 'image/png' | 'application/pdf' = 'image/png',
): Promise<AttachmentDescriptor> {
  const absolutePath = path.join(scratchDirectory, crypto.randomUUID());
  await writeFile(absolutePath, 'bytes');
  const stats = await stat(absolutePath);
  return {
    attachment: {fileName, mediaType, lastKnownByteSize: 5},
    absolutePath,
    identity: {deviceId: stats.dev, inode: stats.ino},
    // The file's real mtime, as a real `describe` returns. Anything else makes
    // the fixture describe a file it does not point at — and the conditional
    // path would never match, because the 200's validator is re-derived from
    // the open handle. They agree by construction whenever the file has not
    // changed, which is exactly when a 304 is correct.
    mtimeMs: stats.mtimeMs,
  };
}

describe('GET .../attachments/:fileName response hardening', () => {
  it('sets nosniff and an inline Content-Disposition carrying the file name', async () => {
    descriptorToReturn = await descriptorFor('shot.png');

    const res = await fetch(
      `${baseUrl}/sessions/${SESSION_ID}/attachments/shot.png`,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-disposition')).toBe(
      'inline; filename="shot.png"',
    );
  });

  // A stored name cannot contain a control character, `/`, or `\` (the
  // sanitizer strips them), but nothing stops a `"` from surviving — and an
  // unescaped one would close the quoted-string early, letting the rest of
  // the file name be read as extra header parameters instead of as part of
  // the file name.
  it('escapes a double quote in the file name instead of breaking the quoted-string', async () => {
    descriptorToReturn = await descriptorFor('weird"name.png');

    const res = await fetch(
      `${baseUrl}/sessions/${SESSION_ID}/attachments/weird%22name.png`,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe(
      String.raw`inline; filename="weird\"name.png"`,
    );
  });

  // The sanitizer preserves Unicode, so a stored name legitimately can be
  // non-ASCII — but Node's `setHeader` rejects any code point outside latin1
  // with ERR_INVALID_CHAR, which turned a successful upload into a 500 on
  // download. The ASCII fallback keeps the header emittable; `filename*`
  // carries the real name for clients that read it.
  it('serves a non-ASCII file name instead of throwing on the header', async () => {
    descriptorToReturn = await descriptorFor('\u3042.png');

    const res = await fetch(
      `${baseUrl}/sessions/${SESSION_ID}/attachments/${encodeURIComponent('\u3042.png')}`,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe(
      'inline; filename="?.png"; filename*=UTF-8\'\'%E3%81%82.png',
    );
  });
});

describe('GET .../attachments/:fileName body framing', () => {
  // `describe`'s stat and the route's `open` both resolve the path by name and
  // are separate awaits, so a DELETE plus a same-name re-upload between them
  // leaves the descriptor describing a file this response is not sending. The
  // stale `lastKnownByteSize` does not fail loudly: the client stops reading at
  // `Content-Length`, so the download arrives silently truncated — and the
  // matching `ETag` caches the corruption. A descriptor deliberately out of
  // step with its file stands in for the race.
  it('takes Content-Length and ETag from the open file, not the stale descriptor', async () => {
    const descriptor = await descriptorFor('shot.png');
    await writeFile(descriptor.absolutePath, Buffer.alloc(100, 0x61));
    descriptorToReturn = descriptor;

    const res = await fetch(
      `${baseUrl}/sessions/${SESSION_ID}/attachments/shot.png`,
    );
    const body = await res.arrayBuffer();

    expect(descriptor.attachment.lastKnownByteSize).toBe(5);
    expect(res.headers.get('content-length')).toBe('100');
    expect(body.byteLength).toBe(100);
    expect(res.headers.get('etag')).toMatch(/^"100-/);
  });

  // The other direction, which fails differently: with a stale length LARGER
  // than the file, the client waits for bytes that never arrive instead of
  // getting a short read. Asserted with a timeout so a regression shows up as
  // a failure rather than a hung suite.
  it('does not leave the client waiting when the file is smaller than the descriptor', async () => {
    const descriptor = await descriptorFor('shot.png');
    await writeFile(descriptor.absolutePath, Buffer.alloc(2, 0x61));
    descriptorToReturn = descriptor;

    const res = await fetch(
      `${baseUrl}/sessions/${SESSION_ID}/attachments/shot.png`,
      {signal: AbortSignal.timeout(5000)},
    );
    const body = await res.arrayBuffer();

    expect(descriptor.attachment.lastKnownByteSize).toBe(5);
    expect(res.headers.get('content-length')).toBe('2');
    expect(body.byteLength).toBe(2);
  });

  it('serves the whole file when the descriptor is in step with it', async () => {
    descriptorToReturn = await descriptorFor('shot.png');

    const res = await fetch(
      `${baseUrl}/sessions/${SESSION_ID}/attachments/shot.png`,
    );

    expect(res.headers.get('content-length')).toBe('5');
    expect((await res.arrayBuffer()).byteLength).toBe(5);
  });
});

describe('GET .../attachments/:fileName open-time hardening', () => {
  // `describe` refuses a symlink via `lstat`, but that refusal does not carry
  // over to the route's `open()`, which resolves the same name a moment later
  // and follows links. Planting one in that gap turned this endpoint into an
  // arbitrary file read returning 200. The descriptor here points at a path
  // that is a symlink by the time the route opens it, which is that state.
  it('refuses a symlink instead of streaming its target', async () => {
    const descriptor = await descriptorFor('shot.png');
    const secret = path.join(scratchDirectory, 'secret.txt');
    await writeFile(secret, 'TOP SECRET OUTSIDE THE STORE');
    await rm(descriptor.absolutePath);
    await symlink(secret, descriptor.absolutePath);
    descriptorToReturn = descriptor;

    const res = await fetch(
      `${baseUrl}/sessions/${SESSION_ID}/attachments/shot.png`,
    );
    const body = await res.text();

    expect(res.status).toBe(404);
    expect(body).not.toContain('TOP SECRET');
  });

  // `O_NOFOLLOW` only refuses a symlinked *final* component, so the path can
  // still be redirected higher up: rename the directory the descriptor points
  // into, leave a symlink in its place, and an `open` of the same string
  // resolves outside the store. Node has no `openat` to pin the parent with,
  // so the response is bound to the file's inode instead — any component
  // changing underneath yields a different one.
  it('refuses a file reached through a swapped parent directory', async () => {
    const realDirectory = path.join(scratchDirectory, 'real');
    const elsewhere = path.join(scratchDirectory, 'elsewhere');
    await mkdir(realDirectory);
    await mkdir(elsewhere);
    const absolutePath = path.join(realDirectory, 'shot.png');
    await writeFile(absolutePath, 'bytes');
    await writeFile(path.join(elsewhere, 'shot.png'), 'TOP SECRET');
    const stats = await stat(absolutePath);

    descriptorToReturn = {
      attachment: {
        fileName: 'shot.png',
        mediaType: 'image/png',
        lastKnownByteSize: 5,
      },
      absolutePath,
      identity: {deviceId: stats.dev, inode: stats.ino},
      mtimeMs: Date.now(),
    };

    // The parent is swapped after the descriptor was produced.
    await rename(realDirectory, path.join(scratchDirectory, 'real.moved'));
    await symlink(elsewhere, realDirectory);

    const res = await fetch(
      `${baseUrl}/sessions/${SESSION_ID}/attachments/shot.png`,
    );
    const body = await res.text();

    expect(res.status).toBe(404);
    expect(body).not.toContain('TOP SECRET');
  });

  // `O_NOFOLLOW` does not cover this one: a directory opens fine, and the
  // failure would otherwise surface mid-stream, after the status is committed.
  it('refuses a directory planted at the attachment path', async () => {
    const descriptor = await descriptorFor('shot.png');
    await rm(descriptor.absolutePath);
    await mkdir(descriptor.absolutePath);
    descriptorToReturn = descriptor;

    const res = await fetch(
      `${baseUrl}/sessions/${SESSION_ID}/attachments/shot.png`,
    );

    expect(res.status).toBe(404);
  });

  // Without `O_NONBLOCK` this hangs rather than fails: opening a FIFO waits
  // for a writer that never comes. Bounded by a timeout so a regression is a
  // failure and not a stuck suite.
  it('refuses a FIFO without hanging the request', async () => {
    const descriptor = await descriptorFor('shot.png');
    await rm(descriptor.absolutePath);
    await promisify(execFile)('mkfifo', [descriptor.absolutePath]);
    descriptorToReturn = descriptor;

    const res = await fetch(
      `${baseUrl}/sessions/${SESSION_ID}/attachments/shot.png`,
      {signal: AbortSignal.timeout(5000)},
    );

    expect(res.status).toBe(404);
  });
});

describe('GET .../attachments/:fileName disposition', () => {
  // Images are rendered inline in the message stream, so they need it. A PDF
  // does not, and handing an untrusted document to the browser's PDF viewer on
  // the same origin as the agent-control API buys nothing.
  it('serves a PDF as an attachment, not inline', async () => {
    descriptorToReturn = await descriptorFor('invoice.pdf', 'application/pdf');

    const res = await fetch(
      `${baseUrl}/sessions/${SESSION_ID}/attachments/invoice.pdf`,
    );

    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="invoice.pdf"',
    );
  });

  it('keeps images inline', async () => {
    descriptorToReturn = await descriptorFor('shot.png');

    const res = await fetch(
      `${baseUrl}/sessions/${SESSION_ID}/attachments/shot.png`,
    );

    expect(res.headers.get('content-disposition')).toBe(
      'inline; filename="shot.png"',
    );
  });

  // Only binds when the response is loaded as a document, so an `<img>` is
  // unaffected; what it covers is a user navigating straight to the URL.
  it('sandboxes the response', async () => {
    descriptorToReturn = await descriptorFor('shot.png');

    const res = await fetch(
      `${baseUrl}/sessions/${SESSION_ID}/attachments/shot.png`,
    );

    expect(res.headers.get('content-security-policy')).toBe('sandbox');
  });
});

describe('GET .../attachments/:fileName conditional request', () => {
  async function conditionalGet(fileName: string): Promise<Response> {
    const first = await fetch(
      `${baseUrl}/sessions/${SESSION_ID}/attachments/${fileName}`,
    );
    const etag = first.headers.get('etag');
    expect(etag).not.toBeNull();
    await first.arrayBuffer();
    return fetch(`${baseUrl}/sessions/${SESSION_ID}/attachments/${fileName}`, {
      headers: {
        'If-None-Match': etag ?? '',
        // Node's `fetch` sends `cache-control: no-cache` by default, and the
        // `fresh` package honours it by refusing to report freshness at all —
        // correct HTTP, but it would make every conditional request here a 200
        // and the assertions below meaningless.
        'Cache-Control': 'max-age=0',
      },
    });
  }

  it('answers a matching If-None-Match with 304', async () => {
    descriptorToReturn = await descriptorFor('shot.png');

    expect((await conditionalGet('shot.png')).status).toBe(304);
  });

  // A compliant cache reuses the stored 200's metadata, so omitting these is
  // not a correctness bug — but it makes the hardening depend on that merge
  // being done right by whatever sits in front of us, which is a poor thing to
  // rely on for headers whose whole job is to constrain a browser.
  it('carries the descriptor-derived metadata on the 304', async () => {
    descriptorToReturn = await descriptorFor('shot.png');

    const res = await conditionalGet('shot.png');

    expect(res.status).toBe(304);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toBe('sandbox');
    expect(res.headers.get('content-disposition')).toBe(
      'inline; filename="shot.png"',
    );
    expect(res.headers.get('cache-control')).toBe(
      'private, max-age=0, must-revalidate',
    );
  });
});

describe('DELETE .../attachments/:fileName', () => {
  async function del(fileName: string): Promise<Response> {
    return fetch(`${baseUrl}/sessions/${SESSION_ID}/attachments/${fileName}`, {
      method: 'DELETE',
    });
  }

  it('returns 204 for an attachment that was removed', async () => {
    removeResultToReturn = {ok: true};

    expect((await del('shot.png')).status).toBe(204);
  });

  it.each(['session-not-found', 'attachment-not-found'] as const)(
    'returns 404 for %s',
    async (reason) => {
      removeResultToReturn = {ok: false, reason};

      expect((await del('shot.png')).status).toBe(404);
    },
  );

  // Not a 404: the file is there, and saying otherwise would invite the client
  // to retry the upload under the same name — the exact move the freeze
  // exists to prevent. Not a 403 either: nothing about the caller is wrong.
  it('returns 409, not 404, for an attachment already sent to the model', async () => {
    removeResultToReturn = {ok: false, reason: 'attachment-frozen'};

    const res = await del('shot.png');

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error:
        'Attachment has been sent to the model and can no longer be removed',
    });
  });
});
