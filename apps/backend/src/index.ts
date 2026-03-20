import assert from 'node:assert';

import {bodyParser} from '@koa/bodyparser';
import cors from '@koa/cors';
import Koa from 'koa';
import pinoLogger from 'koa-pino-logger';

import {dispatcher} from '@/dispatcher/index.js';
import {logger} from '@/logger.js';

const port = Number(process.env.PORT);
assert(port, 'PORT is required in .env');

const app = new Koa();
app.proxy = true;

app.on('error', (e: unknown) => {
  logger.error(e, 'Uncaught error');
});

app.use(pinoLogger({logger}));
app.use(cors());
app.use(bodyParser());
app.use(dispatcher());

app.listen(port, () => {
  logger.info(`Server is listening on port ${port.toString()}`);
});
