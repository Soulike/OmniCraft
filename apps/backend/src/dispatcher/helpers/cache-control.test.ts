import {describe, expect, it, vi} from 'vitest';

import {defaultCacheControl} from './cache-control.js';

/**
 * Minimal fake Koa context object that exposes the `response.get` / `set`
 * surface the cache-control middleware uses.
 *
 * Koa's `ctx.response.get()` returns `''` (empty string) for an unset header,
 * not `undefined`. This double reproduces that behavior.
 */
interface FakeContext {
  response: {
    get(name: string): string;
  };
  set(name: string, value: string): void;
}

function createFakeContext(): FakeContext & {headers: Map<string, string>} {
  const headers = new Map<string, string>();

  return {
    headers,
    response: {
      get(name: string): string {
        return headers.get(name) ?? '';
      },
    },
    set(name: string, value: string): void {
      headers.set(name, value);
    },
  };
}

describe('defaultCacheControl', () => {
  it('sets Cache-Control: no-store when the handler left the header unset', async () => {
    const ctx = createFakeContext();
    const middleware = defaultCacheControl();

    // Handler that does not set Cache-Control
    const next = vi.fn(() => {
      // Simulate a handler that returns without setting the header
      return Promise.resolve();
    });

    await middleware(ctx as never, next);

    expect(ctx.headers.get('Cache-Control')).toBe('no-store');
    expect(next).toHaveBeenCalledOnce();
  });

  it('leaves a handler-set Cache-Control untouched', async () => {
    const ctx = createFakeContext();
    const middleware = defaultCacheControl();

    // Handler that sets its own caching policy (e.g. for immutable resources)
    const next = vi.fn(() => {
      ctx.set('Cache-Control', 'private, max-age=31536000, immutable');
      return Promise.resolve();
    });

    await middleware(ctx as never, next);

    expect(ctx.headers.get('Cache-Control')).toBe(
      'private, max-age=31536000, immutable',
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it('runs after the downstream handler (awaits next before reading the header)', async () => {
    const ctx = createFakeContext();
    const middleware = defaultCacheControl();
    const callOrder: string[] = [];

    // Handler that sets the header inside next()
    const next = vi.fn(() => {
      callOrder.push('handler-sets-header');
      ctx.set('Cache-Control', 'public, max-age=3600');
      return Promise.resolve();
    });

    await middleware(ctx as never, next);

    // Verify the order: handler runs first (via next), then middleware checks
    // The middleware should read the header AFTER next() returns
    expect(callOrder).toEqual(['handler-sets-header']);

    // Verify the header was not overwritten (handler's value survives)
    expect(ctx.headers.get('Cache-Control')).toBe('public, max-age=3600');
  });
});
