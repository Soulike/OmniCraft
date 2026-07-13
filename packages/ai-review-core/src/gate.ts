import type {Verdict} from './marker.ts';

/** PR label applied by the gate. */
export type GateLabel = 'AI Approved' | 'AI Need Change';

/** Inputs to {@link decideGate}; all side effects resolved upstream. */
export interface GateInput {
  /** Whether any of config/prepare/review/confirm failed or was cancelled. */
  readonly anyUpstreamFailed: boolean;
  /** Whether this round had new commits to review. */
  readonly hasChanges: boolean;
  /** Verdict carried from the prior review; used only when `!hasChanges`. */
  readonly carriedVerdict: Verdict | null;
  /** Verdict parsed from the freshly posted review; used when `hasChanges`. */
  readonly postedVerdict: Verdict | null;
}

/** Gate outcome: the process exit code and which label to apply (if any). */
export interface GateDecision {
  /** `0` to pass the required check, `1` to block. */
  readonly exitCode: number;
  /** Label to apply, or `null` to leave existing labels untouched. */
  readonly label: GateLabel | null;
}

function fromVerdict(verdict: Verdict): GateDecision {
  if (verdict === 'approved') {
    return {exitCode: 0, label: 'AI Approved'};
  }
  return {exitCode: 1, label: 'AI Need Change'};
}

/**
 * Decides the gate outcome. Fails closed: an incomplete review or a
 * missing/unreadable verdict blocks rather than approves, and never relabels.
 */
export function decideGate(input: GateInput): GateDecision {
  if (input.anyUpstreamFailed) {
    return {exitCode: 1, label: null};
  }

  if (!input.hasChanges) {
    if (input.carriedVerdict === null) {
      return {exitCode: 1, label: null};
    }
    return fromVerdict(input.carriedVerdict);
  }

  if (input.postedVerdict === null) {
    return {exitCode: 1, label: null};
  }
  return fromVerdict(input.postedVerdict);
}
