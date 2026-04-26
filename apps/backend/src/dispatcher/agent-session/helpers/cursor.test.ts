import {describe, expect, it} from 'vitest';

import {parseSseResumeCursor} from './cursor.js';

describe('parseSseResumeCursor', () => {
  it('defaults a missing cursor to zero', () => {
    expect(parseSseResumeCursor(undefined)).toBe(0);
  });

  it('parses a canonical non-negative integer cursor', () => {
    expect(parseSseResumeCursor('3')).toBe(3);
  });

  it('rejects non-integer cursors', () => {
    expect(() => parseSseResumeCursor('1.5')).toThrow();
  });

  it('rejects infinite cursors', () => {
    expect(() => parseSseResumeCursor('Infinity')).toThrow();
  });
});
