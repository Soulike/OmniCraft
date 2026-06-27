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
