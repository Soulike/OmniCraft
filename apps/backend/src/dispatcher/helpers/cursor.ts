const CANONICAL_CURSOR_PATTERN = /^(0|[1-9]\d*)$/;

export function parseSseResumeCursor(value: unknown): number {
  if (value === undefined) return 0;

  if (typeof value !== 'string' || !CANONICAL_CURSOR_PATTERN.test(value)) {
    throw new Error('Invalid SSE resume cursor');
  }

  const cursor = Number(value);
  if (!Number.isSafeInteger(cursor)) {
    throw new Error('Invalid SSE resume cursor');
  }

  return cursor;
}

/**
 * Whether a resume cursor points beyond the committed event count.
 *
 * What it does: reports if `startIndex` is past the last event the log
 * actually contains.
 *
 * When to use it: at reconnect, to tell a client its cursor is stale — the
 * server rolled its log back beneath it (e.g. after a restart) — rather than
 * opening an SSE stream that would block forever on an idle agent.
 */
export function isCursorAheadOfLog(
  startIndex: number,
  committedCount: number,
): boolean {
  return startIndex > committedCount;
}
