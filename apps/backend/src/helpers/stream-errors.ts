import type {IncomingMessage} from 'node:http';

/**
 * Checks whether an error is a premature-stream-close error
 * (`ERR_STREAM_PREMATURE_CLOSE`).
 *
 * Koa v3 pipes a stream response body to the socket via `Stream.pipeline`.
 * The pipeline surfaces this error on the app whenever either end closes before
 * the stream completes — the client dropping the socket, or the source being
 * truncated.
 */
export function isPrematureCloseError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === 'ERR_STREAM_PREMATURE_CLOSE'
  );
}

/**
 * Checks whether `error` is a premature stream close caused by the client
 * disconnecting mid-response — the request socket was destroyed — rather than
 * a source-side truncation.
 *
 * Client disconnects are expected and not actionable (e.g. the frontend
 * switching away from an SSE session and aborting its fetch; the handler already
 * tears down its subscription on `req` close). A source-side truncation leaves
 * the request alive, so it is a genuine error worth logging.
 */
export function isClientDisconnectError(
  error: unknown,
  req: IncomingMessage,
): boolean {
  return isPrematureCloseError(error) && req.destroyed;
}
