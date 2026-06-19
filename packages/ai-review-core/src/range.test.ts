import {describe, expect, it} from 'vitest';

import {resolveReviewRange} from './range.js';

describe('resolveReviewRange', () => {
  it('is a full review on the first run (no prior marker)', () => {
    const result = resolveReviewRange({
      headSha: 'head1',
      baseSha: 'base1',
      previousMarker: null,
      startIsAncestorOfHead: false,
    });
    expect(result).toEqual({
      startSha: null,
      isFull: true,
      hasChanges: true,
      carriedVerdict: null,
    });
  });

  it('is incremental when the prior reviewed-head is an ancestor of head', () => {
    const result = resolveReviewRange({
      headSha: 'head2',
      baseSha: 'base1',
      previousMarker: {reviewedHead: 'mid1', verdict: 'approved'},
      startIsAncestorOfHead: true,
    });
    expect(result).toEqual({
      startSha: 'mid1',
      isFull: false,
      hasChanges: true,
      carriedVerdict: null,
    });
  });

  it('falls back to a full review when history was rewritten', () => {
    // prior reviewed-head is no longer reachable from head (force-push/rebase)
    const result = resolveReviewRange({
      headSha: 'head3',
      baseSha: 'base1',
      previousMarker: {reviewedHead: 'gone1', verdict: 'need_change'},
      startIsAncestorOfHead: false,
    });
    expect(result).toEqual({
      startSha: null,
      isFull: true,
      hasChanges: true,
      carriedVerdict: null,
    });
  });

  it('carries the prior verdict when head is unchanged since the marker', () => {
    const result = resolveReviewRange({
      headSha: 'samehead',
      baseSha: 'base1',
      previousMarker: {reviewedHead: 'samehead', verdict: 'approved'},
      startIsAncestorOfHead: true,
    });
    expect(result).toEqual({
      startSha: 'samehead',
      isFull: false,
      hasChanges: false,
      carriedVerdict: 'approved',
    });
  });
});
