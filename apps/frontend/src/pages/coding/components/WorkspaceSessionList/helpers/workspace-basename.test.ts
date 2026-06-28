import {describe, expect, it} from 'vitest';

import {workspaceBasename} from './workspace-basename.js';

describe('workspaceBasename', () => {
  it('returns the last path segment', () => {
    expect(workspaceBasename('/a/b')).toBe('b');
  });

  it('ignores a trailing slash', () => {
    expect(workspaceBasename('/a/b/')).toBe('b');
  });

  it('falls back to the full path when there is no segment', () => {
    expect(workspaceBasename('/')).toBe('/');
  });
});
