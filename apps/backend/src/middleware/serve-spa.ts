import path from 'node:path';

import type {Middleware} from 'koa';
import send from 'koa-send';

import {fileExists} from '@/helpers/fs.js';

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

    const filePath = path.join(distPath, ctx.path);
    if (await fileExists(filePath)) {
      await send(ctx, ctx.path, {root: distPath});
    } else {
      await send(ctx, '/index.html', {root: distPath});
    }
  };
}
