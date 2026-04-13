import assert from 'node:assert';
import path from 'node:path';

import {bodyParser} from '@koa/bodyparser';
import Koa from 'koa';
import pinoLogger from 'koa-pino-logger';

import {dispatcher} from '@/dispatcher/index.js';
import {attachVscodeUpgrade} from '@/dispatcher/vscode/index.js';
import {fileExists} from '@/helpers/fs.js';
import {ShellCommandRunner} from '@/helpers/shell-command-runner.js';
import {logger} from '@/logger.js';
import {serveSpa} from '@/middleware/serve-spa.js';
import {VscodeServerManager} from '@/models/vscode-server-manager/index.js';
import {initServices} from '@/startup/index.js';

const port = Number(process.env.PORT);
assert(port, 'PORT is required in .env');

await initServices();

const app = new Koa();
app.proxy = true;

app.on('error', (e: unknown) => {
  logger.error(e, 'Uncaught error');
});

app.use(pinoLogger({logger}));
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

const server = app.listen(port, () => {
  logger.info(`Server is listening on port ${port.toString()}`);
});

attachVscodeUpgrade(server);

process.on('exit', () => {
  ShellCommandRunner.killAll();
  VscodeServerManager.resetInstance();
});
