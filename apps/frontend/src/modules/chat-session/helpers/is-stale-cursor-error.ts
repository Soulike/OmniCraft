import {HttpError} from '@/api/helpers/http-error.js';

/**
 * Whether an events-subscription error means the resume cursor is stale.
 *
 * The backend answers `GET …/events?from=N` with HTTP 409 when `N` is past the
 * end of its (rolled-back) log — e.g. after a restart interrupted a turn. The
 * client must then discard its view and replay from index 0.
 */
export function isStaleCursorError(e: unknown): boolean {
  return e instanceof HttpError && e.status === 409;
}
