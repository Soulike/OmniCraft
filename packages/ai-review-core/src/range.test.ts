import {describe, expect, it} from 'vitest';

import {resolveReviewRange} from './range.js';

describe('resolveReviewRange', () => {
  it('reviews on the first run (no prior marker)', () => {
    const result = resolveReviewRange({
      headSha: 'aaaaaaa',
      previousMarker: null,
    });
    expect(result).toEqual({hasChanges: true, carriedVerdict: null});
  });

  it('reviews when the head changed since the prior marker', () => {
    const result = resolveReviewRange({
      headSha: 'bbbbbbb',
      previousMarker: {reviewedHead: 'aaaaaaa', verdict: 'approved'},
    });
    expect(result).toEqual({hasChanges: true, carriedVerdict: null});
  });

  it('skips and carries the prior verdict when head is unchanged', () => {
    const result = resolveReviewRange({
      headSha: 'aaaaaaa',
      previousMarker: {reviewedHead: 'aaaaaaa', verdict: 'approved'},
    });
    expect(result).toEqual({hasChanges: false, carriedVerdict: 'approved'});
  });

  it('carries a need_change verdict when head is unchanged', () => {
    const result = resolveReviewRange({
      headSha: 'aaaaaaa',
      previousMarker: {reviewedHead: 'aaaaaaa', verdict: 'need_change'},
    });
    expect(result).toEqual({hasChanges: false, carriedVerdict: 'need_change'});
  });
});
