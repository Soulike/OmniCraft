import {describe, expect, it} from 'vitest';

import {getDisplayFileName} from './get-display-file-name.js';

describe('getDisplayFileName', () => {
  it.each([
    ['src/index.ts', 'index.ts'],
    [String.raw`C:\project\src\App.tsx`, 'App.tsx'],
    ['src/components/', 'components'],
    ['C:\\project\\src\\', 'src'],
    ['README.md', 'README.md'],
    ['', ''],
  ])('returns the display file name for %s', (filePath, expected) => {
    expect(getDisplayFileName(filePath)).toBe(expected);
  });
});
