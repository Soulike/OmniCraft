declare module 'koa-pino-logger' {
  import type {Middleware} from 'koa';
  import type {DestinationStream,Logger} from 'pino';
  import type {Options} from 'pino-http';

  export default function koaPinoLogger(
    opts?: Options,
    stream?: DestinationStream,
  ): Middleware;

  module 'koa' {
    interface ExtendableContext {
      log: Logger;
    }
  }
}
