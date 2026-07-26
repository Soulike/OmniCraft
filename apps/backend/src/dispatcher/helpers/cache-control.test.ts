import type {Server} from 'node:http';
import type {AddressInfo} from 'node:net';

import type {Middleware} from 'koa';
import Koa from 'koa';
import {afterEach, describe, expect, it} from 'vitest';

import {defaultCacheControl} from './cache-control.js';

/**
 * Every case here drives a real request through a real Koa app rather than a
 * hand-written context double.
 *
 * The previous version of this file used a double whose `response.get()`
 * returned `headers.get(name) ?? ''` — matching what the middleware assumed,
 * and both were wrong. Koa 3's `get` is a bare `res.getHeader()`, so an unset
 * header is `undefined`, the `=== ''` branch never ran, and no real response
 * ever carried the default. A double that encodes the same misunderstanding as
 * the code under test can only confirm it, which is exactly what it did for
 * three green tests. Nothing short of a round trip would have caught it.
 */
let server: Server | null = null;

afterEach(() => {
  server?.close();
  server = null;
});

async function get(handler: Middleware): Promise<Response> {
  const app = new Koa();
  app.use(defaultCacheControl());
  app.use(handler);

  const started = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => {
      resolve(s);
    });
  });
  server = started;

  const {port} = started.address() as AddressInfo;
  return fetch(`http://127.0.0.1:${port.toString()}/`);
}

describe('defaultCacheControl', () => {
  it('sets no-store when the handler left the header unset', async () => {
    const res = await get((ctx) => {
      ctx.body = {ok: true};
    });

    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('leaves a handler-set policy untouched', async () => {
    const res = await get((ctx) => {
      ctx.set('Cache-Control', 'public, max-age=3600');
      ctx.body = {ok: true};
    });

    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
  });

  // The attachment download endpoint's exact shape: a handler that opts into
  // revalidation rather than no-store. This is the case the middleware exists
  // not to break.
  it('leaves a revalidating policy untouched alongside an ETag', async () => {
    const res = await get((ctx) => {
      ctx.set('Cache-Control', 'private, max-age=0, must-revalidate');
      ctx.response.etag = '"5-1"';
      ctx.body = 'bytes';
    });

    expect(res.headers.get('cache-control')).toBe(
      'private, max-age=0, must-revalidate',
    );
    expect(res.headers.get('etag')).toBe('"5-1"');
  });

  it('applies the default on an error status too', async () => {
    const res = await get((ctx) => {
      ctx.status = 404;
      ctx.body = {error: 'nope'};
    });

    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
