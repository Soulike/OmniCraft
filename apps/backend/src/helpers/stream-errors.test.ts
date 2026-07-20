import {describe, expect, it} from 'vitest';

import {isPrematureCloseError} from './stream-errors.js';

describe('isPrematureCloseError', () => {
  it('returns true for an error with code ERR_STREAM_PREMATURE_CLOSE', () => {
    const error = Object.assign(new Error('Premature close'), {
      code: 'ERR_STREAM_PREMATURE_CLOSE',
    });
    expect(isPrematureCloseError(error)).toBe(true);
  });

  it('returns false for an error with a different code', () => {
    const error = Object.assign(new Error('not found'), {code: 'ENOENT'});
    expect(isPrematureCloseError(error)).toBe(false);
  });

  it('returns false for an error without a code', () => {
    expect(isPrematureCloseError(new Error('boom'))).toBe(false);
  });

  it('returns false for non-error values that merely carry the code', () => {
    expect(isPrematureCloseError({code: 'ERR_STREAM_PREMATURE_CLOSE'})).toBe(
      false,
    );
    expect(isPrematureCloseError(null)).toBe(false);
    expect(isPrematureCloseError('ERR_STREAM_PREMATURE_CLOSE')).toBe(false);
  });
});
