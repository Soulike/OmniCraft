import {describe, expect, it} from 'vitest';

import {basename, stripTrailingSlash} from './path.js';

describe('stripTrailingSlash', () => {
  it('strips a single trailing slash', () => {
    expect(stripTrailingSlash('/a/b/')).toBe('/a/b');
  });

  it('strips multiple trailing slashes', () => {
    expect(stripTrailingSlash('/a/b//')).toBe('/a/b');
  });

  it('leaves a path without a trailing slash unchanged', () => {
    expect(stripTrailingSlash('/a/b')).toBe('/a/b');
  });

  it('preserves the root path', () => {
    expect(stripTrailingSlash('/')).toBe('/');
  });
});

describe('basename', () => {
  it('returns the last path segment', () => {
    expect(basename('/a/b')).toBe('b');
  });

  it('ignores trailing slashes', () => {
    expect(basename('/a/b//')).toBe('b');
  });

  it('falls back to the full path when there is no segment', () => {
    expect(basename('/')).toBe('/');
  });
});
