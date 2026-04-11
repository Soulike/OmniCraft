import {describe, expect, it} from 'vitest';

import {isSubPath, isSubPathOrSelf} from './path-access.js';

describe('isSubPath', () => {
  it('returns true for a direct child', () => {
    expect(isSubPath('/home/user', '/home/user/file.txt')).toBe(true);
  });

  it('returns true for a nested child', () => {
    expect(isSubPath('/home/user', '/home/user/a/b/c.txt')).toBe(true);
  });

  it('returns false for the parent itself', () => {
    expect(isSubPath('/home/user', '/home/user')).toBe(false);
  });

  it('returns false for a sibling directory', () => {
    expect(isSubPath('/home/user', '/home/other/file.txt')).toBe(false);
  });

  it('returns false for path traversal', () => {
    expect(isSubPath('/home/user', '/home/user/../other/file.txt')).toBe(false);
  });

  it('returns false for prefix trick (userdata vs user)', () => {
    expect(isSubPath('/home/user', '/home/userdata/file.txt')).toBe(false);
  });
});

describe('isSubPathOrSelf', () => {
  it('returns true when child is strictly inside parent', () => {
    expect(isSubPathOrSelf('/a/b', '/a/b/c')).toBe(true);
  });

  it('returns true when child equals parent', () => {
    expect(isSubPathOrSelf('/a/b', '/a/b')).toBe(true);
  });

  it('returns false when child is outside parent', () => {
    expect(isSubPathOrSelf('/a/b', '/a/c')).toBe(false);
  });

  it('returns false for prefix-but-not-subpath', () => {
    expect(isSubPathOrSelf('/a/b', '/a/bc')).toBe(false);
  });
});
