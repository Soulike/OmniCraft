import assert from 'node:assert';
import path from 'node:path';

import {bodyParser} from '@koa/bodyparser';
import type {Context} from 'koa';
import Koa from 'koa';

import {dispatcher} from '@/dispatcher/index.js';
import {fileExists} from '@/helpers/fs.js';
import {ShellCommandRunner} from '@/helpers/shell-command-runner.js';
import {isClientDisconnectError} from '@/helpers/stream-errors.js';
import {logger} from '@/logger.js';
import {requestLogger} from '@/middleware/request-logger.js';
import {serveSpa} from '@/middleware/serve-spa.js';
import {VscodeServerManager} from '@/models/vscode-server-manager/index.js';
import {initServices} from '@/startup/index.js';

const port = Number(process.env.PORT);
assert(port, 'PORT is required in .env');

await initServices();

const app = new Koa();
app.proxy = true;

app.on('error', (e: unknown, ctx?: Context) => {
  // A client disconnecting mid-stream (e.g. the frontend switching SSE
  // sessions) makes Koa's response pipeline emit ERR_STREAM_PREMATURE_CLOSE.
  // The connection is already cleaned up on `req` close — drop that noise, but
  // still log source-side truncations, which leave the request alive.
  if (ctx !== undefined && isClientDisconnectError(e, ctx.req)) return;
  logger.error(e, 'Uncaught error');
});

app.use(requestLogger());
app.use(bodyParser());
app.use(dispatcher());

const frontendDistPath = path.resolve(
  import.meta.dirname,
  '../../frontend/dist',
);
if (await fileExists(frontendDistPath)) {
  app.use(serveSpa(frontendDistPath));
  logger.info({path: frontendDistPath}, 'Serving frontend static files');
} else {
  logger.warn(
    {path: frontendDistPath},
    'Frontend dist not found, skipping SPA serving',
  );
}

app.listen(port, () => {
  logger.info(`Server is listening on port ${port.toString()}`);
});

process.on('exit', () => {
  ShellCommandRunner.killAll();
  VscodeServerManager.resetInstance();
});
