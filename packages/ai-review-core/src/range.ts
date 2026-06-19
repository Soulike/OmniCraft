import type {ReviewMarker, Verdict} from './marker.js';

/** Inputs to {@link resolveReviewRange}; all side effects resolved upstream. */
export interface ResolveRangeInput {
  /** Current PR head SHA. */
  readonly headSha: string;
  /** Marker from the most recent prior review, or `null` on the first run. */
  readonly previousMarker: ReviewMarker | null;
  /**
   * Result of `git merge-base --is-ancestor <previousMarker.reviewedHead> <headSha>`.
   * Meaningless (and ignored) when `previousMarker` is `null`.
   */
  readonly startIsAncestorOfHead: boolean;
}

/** What to review this round. */
export interface ReviewRange {
  /** SHA to diff from, or `null` for a full `base...head` review. */
  readonly startSha: string | null;
  /** Whether this is a full-PR review (first run or history rewrite). */
  readonly isFull: boolean;
  /** Whether there are new commits to review. */
  readonly hasChanges: boolean;
  /** Prior verdict to carry forward; only set when `hasChanges` is `false`. */
  readonly carriedVerdict: Verdict | null;
}

/**
 * Decides the review range from SHAs, the prior marker, and a precomputed
 * ancestry check. Full review on first run or when the prior reviewed-head is
 * not an ancestor of head (force-push/rebase); incremental otherwise; and when
 * head is unchanged, no new commits and the prior verdict carries forward.
 */
export function resolveReviewRange(input: ResolveRangeInput): ReviewRange {
  const {headSha, previousMarker, startIsAncestorOfHead} = input;

  if (previousMarker === null) {
    return {
      startSha: null,
      isFull: true,
      hasChanges: true,
      carriedVerdict: null,
    };
  }

  if (!startIsAncestorOfHead) {
    return {
      startSha: null,
      isFull: true,
      hasChanges: true,
      carriedVerdict: null,
    };
  }

  if (previousMarker.reviewedHead === headSha) {
    return {
      startSha: headSha,
      isFull: false,
      hasChanges: false,
      carriedVerdict: previousMarker.verdict,
    };
  }

  return {
    startSha: previousMarker.reviewedHead,
    isFull: false,
    hasChanges: true,
    carriedVerdict: null,
  };
}
