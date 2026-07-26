import {describe, expect, it} from 'vitest';

import {budgetStem} from './budget-stem.js';

describe('budgetStem', () => {
  it('leaves a stem well within the budget unchanged', () => {
    expect(budgetStem('shot', '.png')).toBe('shot');
  });

  it('falls back to "attachment" when the stem is empty', () => {
    expect(budgetStem('', '.png')).toBe('attachment');
  });

  it('trims an over-long ASCII stem to exactly fit the budget', () => {
    // Budget = 255 (NAME_MAX_BYTES) - 6 (' (100)') - 4 ('.png') = 245.
    const result = budgetStem('a'.repeat(300), '.png');
    expect(result.length).toBe(245);
    expect(Buffer.byteLength(result)).toBe(245);
  });

  it('trims a longer extension out of the same fixed budget', () => {
    // Budget = 255 - 6 (' (100)') - 5 ('.jpeg') = 244.
    const result = budgetStem('a'.repeat(300), '.jpeg');
    expect(result.length).toBe(244);
  });

  it('trims by code point, never splitting a multi-byte character', () => {
    const result = budgetStem('あ'.repeat(90), '.png');
    // Every 'あ' is 3 bytes; a byte-oriented trim could cut one in half and
    // leave an invalid/replacement character behind.
    expect(Buffer.byteLength(result) % 3).toBe(0);
    expect(Array.from(result).every((char) => char === 'あ')).toBe(true);
    expect(Buffer.byteLength(result)).toBeLessThanOrEqual(245);
  });

  it('is idempotent once the stem already fits the budget', () => {
    const once = budgetStem('あ'.repeat(90), '.png');
    const twice = budgetStem(once, '.png');
    expect(twice).toBe(once);
  });
});
