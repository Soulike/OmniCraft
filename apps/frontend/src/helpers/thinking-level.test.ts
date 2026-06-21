import {describe, expect, it} from 'vitest';

import {
  getThinkingLevelLabel,
  getThinkingLevelOptions,
} from './thinking-level.js';

describe('getThinkingLevelLabel', () => {
  it('maps each level to its display label', () => {
    expect(getThinkingLevelLabel('none')).toBe('None');
    expect(getThinkingLevelLabel('low')).toBe('Low');
    expect(getThinkingLevelLabel('medium')).toBe('Medium');
    expect(getThinkingLevelLabel('high')).toBe('High');
    expect(getThinkingLevelLabel('xhigh')).toBe('Extra High');
  });
});

describe('getThinkingLevelOptions', () => {
  it('returns all levels as [level, label] pairs in display order', () => {
    expect(getThinkingLevelOptions()).toEqual([
      ['none', 'None'],
      ['low', 'Low'],
      ['medium', 'Medium'],
      ['high', 'High'],
      ['xhigh', 'Extra High'],
    ]);
  });
});
