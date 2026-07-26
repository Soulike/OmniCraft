import crypto from 'node:crypto';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
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

async function descriptorFor(fileName: string): Promise<AttachmentDescriptor> {
  const absolutePath = path.join(scratchDirectory, crypto.randomUUID());
  await writeFile(absolutePath, 'bytes');
  return {
    attachment: {fileName, mediaType: 'image/png', byteSize: 5},
    absolutePath,
    mtimeMs: Date.now(),
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
