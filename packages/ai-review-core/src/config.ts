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
  /** Comma-separated general-review model IDs (`GENERAL_MODELS`). */
  readonly generalModels: string;
  /** Comma-separated security-review model IDs (`SECURITY_MODELS`). */
  readonly securityModels: string;
  /** Single confirmation model ID (`CONFIRM_MODEL`). */
  readonly confirmModel: string;
  /** General-review reasoning effort (`GENERAL_EFFORT`). */
  readonly generalEffort: string;
  /** Security-review reasoning effort (`SECURITY_EFFORT`). */
  readonly securityEffort: string;
  /** Confirmation reasoning effort (`CONFIRM_EFFORT`). */
  readonly confirmEffort: string;
}

/** Validated, normalized per-stage config. */
export interface ReviewConfig {
  readonly general: {
    readonly models: string[];
    readonly effort: ReasoningEffort;
  };
  readonly security: {
    readonly models: string[];
    readonly effort: ReasoningEffort;
  };
  readonly confirm: {
    readonly model: string;
    readonly effort: ReasoningEffort;
  };
}

function isReasoningEffort(value: string): value is ReasoningEffort {
  return (REASONING_EFFORTS as readonly string[]).includes(value);
}

/**
 * Parses a comma-separated model list. A stage may list a single model, but the
 * list must be non-blank and free of duplicates. `varName` names the offending
 * variable in thrown errors.
 */
function parseModelList(raw: string, varName: string): string[] {
  const models = raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  if (models.length < 1) {
    throw new Error(`${varName} must list at least one model ID.`);
  }

  if (new Set(models).size !== models.length) {
    throw new Error(`${varName} must not contain duplicate model IDs.`);
  }

  return models;
}

/** Validates one reasoning-effort string. `varName` names it in errors. */
function parseEffort(raw: string, varName: string): ReasoningEffort {
  const effort = raw.trim();
  if (!isReasoningEffort(effort)) {
    throw new Error(
      `${varName} must be one of: ${REASONING_EFFORTS.join('|')}.`,
    );
  }
  return effort;
}

/**
 * Validates raw model config. Throws a clear {@link Error} (naming the offending
 * variable) on any shape problem; returns the normalized {@link ReviewConfig}
 * on success. Performs format/shape checks only — whether a model is available
 * on the Copilot plan is not (and cannot be) checked here.
 */
export function validateReviewConfig(raw: RawReviewConfig): ReviewConfig {
  const confirmModel = raw.confirmModel.trim();
  if (confirmModel.length === 0) {
    throw new Error('CONFIRM_MODEL must be a single non-blank model ID.');
  }

  return {
    general: {
      models: parseModelList(raw.generalModels, 'GENERAL_MODELS'),
      effort: parseEffort(raw.generalEffort, 'GENERAL_EFFORT'),
    },
    security: {
      models: parseModelList(raw.securityModels, 'SECURITY_MODELS'),
      effort: parseEffort(raw.securityEffort, 'SECURITY_EFFORT'),
    },
    confirm: {
      model: confirmModel,
      effort: parseEffort(raw.confirmEffort, 'CONFIRM_EFFORT'),
    },
  };
}
