import type {Middleware} from 'koa';
import send from 'koa-send';

const API_PREFIX = '/api';
const ASSETS_PREFIX = '/assets/';
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export function serveSpa(distPath: string): Middleware {
  return async (ctx, next) => {
    if (ctx.path.startsWith(API_PREFIX)) {
      await next();
      return;
    }

    if (ctx.method !== 'GET' && ctx.method !== 'HEAD') {
      await next();
      return;
    }

    try {
      const maxAge = ctx.path.startsWith(ASSETS_PREFIX) ? ONE_YEAR_MS : 0;
      await send(ctx, ctx.path, {
        root: distPath,
        index: 'index.html',
        maxAge,
        immutable: maxAge > 0,
      });
    } catch {
      ctx.set('Cache-Control', 'no-cache');
      await send(ctx, '/index.html', {root: distPath});
    }
  };
}
