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
  /<!--\s*ai-review\s+reviewed-head=([0-9a-fA-F]{7,64})\s+verdict=(approved|need_change)\s*-->/g;

/** Renders a {@link ReviewMarker} as its canonical HTML-comment string. */
export function renderMarker(marker: ReviewMarker): string {
  return `<!-- ai-review reviewed-head=${marker.reviewedHead} verdict=${marker.verdict} -->`;
}

/**
 * Extracts the `ai-review` marker from a single review body. The confirmation
 * agent writes the marker as the final line of the body (see
 * `prompts/confirm.md`); to enforce that invariant we return the **last**
 * well-formed marker, so trailing text or an injected earlier marker cannot
 * displace the terminal one. Returns `null` when none is present.
 */
export function parseMarker(body: string): ReviewMarker | null {
  const last = [...body.matchAll(MARKER_REGEX)].at(-1);
  if (last === undefined) {
    return null;
  }
  return {
    reviewedHead: last[1],
    verdict: last[2] as Verdict,
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
