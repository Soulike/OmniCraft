import assert from 'node:assert';

import {bodyParser} from '@koa/bodyparser';
import Koa from 'koa';
import pinoLogger from 'koa-pino-logger';

import {dispatcher} from '@/dispatcher/index.js';
import {ShellCommandRunner} from '@/helpers/shell-command-runner.js';
import {logger} from '@/logger.js';
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

app.listen(port, () => {
  logger.info(`Server is listening on port ${port.toString()}`);
});

process.on('exit', () => {
  ShellCommandRunner.killAll();
});
