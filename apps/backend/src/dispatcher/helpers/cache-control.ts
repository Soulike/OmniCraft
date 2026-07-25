import type {Middleware} from 'koa';

/**
 * Returns a middleware that sets `Cache-Control: no-store` on `/api` responses
 * when the handler leaves the header unset.
 *
 * Handlers may set their own caching policy for cacheable resources (e.g.
 * attachment downloads with `private, max-age=0, must-revalidate` plus an
 * `ETag`). This middleware runs after the handler to provide a safe default,
 * ensuring it does not overwrite handler-set policies.
 *
 * Note: Koa's `ctx.response.get()` returns `''` (empty string) for an unset header,
 * not `undefined`. This middleware checks for that sentinel value to detect whether
 * a handler explicitly set the header.
 */
export function defaultCacheControl(): Middleware {
  return async (ctx, next) => {
    await next();
    // Only the default. A handler that sets its own policy — e.g. the attachment
    // download endpoint, which revalidates via `ETag` instead of caching forever —
    // must not be overwritten, and this middleware runs after the handler.
    if (ctx.response.get('Cache-Control') === '') {
      ctx.set('Cache-Control', 'no-store');
    }
  };
}
