/**
 * Checks whether an error is a premature-stream-close error
 * (`ERR_STREAM_PREMATURE_CLOSE`).
 *
 * Koa v3 pipes a stream response body to the socket via `Stream.pipeline`.
 * When a client disconnects mid-stream — e.g. the frontend switching away from
 * an SSE session and aborting its fetch — the destination closes before the
 * source ends, and the pipeline surfaces this error on the app. It is expected
 * and not actionable: the request handler already tears down its subscription
 * on `req` close.
 */
export function isPrematureCloseError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === 'ERR_STREAM_PREMATURE_CLOSE'
  );
}
