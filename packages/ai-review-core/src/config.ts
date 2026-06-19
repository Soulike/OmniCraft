/** Reasoning-effort levels accepted by the Copilot CLI `--effort` flag. */
export const REASONING_EFFORTS = [
  'none',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const;

/** A single accepted reasoning-effort level. */
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

/** Raw env-string config as read from the workflow. */
export interface RawReviewConfig {
  /** Comma-separated reviewer model IDs (`REVIEWER_MODELS`). */
  readonly reviewerModels: string;
  /** Single confirmation model ID (`CONFIRM_MODEL`). */
  readonly confirmModel: string;
  /** Reasoning effort level (`REASONING_EFFORT`). */
  readonly reasoningEffort: string;
}

/** Validated, normalized config. */
export interface ReviewConfig {
  /** Distinct, non-blank reviewer model IDs, in declared order. */
  readonly reviewerModels: string[];
  /** Confirmation model ID. */
  readonly confirmModel: string;
  /** Validated reasoning-effort level. */
  readonly reasoningEffort: ReasoningEffort;
}

function isReasoningEffort(value: string): value is ReasoningEffort {
  return (REASONING_EFFORTS as readonly string[]).includes(value);
}

/**
 * Validates raw model config. Throws a clear {@link Error} (naming the offending
 * variable) on any shape problem; returns the normalized {@link ReviewConfig}
 * on success. Performs format/shape checks only — whether a model is available
 * on the Copilot plan is not (and cannot be) checked here.
 */
export function validateReviewConfig(raw: RawReviewConfig): ReviewConfig {
  const reviewerModels = raw.reviewerModels
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  if (reviewerModels.length === 0) {
    throw new Error(
      'REVIEWER_MODELS must contain at least one non-blank model ID.',
    );
  }

  const unique = new Set(reviewerModels);
  if (unique.size !== reviewerModels.length) {
    throw new Error('REVIEWER_MODELS must not contain duplicate model IDs.');
  }

  const confirmModel = raw.confirmModel.trim();
  if (confirmModel.length === 0) {
    throw new Error('CONFIRM_MODEL must be a single non-blank model ID.');
  }

  const reasoningEffort = raw.reasoningEffort.trim();
  if (!isReasoningEffort(reasoningEffort)) {
    throw new Error(
      `REASONING_EFFORT must be one of: ${REASONING_EFFORTS.join('|')}.`,
    );
  }

  return {reviewerModels, confirmModel, reasoningEffort};
}
