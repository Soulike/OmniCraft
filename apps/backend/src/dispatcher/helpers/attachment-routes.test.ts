import crypto from 'node:crypto';
import type {FileHandle} from 'node:fs/promises';
import {mkdtemp, open, rm, stat, writeFile} from 'node:fs/promises';
import type {Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type {Readable} from 'node:stream';

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
    async openAttachment(agentId, _fileName) {
      if (agentId !== SESSION_ID || descriptorToReturn === null) {
        return {ok: false, reason: 'attachment-not-found'};
      }
      const handle = await open(pathToServe, 'r');
      lastServedHandle = handle;
      const stats = await handle.stat();
      return {
        ok: true,
        opened: {
          handle,
          attachment: {
            ...descriptorToReturn.attachment,
            ...(openedMediaTypeOverride === null
              ? {}
              : {mediaType: openedMediaTypeOverride}),
            lastKnownByteSize: stats.size,
          },
          mtimeMs: stats.mtimeMs,
        },
      };
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
  lastServedHandle = null;
  openedMediaTypeOverride = null;
});

let pathToServe = '';
let lastServedHandle: FileHandle | null = null;
let openedMediaTypeOverride: 'image/png' | 'application/pdf' | null = null;

async function descriptorFor(
  fileName: string,
  mediaType: 'image/png' | 'application/pdf' = 'image/png',
): Promise<AttachmentDescriptor> {
  const absolutePath = path.join(scratchDirectory, crypto.randomUUID());
  await writeFile(absolutePath, 'bytes');
  pathToServe = absolutePath;
  const stats = await stat(absolutePath);
  return {
    attachment: {fileName, mediaType, lastKnownByteSize: stats.size},
    // The file's real mtime, as a real `describe` returns. Anything else makes
    // the fixture describe a file it does not point at — and the conditional
    // path would never match, because the 200's validator comes from the
    // opened handle. They agree by construction whenever the file has not
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
  it('serves the whole file when the descriptor is in step with it', async () => {
    descriptorToReturn = await descriptorFor('shot.png');

    const res = await fetch(
      `${baseUrl}/sessions/${SESSION_ID}/attachments/shot.png`,
    );

    expect(res.headers.get('content-length')).toBe('5');
    expect((await res.arrayBuffer()).byteLength).toBe(5);
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

  // `describe` and the open are two resolutions of one name, and an unfrozen
  // attachment can change between them, so the store can genuinely report one
  // media type from the first and another from the second. Every header
  // describing the body has to come from the handle being streamed, or the
  // response advertises an inline PNG while sending PDF bytes.
  it('takes Content-Type and disposition from the opened handle', async () => {
    descriptorToReturn = await descriptorFor('shot.png');
    openedMediaTypeOverride = 'application/pdf';

    const res = await fetch(
      `${baseUrl}/sessions/${SESSION_ID}/attachments/shot.png`,
    );

    expect(res.headers.get('content-type')).toContain('application/pdf');
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="shot.png"',
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
    // Not Content-Type: Koa's empty-status path sets `ctx.body = null`, which
    // strips it. Asserted rather than omitted so the boundary is pinned — the
    // comment on the route used to claim all of these survive.
    expect(res.headers.get('content-type')).toBeNull();
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

describe('GET .../attachments/:fileName handle ownership', () => {
  async function handleState(): Promise<string> {
    if (lastServedHandle === null) return 'never opened';
    try {
      await lastServedHandle.stat();
      return 'still open';
    } catch (error: unknown) {
      return error instanceof Error && 'code' in error
        ? `closed (${String(error.code)})`
        : 'closed';
    }
  }

  // The route never closes the handle it is given. That is correct rather than
  // an oversight — `createReadStream` owns it and closes it when the stream
  // ends — but "correct" here rests on a default, so it is worth pinning.
  it('closes the handle once the response has been streamed', async () => {
    descriptorToReturn = await descriptorFor('shot.png');

    const res = await fetch(
      `${baseUrl}/sessions/${SESSION_ID}/attachments/shot.png`,
    );
    await res.arrayBuffer();
    // Koa destroys the body stream on response finish; give that a turn.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(await handleState()).toBe('closed (EBADF)');
  });

  // The other direction, which a fully-consumed response does not cover: a
  // client that walks away mid-download. Koa destroys the stream, and
  // destroying it closes the handle — otherwise every abandoned download would
  // leak a descriptor for the process's lifetime.
  it('closes the handle when the client disconnects mid-download', async () => {
    // Large enough that the body is still in flight when the abort lands, and
    // awaited to the headers first — an abort issued before the request
    // reaches the server proves nothing, which is how the first version of
    // this test "passed" the wrong thing.
    descriptorToReturn = await descriptorFor('big.png');
    await writeFile(pathToServe, Buffer.alloc(16 * 1024 * 1024, 0x61));

    const controller = new AbortController();
    const res = await fetch(
      `${baseUrl}/sessions/${SESSION_ID}/attachments/big.png`,
      {signal: controller.signal},
    );
    expect(res.status).toBe(200);
    controller.abort();
    await res.arrayBuffer().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(await handleState()).toBe('closed (EBADF)');
  }, 20000);
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
