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
 * Asks the raw `ServerResponse` whether the header is present, rather than
 * reading it back through Koa. Two traps live here, and this sidesteps both:
 * Koa 3's `ctx.response.get()` is a bare `res.getHeader()`, so an unset header
 * reads as `undefined` (Koa 2's `|| ''` normalization is gone) — yet
 * `@types/koa@3.0.3` still declares it as returning `string`, so comparing
 * against `''` both typechecks and never matches. That is what made the first
 * version of this middleware a silent no-op: no `/api` response carried
 * `no-store` at all. Koa's own `response.has()` would work at runtime but is
 * absent from those same types, whereas `hasHeader` is correctly typed by Node
 * and is exactly what `has` delegates to.
 */
export function defaultCacheControl(): Middleware {
  return async (ctx, next) => {
    await next();
    // Only the default. A handler that sets its own policy — e.g. the attachment
    // download endpoint, which revalidates via `ETag` instead of caching forever —
    // must not be overwritten, and this middleware runs after the handler.
    if (!ctx.res.hasHeader('Cache-Control')) {
      ctx.set('Cache-Control', 'no-store');
    }
  };
}
