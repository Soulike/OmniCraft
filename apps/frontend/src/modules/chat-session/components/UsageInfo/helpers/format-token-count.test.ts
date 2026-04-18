import {describe, expect, it} from 'vitest';

import {formatTokenCount} from './format-token-count.js';

describe('formatTokenCount', () => {
  it('returns integer string for values below 1000', () => {
    expect(formatTokenCount(0)).toBe('0');
    expect(formatTokenCount(1)).toBe('1');
    expect(formatTokenCount(567)).toBe('567');
    expect(formatTokenCount(999)).toBe('999');
  });

  it('formats values >= 1000 with one decimal and K suffix', () => {
    expect(formatTokenCount(1000)).toBe('1.0K');
    expect(formatTokenCount(1234)).toBe('1.2K');
    expect(formatTokenCount(2000)).toBe('2.0K');
    expect(formatTokenCount(99900)).toBe('99.9K');
    expect(formatTokenCount(999999)).toBe('1000.0K');
  });

  it('formats values >= 1000000 with one decimal and M suffix', () => {
    expect(formatTokenCount(1000000)).toBe('1.0M');
    expect(formatTokenCount(2345678)).toBe('2.3M');
    expect(formatTokenCount(10000000)).toBe('10.0M');
  });
});
