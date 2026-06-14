import {describe, expect, it} from 'vitest';

import {getNextThemeMode} from './getNextThemeMode.js';

describe('getNextThemeMode', () => {
  it('cycles light to dark', () => {
    expect(getNextThemeMode('light')).toBe('dark');
  });

  it('cycles dark to system', () => {
    expect(getNextThemeMode('dark')).toBe('system');
  });

  it('cycles system back to light', () => {
    expect(getNextThemeMode('system')).toBe('light');
  });
});
