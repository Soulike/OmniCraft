import {describe, expect, it} from 'vitest';

import {parseSessionId} from './session-id.js';

describe('parseSessionId', () => {
  it('returns the id for a well-formed UUID', () => {
    const id = 'b7e3f074-c203-486f-941b-bf9648e2e010';
    expect(parseSessionId(id)).toBe(id);
  });

  it('returns null for a non-UUID string', () => {
    expect(parseSessionId('not-a-uuid')).toBeNull();
    expect(parseSessionId('')).toBeNull();
  });

  it('returns null for path-traversal attempts', () => {
    expect(parseSessionId('../../etc/passwd')).toBeNull();
    expect(parseSessionId('..%2f..%2fsecret')).toBeNull();
    expect(parseSessionId('b7e3f074/../..')).toBeNull();
  });
});
