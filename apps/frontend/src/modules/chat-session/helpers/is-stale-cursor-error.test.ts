import {describe, expect, it} from 'vitest';

import {HttpError} from '@/api/helpers/http-error.js';

import {isStaleCursorError} from './is-stale-cursor-error.js';

describe('isStaleCursorError', () => {
  it('is true for an HttpError with status 409', () => {
    expect(isStaleCursorError(new HttpError(409, 'cursor_ahead_of_log'))).toBe(
      true,
    );
  });

  it('is false for other HttpError statuses', () => {
    expect(isStaleCursorError(new HttpError(500, 'server error'))).toBe(false);
    expect(isStaleCursorError(new HttpError(404, 'not found'))).toBe(false);
  });

  it('is false for non-HttpError values', () => {
    expect(isStaleCursorError(new TypeError('network'))).toBe(false);
    expect(isStaleCursorError(undefined)).toBe(false);
  });
});
