import {describe, expect, it} from 'vitest';

import {isCursorAheadOfLog, parseSseResumeCursor} from './cursor.js';

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

describe('isCursorAheadOfLog', () => {
  it('is false when the cursor is within the committed log', () => {
    expect(isCursorAheadOfLog(3, 5)).toBe(false);
  });

  it('is false when the cursor is exactly caught up', () => {
    expect(isCursorAheadOfLog(5, 5)).toBe(false);
  });

  it('is true when the cursor is beyond the committed log', () => {
    expect(isCursorAheadOfLog(6, 5)).toBe(true);
  });
});
