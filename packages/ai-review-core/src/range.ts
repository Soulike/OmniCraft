import type {ReviewMarker, Verdict} from './marker.ts';

/** Inputs to {@link resolveReviewRange}; all side effects resolved upstream. */
export interface ResolveRangeInput {
  /** Current PR head SHA. */
  readonly headSha: string;
  /** Marker from the most recent prior review, or `null` on the first run. */
  readonly previousMarker: ReviewMarker | null;
}

/** Whether to review this round, and any verdict carried when skipping. */
export interface ReviewRange {
  /** Whether the PR head changed since the last review (so a review is due). */
  readonly hasChanges: boolean;
  /** Prior verdict to carry forward; only set when `hasChanges` is `false`. */
  readonly carriedVerdict: Verdict | null;
}

/**
 * Decides whether a full review is due. Reviews on the first run and whenever
 * the head SHA differs from the last reviewed head; when the head is unchanged
 * there is nothing new to review, so the prior verdict carries forward. The diff
 * range itself is always the full `base...head` and is computed by the workflow,
 * not here.
 */
export function resolveReviewRange(input: ResolveRangeInput): ReviewRange {
  const {headSha, previousMarker} = input;

  if (previousMarker !== null && previousMarker.reviewedHead === headSha) {
    return {hasChanges: false, carriedVerdict: previousMarker.verdict};
  }

  return {hasChanges: true, carriedVerdict: null};
}
