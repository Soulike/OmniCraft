import type {IncomingMessage} from 'node:http';

import {describe, expect, it} from 'vitest';

import {
  isClientDisconnectError,
  isPrematureCloseError,
} from './stream-errors.js';

function fakeReq(destroyed: boolean): IncomingMessage {
  return {destroyed} as unknown as IncomingMessage;
}

const prematureCloseError = Object.assign(new Error('Premature close'), {
  code: 'ERR_STREAM_PREMATURE_CLOSE',
});

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

describe('isClientDisconnectError', () => {
  it('returns true for a premature close when the request was destroyed', () => {
    expect(isClientDisconnectError(prematureCloseError, fakeReq(true))).toBe(
      true,
    );
  });

  it('returns false for a premature close when the request is still alive', () => {
    // Source-side truncation: the client is still connected, so this is a
    // genuine error that must still be logged.
    expect(isClientDisconnectError(prematureCloseError, fakeReq(false))).toBe(
      false,
    );
  });

  it('returns false for a non-premature-close error even if the request was destroyed', () => {
    const other = Object.assign(new Error('boom'), {code: 'ECONNRESET'});
    expect(isClientDisconnectError(other, fakeReq(true))).toBe(false);
  });
});
