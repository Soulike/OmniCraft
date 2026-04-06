import type {Middleware} from 'koa';
import send from 'koa-send';

const API_PREFIX = '/api';

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
      await send(ctx, ctx.path, {root: distPath});
    } catch {
      await send(ctx, '/index.html', {root: distPath});
    }
  };
}
