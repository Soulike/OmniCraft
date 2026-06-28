import {describe, expect, it} from 'vitest';

import {normalizeWorkspacePath} from './normalize-workspace-path.js';

describe('normalizeWorkspacePath', () => {
  it('strips a single trailing slash', () => {
    expect(normalizeWorkspacePath('/a/b/')).toBe('/a/b');
  });

  it('leaves a path without a trailing slash unchanged', () => {
    expect(normalizeWorkspacePath('/a/b')).toBe('/a/b');
  });

  it('keeps the root slash', () => {
    expect(normalizeWorkspacePath('/')).toBe('/');
  });
});
