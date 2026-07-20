import type {IncomingMessage, ServerResponse} from 'node:http';

import type {Middleware} from 'koa';
import pinoLogger from 'koa-pino-logger';
import type pino from 'pino';

import {logger} from '@/logger.js';

/**
 * Log level for a completed request. Successful responses are silenced to keep
 * the dev log readable; only failed requests are recorded — client errors
 * (4xx) as warnings, server errors (5xx) or thrown requests as errors.
 */
export function requestLogLevel(
  _req: IncomingMessage,
  res: ServerResponse,
  err?: Error,
): pino.LevelWithSilent {
  if (err || res.statusCode >= 500) return 'error';
  if (res.statusCode >= 400) return 'warn';
  return 'silent';
}

export function requestLogger(): Middleware {
  return pinoLogger({logger, customLogLevel: requestLogLevel});
}
