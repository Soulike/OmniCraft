import {describe, expect, it} from 'vitest';

import {collapseLineTerminators, hasLineTerminator} from './unicode.js';

const TERMINATORS = [0x0a, 0x0b, 0x0c, 0x0d, 0x85, 0x2028, 0x2029].map((cp) =>
  String.fromCodePoint(cp),
);

describe('hasLineTerminator', () => {
  it('detects every Unicode line terminator', () => {
    for (const sep of TERMINATORS) {
      expect(hasLineTerminator(`a${sep}b`)).toBe(true);
    }
  });

  it('returns false for single-line text (incl. accents, CJK, emoji)', () => {
    expect(hasLineTerminator('café 完成 🚀 done')).toBe(false);
  });
});

describe('collapseLineTerminators', () => {
  it('replaces every terminator run with a single space', () => {
    for (const sep of TERMINATORS) {
      expect(collapseLineTerminators(`a${sep}${sep}b`)).toBe('a b');
    }
  });

  it('leaves terminator-free text untouched', () => {
    expect(collapseLineTerminators('already one line')).toBe(
      'already one line',
    );
  });
});
