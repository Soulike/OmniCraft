/** Verdict emitted by the confirmation agent. */
export type Verdict = 'approved' | 'need_change';

/** Machine-readable marker embedded in each posted review summary. */
export interface ReviewMarker {
  /** HEAD SHA the review covered. */
  readonly reviewedHead: string;
  /** Whether the review approved the change or requires a change. */
  readonly verdict: Verdict;
}

const MARKER_REGEX =
  /<!--\s*ai-review\s+reviewed-head=(\S+)\s+verdict=(approved|need_change)\s*-->/;

/** Renders a {@link ReviewMarker} as its canonical HTML-comment string. */
export function renderMarker(marker: ReviewMarker): string {
  return `<!-- ai-review reviewed-head=${marker.reviewedHead} verdict=${marker.verdict} -->`;
}

/**
 * Extracts the first valid `ai-review` marker from a single review body.
 * Returns `null` when the body contains no well-formed marker.
 */
export function parseMarker(body: string): ReviewMarker | null {
  const match = MARKER_REGEX.exec(body);
  if (!match) {
    return null;
  }
  return {
    reviewedHead: match[1],
    verdict: match[2] as Verdict,
  };
}

/**
 * Scans review bodies in submission order (oldest first) and returns the
 * marker from the most recent body that carries one, or `null` if none do.
 */
export function parseLatestMarker(
  bodies: readonly string[],
): ReviewMarker | null {
  for (let index = bodies.length - 1; index >= 0; index -= 1) {
    const marker = parseMarker(bodies[index]);
    if (marker) {
      return marker;
    }
  }
  return null;
}
